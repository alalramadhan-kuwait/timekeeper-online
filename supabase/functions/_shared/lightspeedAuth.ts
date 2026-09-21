/**
 * Lightspeed access, shared by every function that talks to it.
 *
 * One access token and one refresh token live in lightspeed_auth. Lightspeed
 * rotates the refresh token each time it is used, which made "refresh if it is
 * about to expire" safe only while exactly one job ever ran. Two jobs refreshing
 * in the same minute each receive a token, and whichever writes second stores a
 * refresh token that is already dead. Every sync after that fails until somebody
 * reconnects by hand — and nothing in the app would have said why.
 *
 * So the refresh is leased. lightspeed_token_lease() hands back the current
 * token if it is fresh; otherwise it lets exactly one caller refresh, holding a
 * short lock on the row, while any other caller waits for that to finish and
 * then reads what it stored.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface Lease {
  locked: boolean;
  needs_refresh: boolean;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  domain_prefix: string;
}

export interface LsSession { base: string; token: string; refreshed: boolean }

export async function lightspeedToken(admin: SupabaseClient): Promise<LsSession> {
  const lease = await takeLease(admin);
  const base = `https://${lease.domain_prefix}.retail.lightspeed.app`;
  if (!lease.needs_refresh && lease.access_token) return { base, token: lease.access_token, refreshed: false };

  if (lease.locked) {
    /* Another job is refreshing. Wait for it rather than racing it. */
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const again = await takeLease(admin);
      if (!again.needs_refresh && again.access_token) return { base, token: again.access_token, refreshed: false };
      if (!again.locked) return await refresh(admin, base, again);   // the holder gave up; take over
    }
    throw new Error("Lightspeed token is being refreshed by another job and it did not finish in time");
  }
  return await refresh(admin, base, lease);
}

async function takeLease(admin: SupabaseClient): Promise<Lease> {
  const { data, error } = await admin.rpc("lightspeed_token_lease");
  if (error) throw new Error(`token lease: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Not connected to Lightspeed yet");
  return row as Lease;
}

async function refresh(admin: SupabaseClient, base: string, lease: Lease): Promise<LsSession> {
  const clientId = Deno.env.get("LS_CLIENT_ID");
  const clientSecret = Deno.env.get("LS_CLIENT_SECRET");
  const giveUp = async (msg: string) => { await admin.rpc("lightspeed_token_release"); throw new Error(msg); };
  if (!clientId || !clientSecret) await giveUp("LS_CLIENT_ID / LS_CLIENT_SECRET secrets not set");
  if (!lease.refresh_token) await giveUp("Lightspeed not authorized yet — complete the connect step");

  const r = await fetch(`${base}/api/1.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: lease.refresh_token!, client_id: clientId!, client_secret: clientSecret!, grant_type: "refresh_token",
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) await giveUp(`Token refresh failed (${r.status}): ${JSON.stringify(body).slice(0, 200)}`);

  const expiresAt = body.expires
    ? new Date(body.expires * 1000).toISOString()
    : new Date(Date.now() + 6 * 3600_000).toISOString();
  const { error } = await admin.rpc("lightspeed_token_store", {
    p_access_token: body.access_token,
    p_refresh_token: body.refresh_token ?? lease.refresh_token,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(`token store: ${error.message}`);
  return { base, token: body.access_token, refreshed: true };
}

/** GET with the wait Lightspeed asks for when it rate-limits. */
export async function lsGet<T = unknown>(url: string, token: string): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 3000)); continue; }
    if (!res.ok) throw new Error(`${new URL(url).pathname} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json() as T;
  }
  throw new Error(`${new URL(url).pathname} → still rate limited after 6 attempts`);
}

/**
 * Who may start a sync: pg_cron with the shared key, or a signed-in admin or
 * manager pressing a button. Anyone else is refused before Lightspeed is
 * touched at all.
 */
export async function callerAllowed(req: Request, admin: SupabaseClient): Promise<boolean> {
  const { data: auth } = await admin.from("lightspeed_auth").select("sync_key").eq("id", 1).single();
  const syncKey = req.headers.get("x-sync-key");
  if (auth?.sync_key && syncKey && syncKey === auth.sync_key) return true;
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data: userData } = await admin.auth.getUser(jwt);
  if (!userData?.user) return false;
  const { data: prof } = await admin.from("profiles").select("role").eq("id", userData.user.id).single();
  return ["admin", "manager"].includes(prof?.role ?? "");
}
