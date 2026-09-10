// Sends a test push to the calling admin (used by Notification Settings → "Send test").
// Auth is the caller's JWT (verify_jwt = true) — no shared secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await supa.auth.getUser(jwt);
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { data: cfg } = await supa.from('push_config').select('*').eq('id', 1).single();
    if (!cfg) return json({ error: 'push not configured' }, 500);
    webpush.setVapidDetails(cfg.subject, cfg.vapid_public, cfg.vapid_private);

    const { data: sub } = await supa.from('push_subscriptions').select('*').eq('user_id', user.id);
    if (!sub || sub.length === 0) return json({ sent: 0, error: 'You have not enabled notifications on this device yet.' });

    const { data: n } = await supa.from('notifications').insert({
      event_type: 'test', title: 'Test notification', body: 'This is a test from Notification Settings ✅',
      url: '#/inbox', person_user_id: user.id, delivered_at: new Date().toISOString(),
    }).select('id').single();
    const url = `#/inbox?n=${n?.id}`;
    const payload = JSON.stringify({ title: 'Test notification', body: 'This is a test from Notification Settings ✅', url });

    let sent = 0; const stale: string[] = [];
    await Promise.all(sub.map(async (s: any) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); sent++; }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) stale.push(s.endpoint); }
    }));
    if (stale.length) await supa.from('push_subscriptions').delete().in('endpoint', stale);
    return json({ sent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
