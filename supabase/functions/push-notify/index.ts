import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supa = createClient(url, service);

    // identify the caller from their JWT
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user: caller } } = await supa.auth.getUser(jwt);
    if (!caller) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const type = body.type as string;

    // resolve VAPID
    const { data: cfg } = await supa.from('push_config').select('*').eq('id', 1).single();
    if (!cfg) return json({ error: 'push not configured' }, 500);
    webpush.setVapidDetails(cfg.subject, cfg.vapid_public, cfg.vapid_private);

    let recipients: string[] = [];
    let title = 'Timekeeper';
    let msgBody = '';
    // the notification_settings event this push stands for, so it is routed like the same event from the database
    let event = 'task_new';
    const link = '/#/inbox';

    const callerName = (await supa.from('profiles').select('full_name, role').eq('id', caller.id).single()).data;

    if (type === 'task_assigned') {
      if (!callerName || !['admin', 'manager'].includes(callerName.role)) return json({ error: 'forbidden' }, 403);
      const { data: task } = await supa.from('assigned_tasks').select('title, assignee_employee_id').eq('id', body.id).single();
      if (!task?.assignee_employee_id) return json({ sent: 0, reason: 'no assignee' });
      const { data: emp } = await supa.from('employees').select('user_id').eq('id', task.assignee_employee_id).single();
      if (!emp?.user_id) return json({ sent: 0, reason: 'assignee has no account' });
      recipients = [emp.user_id];
      title = 'New task assigned';
      msgBody = task.title ?? 'You have a new task';
      event = 'task_new';
    } else if (type === 'approval_request') {
      const { data: mgrs } = await supa.from('profiles').select('id').in('role', ['admin', 'manager', 'hr']);
      recipients = (mgrs ?? []).map((m: { id: string }) => m.id).filter((id: string) => id !== caller.id);
      const label = body.label ?? 'a request';
      title = 'New request to review';
      msgBody = `${callerName?.full_name ?? 'An employee'} submitted ${label}`;
      event = 'req_new';
    } else {
      return json({ error: 'unknown type' }, 400);
    }

    if (recipients.length === 0) return json({ sent: 0 });
    const { data: subs } = await supa.rpc('push_targets', { p_users: recipients, p_event: event });
    const payload = JSON.stringify({ title, body: msgBody, url: link });

    let sent = 0;
    const stale: string[] = [];
    await Promise.all((subs ?? []).map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) stale.push(s.endpoint);
      }
    }));
    if (stale.length) await supa.from('push_subscriptions').delete().in('endpoint', stale);

    return json({ sent, recipients: recipients.length, pruned: stale.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
