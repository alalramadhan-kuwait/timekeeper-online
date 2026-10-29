// The Time Keeper video studio's server: the owner's web app (video-director/studio-app) and Claude meet here.
// It keeps the studio's own schema (studio.*) and its private bucket (studio-media); the shop's tables are never touched.
// verify_jwt = false: the studio signs the owner in with its own passcode, so no auth user (and no staff profile) exists.
// The studio schema is not exposed through the API, so its tables are reached over the database connection itself.
//   POST {action:'claim', code, pass}   first sign-in with the one-time code Claude gives; sets the passcode
//   POST {action:'login', pass}         a new device; five wrong tries lock sign-in for 15 minutes
//   POST {action:'state'}               the studio's documents, what Claude has done, and signed links to the media
//   POST {action:'write', collection, id, patch, note?}   the owner's change, merged; `note` tells Claude what it was
//   POST {action:'seen'}                the owner has read Claude's latest steps
//   PUT  ?action=upload&path=...        Claude only (agent key): a file into studio-media
//   Claude's key may also 'write' (its steps, as `note`, show in the app) and read its 'inbox' (the owner's taps)
import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);   // storage only
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))).map((x) => x.toString(16).padStart(2, '0')).join('');

async function pbkdf2(pass: string, salt: Uint8Array, iter = 150000) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
async function hashPass(pass: string) { const salt = crypto.getRandomValues(new Uint8Array(16)); return `pbkdf2$150000$${b64(salt)}$${b64(await pbkdf2(pass, salt))}`; }
async function checkPass(pass: string, stored: string | null) {
  if (!stored) return false;
  const [, iter, salt, hash] = stored.split('$');
  const got = b64(await pbkdf2(pass, unb64(salt), Number(iter)));
  return got.length === hash.length && got.split('').every((c, i) => c === hash[i]);
}
async function newSession(kind: 'owner', label: string) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]!));
  await sql`insert into studio.sessions (token_hash, kind, label, expires_at) values (${await sha256(token)}, ${kind}, ${label}, now() + interval '180 days')`;
  return token;
}
async function caller(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const [row] = await sql`update studio.sessions set last_seen = now() where token_hash = ${await sha256(token)}
    and (expires_at is null or expires_at > now()) returning kind, token_hash`;
  return (row ?? null) as { kind: 'owner' | 'agent'; token_hash: string } | null;
}
function merge(a: any, b: any): any {                                   // objects merge, arrays and values replace, {__delete__:true} removes
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
  const out = a && typeof a === 'object' && !Array.isArray(a) ? { ...a } : {};
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && (v as any).__delete__ === true) delete out[k];
    else out[k] = merge(out[k], v);
  }
  return out;
}
async function listMedia(prefix = ''): Promise<string[]> {
  const { data } = await supa.storage.from('studio-media').list(prefix, { limit: 1000 });
  const out: string[] = [];
  for (const o of data ?? []) {
    const p = prefix ? `${prefix}/${o.name}` : o.name;
    if (o.id) out.push(p); else out.push(...(await listMedia(p)));          // a folder has no id
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    if (req.method === 'PUT' && url.searchParams.get('action') === 'upload') {
      const who = await caller(req);
      if (who?.kind !== 'agent') return json({ error: 'unauthorized' }, 401);
      const path = url.searchParams.get('path') ?? '';
      if (!/^[a-z0-9][a-z0-9_\-/.]{0,200}$/i.test(path) || path.includes('..')) return json({ error: 'bad path' }, 400);
      const { error } = await supa.storage.from('studio-media').upload(path, await req.arrayBuffer(),
        { contentType: req.headers.get('content-type') ?? 'application/octet-stream', upsert: true });
      return error ? json({ error: error.message }, 500) : json({ ok: true, path });
    }
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    const body = await req.json().catch(() => ({}));
    const [acc] = await sql`select * from studio.access where id = 1`;

    if (body.action === 'claim' || body.action === 'login') {
      if (acc?.locked_until && new Date(acc.locked_until).getTime() > Date.now()) return json({ error: 'locked', until: acc.locked_until }, 429);
      const pass = String(body.pass ?? '');
      if (pass.length < 6) return json({ error: 'short' }, 400);
      const ok = body.action === 'claim'
        ? !!acc?.setup_hash && (await sha256(String(body.code ?? '').trim().toUpperCase())) === acc.setup_hash
        : await checkPass(pass, acc?.pass_hash ?? null);
      if (!ok) {
        const failed = (acc?.failed ?? 0) + 1;
        await sql`insert into studio.access (id, failed, locked_until) values (1, ${failed}, ${failed >= 5 ? new Date(Date.now() + 15 * 6e4) : null})
          on conflict (id) do update set failed = excluded.failed, locked_until = excluded.locked_until, updated_at = now()`;
        return json({ error: 'wrong', left: Math.max(0, 5 - failed) }, 401);
      }
      if (body.action === 'claim') await sql`update studio.access set pass_hash = ${await hashPass(pass)}, setup_hash = null, failed = 0, locked_until = null, updated_at = now() where id = 1`;
      else await sql`update studio.access set failed = 0, locked_until = null, updated_at = now() where id = 1`;
      return json({ token: await newSession('owner', String(body.device ?? '').slice(0, 80)) });
    }

    const who = await caller(req);
    if (!who) return json({ error: 'unauthorized', claimable: !!acc?.setup_hash && !acc?.pass_hash }, 401);
    const by = who.kind === 'agent' ? 'claude' : 'owner';
    if (body.action === 'inbox' && by === 'claude') {                     // what the owner did since Claude last looked
      const rows = await sql`update studio.events set seen_at = now() where who = 'owner' and seen_at is null returning id, at, kind, text, data`;
      return json({ events: rows });
    }
    if (by !== 'owner' && body.action !== 'write') return json({ error: 'unauthorized' }, 401);

    if (body.action === 'state') {
      const [docs, events, paths] = await Promise.all([
        sql`select collection, id, data, version, updated_at from studio.docs`,
        sql`select id, at, who, kind, text, seen_at from studio.events order by at desc limit 40`,
        listMedia(),
      ]);
      const media: Record<string, string> = {};
      if (paths.length) {
        const { data: signed } = await supa.storage.from('studio-media').createSignedUrls(paths, 6 * 3600);
        for (const s of signed ?? []) if (s.signedUrl && s.path) media[s.path] = s.signedUrl;
      }
      return json({ docs, events, media, at: new Date().toISOString() });
    }
    if (body.action === 'write') {
      const collection = String(body.collection ?? ''), id = String(body.id ?? '');
      if (!/^[a-z_]{1,40}$/.test(collection) || !/^[a-z0-9_\-]{1,80}$/i.test(id)) return json({ error: 'bad doc' }, 400);
      const version = await sql.begin(async (tx) => {                    // merge on the latest version, the row held while merging
        const [cur] = await tx`select data, version from studio.docs where collection = ${collection} and id = ${id} for update`;
        const next = merge(cur?.data ?? {}, body.patch ?? {});
        const [done] = cur
          ? await tx`update studio.docs set data = ${tx.json(next)}, version = version + 1, updated_at = now() where collection = ${collection} and id = ${id} returning version`
          : await tx`insert into studio.docs (collection, id, data) values (${collection}, ${id}, ${tx.json(next)}) returning version`;
        if (body.note) await tx`insert into studio.events (who, kind, text, data) values (${by}, ${String(body.kind ?? 'change')}, ${String(body.note).slice(0, 4000)}, ${tx.json({ collection, id })})`;
        return done.version;
      });
      return json({ ok: true, version });
    }
    if (body.action === 'seen') {
      await sql`update studio.events set seen_at = now() where who = 'claude' and seen_at is null`;
      return json({ ok: true });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
