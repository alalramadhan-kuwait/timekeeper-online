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
//          "products" — copies every product with its watch details (dial colour, case and
//          strap material, movement… the fields behind the shop's filters) into
//          shopify_products and links each one to its Lightspeed product. It runs one bulk
//          export; if the export is not ready in time, the next call picks it up.
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


const WATCH_FIELDS: Record<string, string> = {
  dial_color: "dial_color", case_material: "case_material", strap_material: "strap_material", movement: "movement",
  case_shape: "case_shape", crystal: "crystal", series: "series",
};

const BULK_QUERY = `{ products { edges { node { id handle title vendor status productType tags updatedAt
  variants { edges { node { id sku price } } }
  metafields(namespace: "watch") { edges { node { id key type value
    reference { ... on Metaobject { label: field(key: "label") { value } } } } } }
} } } }`;

type Bulk = { id: string; status: string; url: string | null; createdAt: string; errorCode: string | null; query?: string };

async function currentBulk(token: string): Promise<Bulk | null> {
  const d = await gql(token, `{ currentBulkOperation(type: QUERY) { id status url createdAt errorCode query } }`);
  return d.currentBulkOperation;
}

// One row per product, shaped like public.shopify_products.
function parseExport(jsonl: string) {
  const products = new Map<string, Record<string, unknown>>();
  const children: Record<string, unknown>[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (o.__parentId) children.push(o);
    else products.set(o.id, { shopify_id: o.id, handle: o.handle, title: o.title, vendor: o.vendor, status: o.status,
      product_type: o.productType || null, tags: o.tags ?? [], skus: [] as string[], price: null as number | null,
      attributes: {} as Record<string, unknown>, shopify_updated_at: o.updatedAt });
  }
  for (const c of children) {
    const p = products.get(c.__parentId as string);
    if (!p) continue;
    if (String(c.id).includes("/ProductVariant/")) {
      if (c.sku) (p.skus as string[]).push(String(c.sku));
      const price = c.price == null ? null : Number(c.price);
      if (price != null && (p.price == null || price < (p.price as number))) p.price = price;
    } else if (c.key) {
      const ref = c.reference as { label?: { value?: string } } | null;
      const value = ref?.label?.value ?? (String(c.type).includes("reference") ? null : c.value);
      if (value != null) (p.attributes as Record<string, unknown>)[c.key as string] = value;
    }
  }
  return [...products.values()].map((p) => {
    const a = p.attributes as Record<string, unknown>;
    const row: Record<string, unknown> = { ...p };
    for (const [col, key] of Object.entries(WATCH_FIELDS)) row[col] = a[key] ?? null;
    const num = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
    row.case_diameter_mm = num(a.case_diameter_mm);
    row.water_resistance_m = num(a.water_resistance_m) == null ? null : Math.round(num(a.water_resistance_m)!);
    return row;
  });
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
      const scopes = scope.split(",").filter(Boolean);
      // a write scope includes its read scope
      const has = (n: string) => scopes.includes(n) || scopes.includes(n.replace(/^read_/, "write_"));
      const needed = ["read_orders", "read_all_orders", "read_products", "read_inventory", "read_customers", "read_reports",
        "read_metaobjects"];
      const d = await gql(token, `{ shop { name currencyCode } ordersCount(limit: null) { count }
        orders(first: 1, sortKey: CREATED_AT, reverse: true) { nodes { name customer { id } phone email } } }`);
      const o = d.orders.nodes[0];
      // only whether customer details are readable, never the details themselves
      return json({ ok: true, shop: d.shop.name, currency: d.shop.currencyCode, orders: d.ordersCount.count,
        latest_order: o?.name ?? null, customer_details_readable: !!(o && (o.customer?.id || o.phone || o.email)),
        missing: needed.filter((n) => !has(n)) });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 502);
    }
  }

  if (body.action === "products") {
    try {
      const { token } = await accessToken();
      let op = await currentBulk(token);
      const ours = (o: Bulk | null) => !!o && (o.query ?? "").includes('metafields(namespace: "watch")');
      const fresh = (o: Bulk | null) => !!o && Date.now() - Date.parse(o.createdAt) < 3 * 3600_000;
      // start a new export unless ours is running, or finished within the last three hours
      if (!(ours(op) && (["CREATED", "RUNNING"].includes(op!.status) || (op!.status === "COMPLETED" && fresh(op))))) {
        const d = await gql(token, `mutation($q: String!) { bulkOperationRunQuery(query: $q) {
          bulkOperation { id status url createdAt errorCode } userErrors { field message } } }`, { q: BULK_QUERY });
        const errs = d.bulkOperationRunQuery.userErrors;
        if (errs?.length) return json({ ok: false, error: errs.map((e: { message: string }) => e.message).join("; ") }, 502);
        op = d.bulkOperationRunQuery.bulkOperation;
      }
      const until = Date.now() + 100_000;
      while (op && ["CREATED", "RUNNING"].includes(op.status) && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 4000));
        op = await currentBulk(token);
      }
      if (!op || op.status !== "COMPLETED") {
        return json({ ok: op?.status === "RUNNING" || op?.status === "CREATED", status: op?.status ?? "none",
          error: op?.errorCode ?? null, note: "The export is not ready yet; call again to load it." }, 202);
      }
      if (!op.url) return json({ ok: true, status: "COMPLETED", products: 0, note: "The shop has no products." });
      const res = await fetch(op.url);
      if (!res.ok) throw new Error(`export download failed: ${res.status}`);
      const rows = parseExport(await res.text());
      const started = new Date().toISOString();
      let written = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const { data, error } = await admin.rpc("shopify_products_upsert", { p_rows: rows.slice(i, i + 500) });
        if (error) throw new Error(`upsert failed: ${error.message}`);
        written += data as number;
      }
      // remove what the shop no longer has only after a complete read
      const { data: fin, error } = await admin.rpc("shopify_products_finish", { p_started: started });
      if (error) throw new Error(`finish failed: ${error.message}`);
      return json({ ok: true, export_created_at: op.createdAt, written, ...fin });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 502);
    }
  }
  return json({ error: "Unknown action" }, 400);
});
