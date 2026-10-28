// Shopify: reads the online shop (time-keeper.com) into our database. Read-only:
// nothing is ever written to Shopify.
//
// The app "TK Claude" (Dev Dashboard, installed on timekeeper-kw.myshopify.com)
// holds read-only scopes. Its client ID and secret live in the function secrets
// SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET and are exchanged for a 24-hour
// access token on each run (client credentials grant). The token is never
// returned or stored.
//
// Callers: the sync key (x-sync-key), as for lightspeed-sync.
// Actions: "check" — confirms the connection and the scopes granted.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SHOP = "timekeeper-kw.myshopify.com";
const API_VERSION = "2026-10";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function accessToken(): Promise<{ token: string; scope: string }> {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("SHOPIFY_CLIENT_ID"),
      client_secret: Deno.env.get("SHOPIFY_CLIENT_SECRET"),
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const b = await res.json();
  return { token: b.access_token, scope: b.scope ?? "" };
}

async function gql(token: string, query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const b = await res.json();
  if (!res.ok || b.errors) throw new Error(`graphql failed: ${res.status} ${JSON.stringify(b.errors ?? b).slice(0, 300)}`);
  return b.data;
}

Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const syncKey = req.headers.get("x-sync-key");
  const { data: auth } = await admin.from("lightspeed_auth").select("sync_key").eq("id", 1).single();
  if (!syncKey || !auth?.sync_key || syncKey !== auth.sync_key) return json({ error: "Unauthorized" }, 401);

  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  if (!Deno.env.get("SHOPIFY_CLIENT_ID") || !Deno.env.get("SHOPIFY_CLIENT_SECRET")) {
    return json({ ok: false, error: "SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET is not set" }, 503);
  }

  if ((body.action ?? "check") === "check") {
    try {
      const { token, scope } = await accessToken();
      const d = await gql(token, `{ shop { name currencyCode } }`);
      const scopes = scope.split(",").filter(Boolean);
      const needed = ["read_orders", "read_products", "read_inventory", "read_customers", "read_reports"];
      return json({ ok: true, shop: d.shop.name, currency: d.shop.currencyCode, scopes,
        missing: needed.filter((n) => !scopes.includes(n)) });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 502);
    }
  }
  return json({ error: "Unknown action" }, 400);
});
