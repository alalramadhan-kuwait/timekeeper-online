// Syncs Lightspeed X-Series inventory into lightspeed_stock.
// Callers: pg_cron (x-sync-key header) or the app's "Sync now" button (user JWT, admin/manager only).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

interface LsProduct {
  id: string;
  sku?: string;
  name?: string;
  active?: boolean;
  is_active?: boolean;
  deleted_at?: string | null;
  brand?: { name?: string } | null;
  brand_name?: string;
  supplier?: { name?: string } | null;
  supplier_name?: string;
  price_including_tax?: number;
  retail_price?: number;
}
interface LsInventory {
  product_id: string;
  outlet_id: string;
  current_amount?: number;
  reorder_point?: number;
  average_cost?: number;
}
interface LsSale {
  id: string;
  status?: string;
  sale_date?: string;
  created_at?: string;
  line_items?: { product_id?: string; quantity?: number; price_total?: number; price?: number }[];
}

async function lsPageAll<T>(base: string, path: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let after = 0;
  for (let page = 0; page < 200; page++) {
    const res = await fetch(`${base}${path}?page_size=500&after=${after}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) { // rate limited — wait and retry same page
      await new Promise((r) => setTimeout(r, 3000));
      page--; continue;
    }
    if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const data: T[] = body.data ?? [];
    out.push(...data);
    const max = body.version?.max;
    if (!data.length || max == null || max === after) break;
    after = max;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: auth } = await admin.from("lightspeed_auth").select("*").eq("id", 1).single();
  if (!auth) return json({ error: "Not connected to Lightspeed yet" }, 400);

  // ── authorize the caller: shared key (cron) or admin/manager JWT (app button)
  const syncKey = req.headers.get("x-sync-key");
  let allowed = !!syncKey && syncKey === auth.sync_key;
  if (!allowed) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (jwt) {
      const { data: userData } = await admin.auth.getUser(jwt);
      if (userData?.user) {
        const { data: prof } = await admin.from("profiles").select("role").eq("id", userData.user.id).single();
        allowed = ["admin", "manager"].includes(prof?.role ?? "");
      }
    }
  }
  if (!allowed) return json({ error: "Unauthorized" }, 401);
  if (!auth.refresh_token && !auth.access_token) return json({ error: "Lightspeed not authorized yet — complete the connect step" }, 400);

  const { data: logRow } = await admin.from("lightspeed_sync_log")
    .insert({ status: "running" }).select("id").single();

  const fail = async (msg: string) => {
    await admin.from("lightspeed_sync_log").update({
      status: "error", error: msg.slice(0, 500), finished_at: new Date().toISOString(),
    }).eq("id", logRow!.id);
    return json({ error: msg }, 500);
  };

  try {
    const base = `https://${auth.domain_prefix}.retail.lightspeed.app`;
    let token: string = auth.access_token;

    // refresh the access token if it expires within 5 minutes
    if (!auth.expires_at || new Date(auth.expires_at).getTime() < Date.now() + 300_000) {
      const clientId = Deno.env.get("LS_CLIENT_ID");
      const clientSecret = Deno.env.get("LS_CLIENT_SECRET");
      if (!clientId || !clientSecret) return await fail("LS_CLIENT_ID / LS_CLIENT_SECRET secrets not set");
      const r = await fetch(`${base}/api/1.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: auth.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.access_token) return await fail(`Token refresh failed (${r.status}): ${JSON.stringify(body).slice(0, 200)}`);
      token = body.access_token;
      await admin.from("lightspeed_auth").update({
        access_token: token,
        refresh_token: body.refresh_token ?? auth.refresh_token,
        expires_at: body.expires ? new Date(body.expires * 1000).toISOString() : new Date(Date.now() + 6 * 3600_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
    }

    // outlets → id → name
    const outletsRes = await fetch(`${base}/api/2.0/outlets`, { headers: { Authorization: `Bearer ${token}` } });
    if (!outletsRes.ok) return await fail(`Outlets → ${outletsRes.status}: ${(await outletsRes.text()).slice(0, 200)}`);
    const outlets: { id: string; name: string }[] = (await outletsRes.json()).data ?? [];
    const outletName = new Map(outlets.map((o) => [o.id, o.name]));

    const products = await lsPageAll<LsProduct>(base, "/api/2.0/products", token);
    const productById = new Map(
      products
        .filter((p) => !p.deleted_at && p.active !== false && p.is_active !== false)
        .map((p) => [p.id, p]),
    );

    const inventory = await lsPageAll<LsInventory>(base, "/api/2.0/inventory", token);

    const syncedAt = new Date().toISOString();
    const rows = inventory
      .filter((i) => productById.has(i.product_id) && outletName.has(i.outlet_id))
      .map((i) => {
        const p = productById.get(i.product_id)!;
        return {
          product_id: i.product_id,
          outlet: outletName.get(i.outlet_id)!,
          sku: p.sku ?? null,
          name: p.name ?? "Unnamed product",
          brand: p.brand?.name ?? p.brand_name ?? null,
          supplier: p.supplier?.name ?? p.supplier_name ?? null,
          price: p.price_including_tax ?? p.retail_price ?? null,
          stock_on_hand: Number(i.current_amount ?? 0),
          reorder_point: i.reorder_point != null ? Number(i.reorder_point) : null,
          synced_at: syncedAt,
        };
      });

    // replace snapshot: upsert current rows, then drop rows not in this sync
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("lightspeed_stock").upsert(rows.slice(i, i + 500));
      if (error) return await fail(`Upsert failed: ${error.message}`);
    }
    await admin.from("lightspeed_stock").delete().lt("synced_at", syncedAt);

    // cost rows go to a separate manager-only table
    const costRows = inventory
      .filter((i) => productById.has(i.product_id) && outletName.has(i.outlet_id))
      .map((i) => ({
        product_id: i.product_id,
        outlet: outletName.get(i.outlet_id)!,
        cost: i.average_cost != null ? Number(i.average_cost) : null,
        synced_at: syncedAt,
      }));
    for (let i = 0; i < costRows.length; i += 500) {
      const { error } = await admin.from("lightspeed_stock_cost").upsert(costRows.slice(i, i + 500));
      if (error) return await fail(`Cost upsert failed: ${error.message}`);
    }
    await admin.from("lightspeed_stock_cost").delete().lt("synced_at", syncedAt);

    // ── sales movement: aggregate last 90 days per product ──
    let salesRows = 0;
    let salesWarning: string | null = null;
    try {
      const now = Date.now();
      const from90 = new Date(now - 90 * 86400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
      const to = new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
      const cutoff30 = new Date(now - 30 * 86400_000).toISOString();

      const sales: LsSale[] = [];
      for (let offset = 0; offset < 50_000; offset += 1000) {
        const res = await fetch(
          `${base}/api/2.0/search?type=sales&date_from=${encodeURIComponent(from90)}&date_to=${encodeURIComponent(to)}&page_size=1000&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.status === 429) { await new Promise((r) => setTimeout(r, 3000)); offset -= 1000; continue; }
        if (!res.ok) throw new Error(`Sales search → ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data: LsSale[] = (await res.json()).data ?? [];
        sales.push(...data);
        if (data.length < 1000) break;
      }

      const agg = new Map<string, { u30: number; u90: number; rev: number; last: string }>();
      for (const s of sales) {
        if ((s.status ?? "").toUpperCase().includes("VOID")) continue;
        const saleDate = s.sale_date ?? s.created_at ?? "";
        if (!saleDate) continue;
        const in30 = saleDate >= cutoff30;
        for (const li of s.line_items ?? []) {
          if (!li.product_id) continue;
          const qty = Number(li.quantity ?? 0);
          const rev = li.price_total != null ? Number(li.price_total) : Number(li.price ?? 0) * qty;
          const e = agg.get(li.product_id) ?? { u30: 0, u90: 0, rev: 0, last: "" };
          e.u90 += qty;
          if (in30) e.u30 += qty;
          e.rev += rev;
          if (qty > 0 && saleDate > e.last) e.last = saleDate;
          agg.set(li.product_id, e);
        }
      }

      const salesSyncedAt = new Date().toISOString();
      const salesInsert = [...agg.entries()].map(([product_id, e]) => ({
        product_id,
        units_30d: e.u30,
        units_90d: e.u90,
        revenue_90d: e.rev,
        last_sold: e.last ? e.last.slice(0, 10) : null,
        synced_at: salesSyncedAt,
      }));
      for (let i = 0; i < salesInsert.length; i += 500) {
        const { error } = await admin.from("lightspeed_product_sales").upsert(salesInsert.slice(i, i + 500));
        if (error) throw new Error(`Sales upsert failed: ${error.message}`);
      }
      await admin.from("lightspeed_product_sales").delete().lt("synced_at", salesSyncedAt);
      salesRows = salesInsert.length;
    } catch (se) {
      // stock sync succeeded — record the sales issue without failing the run
      salesWarning = se instanceof Error ? se.message : String(se);
    }

    await admin.from("lightspeed_sync_log").update({
      status: "ok",
      products_synced: productById.size,
      error: salesWarning ? `sales: ${salesWarning.slice(0, 400)}` : null,
      finished_at: new Date().toISOString(),
    }).eq("id", logRow!.id);

    return json({ ok: true, products: productById.size, stock_rows: rows.length, sales_rows: salesRows, sales_warning: salesWarning });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
});
