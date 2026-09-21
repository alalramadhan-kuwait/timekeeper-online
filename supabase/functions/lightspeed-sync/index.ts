// Syncs Lightspeed X-Series inventory into lightspeed_stock.
// Callers: pg_cron (x-sync-key header) or the app's "Sync now" button (user JWT, admin/manager only).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { lightspeedToken } from "../_shared/lightspeedAuth.ts";

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
  outlet_id?: string;
  /* Who rang it up. One register serves two channels — the online shop and the
     WhatsApp orders — and the salesperson is the only thing that tells them
     apart, so it is carried through to lightspeed_sales_by_staff. */
  user_id?: string;
  sale_date?: string;
  created_at?: string;
  line_items?: { product_id?: string; quantity?: number; price_total?: number; price?: number }[];
}

/* A sale is money only once it is finished with. VOID is not a sale at all,
   and SAVED / PARKED / AWAITING are baskets nobody has paid for yet. LAYBY
   and ONACCOUNT are counted — the customer has committed and the goods are
   allocated — which is how the shop has always read them. */
const REVENUE_SALE = (status?: string) => {
  const s = (status ?? "").toUpperCase();
  if (!s) return true;
  return !/VOID|SAVED|PARKED|AWAITING/.test(s);
};
/* The shop's day, not Greenwich's: a sale at 10pm in Kuwait belongs to that
   day and not to tomorrow, which is what a plain ISO slice would call it. */
