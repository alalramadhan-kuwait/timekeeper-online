// Resolves the Instagram Business Account from a pasted long-lived token and stores it.
// Admin/manager only. The user obtains the token from their own Meta app (Standard Access).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "Unauthorized" }, 401);
  const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
  if (!["admin", "manager"].includes(prof?.role ?? "")) return json({ error: "Admins/managers only" }, 403);

  let body: { token?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const token = (body.token ?? "").trim();
  if (!token) return json({ error: "Paste your long-lived access token" }, 400);

  // If it's a short-lived token, try to exchange it for a long-lived one (needs app id/secret)
  let longToken = token;
  let expires: string | null = null;
  const appId = Deno.env.get("IG_APP_ID");
  const appSecret = Deno.env.get("IG_APP_SECRET");
  if (appId && appSecret) {
    const ex = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(token)}`);
    if (ex.ok) {
      const b = await ex.json();
      if (b.access_token) { longToken = b.access_token; if (b.expires_in) expires = new Date(Date.now() + b.expires_in * 1000).toISOString(); }
    }
  }

  // Resolve the Instagram Business Account via the linked Facebook Page(s)
  const pagesRes = await fetch(`${GRAPH}/me/accounts?fields=instagram_business_account{id,username},name&access_token=${encodeURIComponent(longToken)}`);
  const pagesBody = await pagesRes.json();
  if (!pagesRes.ok) return json({ error: `Meta: ${pagesBody?.error?.message ?? pagesRes.status}` }, 400);
  const page = (pagesBody.data ?? []).find((p: { instagram_business_account?: { id: string } }) => p.instagram_business_account?.id);
  if (!page?.instagram_business_account?.id) {
    return json({ error: "No Instagram Business account found. Make sure @timekeeperkw is a Business/Creator account linked to your Facebook Page, and the token has instagram_basic + pages_show_list." }, 400);
  }
  const igUserId = page.instagram_business_account.id;
  const username = page.instagram_business_account.username ?? null;

  const { error } = await admin.from("instagram_auth").upsert({
    id: 1, ig_user_id: igUserId, username, access_token: longToken,
    token_expires: expires ?? new Date(Date.now() + 55 * 86400_000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true, username, ig_user_id: igUserId });
});
