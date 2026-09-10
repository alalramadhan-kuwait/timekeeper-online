// Cron-driven notification dispatcher. Runs every 30s (pg_cron job "notify-flush").
// Delivers due rows from public.notifications, batches PO events into a summary,
// and respects the bulk-summary toggle. Secret is read from app_config (service-role only).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: keyRow } = await supa.from('app_config').select('value').eq('id', 'notify_key').single();
    if (!keyRow || req.headers.get('x-notify-key') !== keyRow.value) return json({ error: 'forbidden' }, 403);

    const { data: due } = await supa.from('notifications').select('*')
      .is('delivered_at', null).lte('send_after', new Date().toISOString()).order('created_at');
    if (!due || due.length === 0) return json({ sent: 0 });

    const { data: cfgRow } = await supa.from('notification_config').select('bulk_summary_enabled').eq('id', 1).single();
    const bulk = cfgRow?.bulk_summary_enabled !== false;
    const { data: cfg } = await supa.from('push_config').select('*').eq('id', 1).single();
    webpush.setVapidDetails(cfg.subject, cfg.vapid_public, cfg.vapid_private);
    const { data: profs } = await supa.from('profiles').select('id, role');
    const roleIds = (roles: string[]) => (profs ?? []).filter((p: any) => roles.includes(p.role)).map((p: any) => p.id);

    async function sendToUsers(ids: string[], payload: string) {
      const set = [...new Set(ids)];
      if (set.length === 0) return 0;
      const { data: subs } = await supa.from('push_subscriptions').select('*').in('user_id', set);
      let sent = 0; const stale: string[] = [];
      await Promise.all((subs ?? []).map(async (s: any) => {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); sent++; }
        catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) stale.push(s.endpoint); }
      }));
      if (stale.length) await supa.from('push_subscriptions').delete().in('endpoint', stale);
      return sent;
    }
    const recipientsOf = (n: any) => {
      const ids = new Set<string>();
      if (n.person_user_id) ids.add(n.person_user_id);
      if (Array.isArray(n.audience_roles) && n.audience_roles.length) roleIds(n.audience_roles).forEach((id) => ids.add(id));
      if (n.exclude_user) ids.delete(n.exclude_user);
      return [...ids];
    };

    const po = bulk ? due.filter((n: any) => (n.event_type as string).startsWith('po_')) : [];
    const others = bulk ? due.filter((n: any) => !(n.event_type as string).startsWith('po_')) : due;
    let sent = 0;

    for (const n of others) sent += await sendToUsers(recipientsOf(n), JSON.stringify({ title: n.title, body: n.body, url: n.url || '#/inbox' }));
    await Promise.all(others.map((n: any) => supa.from('notifications').update({ delivered_at: new Date().toISOString() }).eq('id', n.id)));

    if (po.length === 1) {
      const n = po[0];
      sent += await sendToUsers(recipientsOf(n), JSON.stringify({ title: n.title, body: n.body, url: n.url || '#/purchase-orders' }));
    } else if (po.length > 1) {
      const c: Record<string, number> = { po_new: 0, po_status: 0, po_ship: 0, po_pay: 0 };
      for (const n of po) c[n.event_type] = (c[n.event_type] ?? 0) + 1;
      const parts: string[] = [];
      if (c.po_new) parts.push(`${c.po_new} new`);
      if (c.po_status) parts.push(`${c.po_status} status`);
      if (c.po_ship) parts.push(`${c.po_ship} shipment`);
      if (c.po_pay) parts.push(`${c.po_pay} payment`);
      let brands: string[] = [];
      const ids = [...new Set(po.map((n: any) => n.record_id).filter(Boolean))];
      if (ids.length) {
        const { data: pos } = await supa.from('purchase_orders').select('brand').in('id', ids);
        brands = [...new Set((pos ?? []).map((p: any) => p.brand).filter(Boolean))];
      }
      const body = (po.length <= 5 && brands.length > 0 && brands.length <= 6)
        ? `${po.length} POs updated · ${brands.join(', ')}`
        : `${po.length} POs updated (${parts.join(' · ')})`;
      await supa.from('notifications').insert({ event_type: 'po_summary', title: 'Lightspeed sync', body, url: '#/purchase-orders', audience_roles: ['admin', 'manager'], delivered_at: new Date().toISOString() });
      sent += await sendToUsers(roleIds(['admin', 'manager']), JSON.stringify({ title: 'Lightspeed sync', body, url: '#/purchase-orders' }));
    }
    if (po.length) await Promise.all(po.map((n: any) => supa.from('notifications').update({ delivered_at: new Date().toISOString() }).eq('id', n.id)));

    return json({ sent, processed: due.length, po: po.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