const kuwaitDay = (iso: string) =>
  new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);

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
    /* The token comes through the lease in _shared/lightspeedAuth.ts, so this
       run and the ten-minute sales sync can never refresh it at the same
       moment and invalidate each other. */
    const { base, token } = await lightspeedToken(admin);

    // outlets → id → name
    const outletsRes = await fetch(`${base}/api/2.0/outlets`, { headers: { Authorization: `Bearer ${token}` } });
    if (!outletsRes.ok) return await fail(`Outlets → ${outletsRes.status}: ${(await outletsRes.text()).slice(0, 200)}`);
    const outlets: { id: string; name: string }[] = (await outletsRes.json()).data ?? [];
    const outletName = new Map(outlets.map((o) => [o.id, o.name]));

    /* Till users, so a sale can say who rang it up. A failure here is not worth
       failing the whole sync over: without it the day still totals correctly,
       it just cannot be split between the channels one register serves. */
    const userName = new Map<string, string>();
    try {
      const usersRes = await fetch(`${base}/api/2.0/users`, { headers: { Authorization: `Bearer ${token}` } });
      if (usersRes.ok) {
        const users: { id: string; display_name?: string; name?: string; username?: string }[] =
          (await usersRes.json()).data ?? [];
        for (const u of users) {
          const n = (u.display_name ?? u.name ?? u.username ?? "").trim();
          if (n) userName.set(u.id, n);
        }
      }
    } catch { /* leave the map empty; the split falls back to unattributed */ }

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
    let dailyCount = 0;
    let salesNote: string | null = null;
    let outletBreakdown: Record<string, number> = {};
    let statusCounts: Record<string, number> = {};
    let staffAttributed = 0;
    let staffRowCount = 0;
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
      /* Revenue per outlet per day — what the dashboard reads for "Sales this
         month". Built from the pages already fetched above, so it costs no
         extra calls to Lightspeed. */
      const daily = new Map<string, { revenue: number; units: number; sales: number }>();
      /* The same money, also totalled by salesperson. One register serves the
         online shop and the WhatsApp orders, and this is what tells them apart.
         A sale with no known till user is simply left out here — the day still
         totals correctly in `daily`, and the remainder is reported as
         unattributed rather than guessed at. */
      const byStaff = new Map<string, { revenue: number; units: number; sales: number }>();
      let noUser = 0;
      const statusSeen = new Map<string, number>();
      let noOutlet = 0;
      for (const s of sales) {
        const st = (s.status ?? "").toUpperCase() || "(none)";
        statusSeen.set(st, (statusSeen.get(st) ?? 0) + 1);
        if ((s.status ?? "").toUpperCase().includes("VOID")) continue;
        const saleDate = s.sale_date ?? s.created_at ?? "";
        if (!saleDate) continue;

        if (REVENUE_SALE(s.status)) {
          const oName = s.outlet_id ? outletName.get(s.outlet_id) : undefined;
          if (!oName) noOutlet++;
          else {
            const key = `${oName}\u0000${kuwaitDay(saleDate)}`;
            const e = daily.get(key) ?? { revenue: 0, units: 0, sales: 0 };
            for (const li of s.line_items ?? []) {
              const q = Number(li.quantity ?? 0);
              /* Returns come back as negative lines, so the day nets out on
                 its own — no separate refund pass to keep in step. */
              e.revenue += li.price_total != null ? Number(li.price_total) : Number(li.price ?? 0) * q;
              e.units += q;
            }
            e.sales += 1;
            daily.set(key, e);

            const who = s.user_id ? userName.get(s.user_id) : undefined;
            if (!who) noUser++;
            else {
              const sKey = `${oName}\u0000${kuwaitDay(saleDate)}\u0000${who}`;
              const se = byStaff.get(sKey) ?? { revenue: 0, units: 0, sales: 0 };
              for (const li of s.line_items ?? []) {
                const q = Number(li.quantity ?? 0);
                se.revenue += li.price_total != null ? Number(li.price_total) : Number(li.price ?? 0) * q;
                se.units += q;
              }
              se.sales += 1;
              byStaff.set(sKey, se);
            }
          }
        }

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

      /* The daily ledger. Every day in the window is rewritten, then any row
         left behind inside that window is dropped — a day whose only sale was
         later voided has to fall back to nothing rather than keep yesterday's
         figure. Days older than the window are history and are left alone. */
      const dailyRows = [...daily.entries()].map(([key, e]) => {
        const [outlet, sale_date] = key.split("\u0000");
        return {
          outlet, sale_date,
          revenue: Math.round(e.revenue * 1000) / 1000,
          units: e.units,
          sale_count: e.sales,
          synced_at: salesSyncedAt,
        };
      });
      for (let i = 0; i < dailyRows.length; i += 500) {
        const { error } = await admin.from("lightspeed_sales_daily").upsert(dailyRows.slice(i, i + 500));
        if (error) throw new Error(`Daily sales upsert failed: ${error.message}`);
      }
      await admin.from("lightspeed_sales_daily")
        .delete()
        .gte("sale_date", kuwaitDay(from90))
        .lt("synced_at", salesSyncedAt);
      const staffRows = [...byStaff.entries()].map(([key, e]) => {
        const [outlet, sale_date, salesperson] = key.split("\u0000");
        return {
          outlet, sale_date, salesperson,
          revenue: Math.round(e.revenue * 1000) / 1000,
          units: e.units,
          sale_count: e.sales,
          synced_at: salesSyncedAt,
        };
      });
      for (let i = 0; i < staffRows.length; i += 500) {
        const { error } = await admin.from("lightspeed_sales_by_staff").upsert(staffRows.slice(i, i + 500));
        if (error) throw new Error(`Sales-by-staff upsert failed: ${error.message}`);
      }
      await admin.from("lightspeed_sales_by_staff")
        .delete()
        .gte("sale_date", kuwaitDay(from90))
        .lt("synced_at", salesSyncedAt);

      dailyCount = dailyRows.length;
      outletBreakdown = {};
      for (const r of dailyRows) outletBreakdown[r.outlet] = Math.round(((outletBreakdown[r.outlet] ?? 0) + r.revenue) * 1000) / 1000;
      /* What the run actually attributed, so a sync that stops seeing till users
         is visible in its own result rather than only in a report weeks later. */
      staffAttributed = Math.round(staffRows.reduce((t, r) => t + r.revenue, 0) * 1000) / 1000;
      staffRowCount = staffRows.length;
      const notes: string[] = [];
      if (noOutlet) notes.push(`${noOutlet} sale(s) carried no outlet and were left out of the daily figures`);
      if (noUser) notes.push(`${noUser} sale(s) carried no till user, so they could not be attributed to a channel`);
      if (notes.length) salesNote = notes.join("; ");
      statusCounts = Object.fromEntries(statusSeen);

      // append a daily stock-value snapshot for the trend graph
      const soldSet = new Set(salesInsert.filter((s) => Number(s.units_90d) > 0).map((s) => s.product_id));
      const retailByProduct = new Map<string, number>();
      for (const r of rows) retailByProduct.set(r.product_id, (retailByProduct.get(r.product_id) ?? 0) + r.stock_on_hand * Number(r.price ?? 0));
      let retailValue = 0, deadValue = 0, units = 0;
      for (const [pid, val] of retailByProduct) { retailValue += val; if (!soldSet.has(pid)) deadValue += val; }
      for (const r of rows) units += r.stock_on_hand;
      let costValue = 0;
      for (const i of inventory) {
        if (productById.has(i.product_id) && outletName.has(i.outlet_id)) costValue += Number(i.current_amount ?? 0) * Number(i.average_cost ?? 0);
      }
      const snapshotDate = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Kuwait date
      await admin.from("lightspeed_stock_value_history").upsert({
        snapshot_date: snapshotDate,
        retail_value: retailValue,
        cost_value: costValue,
        dead_value: deadValue,
        units,
        products: productById.size,
        updated_at: new Date().toISOString(),
      });
    } catch (se) {
      // stock sync succeeded — record the sales issue without failing the run
      salesWarning = se instanceof Error ? se.message : String(se);
    }

    await admin.from("lightspeed_sync_log").update({
      status: "ok",
      products_synced: productById.size,
      error: salesWarning ? `sales: ${salesWarning.slice(0, 400)}`
           : salesNote ? salesNote.slice(0, 400) : null,
      finished_at: new Date().toISOString(),
    }).eq("id", logRow!.id);

    return json({
      ok: true, products: productById.size, stock_rows: rows.length,
      sales_rows: salesRows, sales_warning: salesWarning,
      daily_rows: dailyCount, revenue_90d_by_outlet: outletBreakdown,
      staff_rows: staffRowCount, revenue_90d_attributed_to_staff: staffAttributed,
      sale_statuses: statusCounts, sales_note: salesNote,
    });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
});
