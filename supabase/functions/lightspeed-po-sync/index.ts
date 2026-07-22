// Imports Lightspeed SUPPLIER consignments (= purchase orders) into purchase_orders.
// Lightspeed owns the PO; Timekeeper owns payment/receiving tracking and never has those
// fields overwritten by a sync.
// Callers: pg_cron (x-sync-key) or admin/manager JWT ("Sync POs now").
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

interface Consignment {
  id: string; name?: string; type?: string; status?: string;
  supplier_id?: string | null; outlet_id?: string | null;
  due_at?: string | null; received_at?: string | null; created_at?: string | null;
}
interface ConsignmentProduct {
  product_id?: string; count?: number; received?: number; cost?: number;
}

/** Lightspeed status → Timekeeper lifecycle (Partially Received is derived from line items). */
function mapStatus(s?: string): string {
  switch ((s ?? "").toUpperCase()) {
    case "OPEN": return "Pending Approval";
    case "SENT":
    case "DISPATCHED": return "Ordered";
    case "RECEIVED":
    case "CLOSED": return "Fully Received";
    case "CANCELLED": return "Cancelled";
    default: return "Ordered";
  }
}

async function pageAll<T>(base: string, path: string, token: string, cap = 40): Promise<T[]> {
  const out: T[] = [];
  let after = 0;
  for (let page = 0; page < cap; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${base}${path}${sep}page_size=500&after=${after}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 3000)); page--; continue; }
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

  const syncKey = req.headers.get("x-sync-key");
  let allowed = !!syncKey && syncKey === auth.sync_key;
  if (!allowed) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (jwt) {
      const { data: u } = await admin.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
        allowed = ["admin", "manager"].includes(p?.role ?? "");
      }
    }
  }
  if (!allowed) return json({ error: "Unauthorized" }, 401);
  if (!auth.access_token || !auth.domain_prefix) return json({ error: "Lightspeed not authorized" }, 400);

  const { data: logRow } = await admin.from("lightspeed_sync_log").insert({ status: "running" }).select("id").single();
  const fail = async (msg: string) => {
    await admin.from("lightspeed_sync_log")
      .update({ status: "error", error: `po: ${msg.slice(0, 450)}`, finished_at: new Date().toISOString() })
      .eq("id", logRow!.id);
    return json({ error: msg }, 500);
  };

  try {
    const base = `https://${auth.domain_prefix}.retail.lightspeed.app`;
    let token: string = auth.access_token;

    // refresh the long-lived token when it is close to expiring
    if (!auth.expires_at || new Date(auth.expires_at).getTime() < Date.now() + 300_000) {
      const clientId = Deno.env.get("LS_CLIENT_ID"); const clientSecret = Deno.env.get("LS_CLIENT_SECRET");
      if (clientId && clientSecret && auth.refresh_token) {
        const r = await fetch(`${base}/api/1.0/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: auth.refresh_token, client_id: clientId,
            client_secret: clientSecret, grant_type: "refresh_token",
          }),
        });
        const b = await r.json().catch(() => ({}));
        if (r.ok && b.access_token) {
          token = b.access_token;
          await admin.from("lightspeed_auth").update({
            access_token: token,
            refresh_token: b.refresh_token ?? auth.refresh_token,
            expires_at: b.expires ? new Date(b.expires * 1000).toISOString() : new Date(Date.now() + 55 * 86400_000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", 1);
        }
      }
    }

    // supplier + outlet name lookups (consignments only carry ids)
    const supMap = new Map<string, string>();
    try {
      const sups = await pageAll<{ id: string; name?: string }>(base, "/api/2.0/suppliers", token, 5);
      for (const s of sups) if (s.name) supMap.set(s.id, s.name);
    } catch { /* names are cosmetic — keep going without them */ }

    const outMap = new Map<string, string>();
    const outRes = await fetch(`${base}/api/2.0/outlets`, { headers: { Authorization: `Bearer ${token}` } });
    if (outRes.ok) for (const o of ((await outRes.json()).data ?? []) as { id: string; name: string }[]) outMap.set(o.id, o.name);

    // purchase orders = SUPPLIER consignments
    const cons = (await pageAll<Consignment>(base, "/api/2.0/consignments?type=SUPPLIER", token))
      .filter((c) => (c.type ?? "").toUpperCase() === "SUPPLIER");

    // Existing rows tell us which POs still need their line items refreshed. PostgREST
    // caps a select at 1000 rows, and there are ~2,000 POs — read it in pages or the
    // sync sees the same slice every run and never makes progress.
    type ExistingPo = {
      id: string; ls_consignment_id: string | null; status: string;
      item_count: number | null; total_cost: number | null;
      ordered_qty: number | null; received_qty: number | null;
    };
    const existingRows: ExistingPo[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from("purchase_orders")
        .select("id, ls_consignment_id, status, item_count, total_cost, ordered_qty, received_qty")
        .range(from, from + 999);
      if (error) return await fail(`Read POs: ${error.message}`);
      existingRows.push(...(data ?? []) as ExistingPo[]);
      if (!data || data.length < 1000) break;
    }
    const byLsId = new Map(existingRows.filter((r) => r.ls_consignment_id).map((r) => [r.ls_consignment_id!, r]));

    // Headers are one cheap paged call, but line items cost a request per PO and this
    // account has ~2,000 POs going back to 2022. So queue them: POs still in flight
    // first, then a newest-first backfill of ones whose items were never pulled.
    // Whatever doesn't fit the budget is picked up by the next run.
    const TERMINAL = ["Fully Received", "Cancelled"];
    const priority = (c: Consignment): number => {
      const prev = byLsId.get(c.id);
      if (!prev) return 0;                              // never synced
      if (!TERMINAL.includes(prev.status)) return 0;    // still moving
      if (prev.ordered_qty == null) return 1;           // settled but no totals yet
      return 2;                                         // done
    };
    const queue = cons
      .filter((c) => priority(c) < 2)
      .sort((a, b) =>
        priority(a) - priority(b) ||
        (b.created_at ?? "").localeCompare(a.created_at ?? ""));

    const ITEM_BUDGET = 120;   // stays under the ~200 req/hour Lightspeed limit
    const CONCURRENCY = 10;
    const wanted = queue.slice(0, ITEM_BUDGET);
    const itemsById = new Map<string, ConsignmentProduct[]>();
    const deadline = Date.now() + 100_000;
    let truncated = wanted.length < queue.length;
    let rateLimited = false;

    for (let k = 0; k < wanted.length; k += CONCURRENCY) {
      if (rateLimited || Date.now() > deadline) { truncated = true; break; }
      await Promise.all(wanted.slice(k, k + CONCURRENCY).map(async (c) => {
        const pr = await fetch(`${base}/api/2.0/consignments/${c.id}/products?page_size=500`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (pr.ok) itemsById.set(c.id, ((await pr.json()).data ?? []) as ConsignmentProduct[]);
        else { truncated = true; if (pr.status === 429) rateLimited = true; }
      }));
    }

    const syncedAt = new Date().toISOString();
    const poRows = cons.map((c) => {
      const items = itemsById.get(c.id);
      const row: Record<string, unknown> = {
        ls_consignment_id: c.id,
        source: "lightspeed",
        po_number: c.name || `LS-${c.id.slice(0, 8)}`,
        po_type: "PO",
        supplier: c.supplier_id ? (supMap.get(c.supplier_id) ?? null) : null,
        outlet: c.outlet_id ? (outMap.get(c.outlet_id) ?? null) : null,
        created_date: (c.created_at ?? syncedAt).slice(0, 10),
        expected_arrival: c.due_at ? c.due_at.slice(0, 10) : null,
        status: mapStatus(c.status),
        ls_synced_at: syncedAt,
      };
      if (items) {
        const orderedQty = items.reduce((s, i) => s + Number(i.count ?? 0), 0);
        const receivedQty = items.reduce((s, i) => s + Number(i.received ?? 0), 0);
        row.total_cost = items.reduce((s, i) => s + Number(i.cost ?? 0) * Number(i.count ?? 0), 0);
        row.item_count = items.length;
        row.ordered_qty = orderedQty;
        row.received_qty = receivedQty;
        // Partially Received is derived — Lightspeed has no such status
        if (receivedQty > 0 && receivedQty < orderedQty) row.status = "Partially Received";
      } else {
        // A bulk upsert sends the same key set for every row, so totals have to be
        // restated explicitly — carry forward what the last run stored.
        const prev = byLsId.get(c.id);
        row.total_cost = prev?.total_cost ?? 0;
        row.item_count = prev?.item_count ?? 0;
        row.ordered_qty = prev?.ordered_qty ?? null;
        row.received_qty = prev?.received_qty ?? null;
        if (prev?.status === "Partially Received") row.status = prev.status;
      }
      return row;
    });

    // Most of the ~2,000 POs are settled history that never changes — only write the
    // ones that are new, just had items fetched, or whose status actually moved.
    const changed = poRows.filter((r) => {
      const prev = byLsId.get(r.ls_consignment_id as string);
      if (!prev) return true;
      if (itemsById.has(r.ls_consignment_id as string)) return true;
      return prev.status !== r.status;
    });

    // Upsert writes only the columns above, so Timekeeper-owned payment/notes/project
    // fields on existing rows are never touched.
    for (let k = 0; k < changed.length; k += 200) {
      const { error } = await admin.from("purchase_orders")
        .upsert(changed.slice(k, k + 200), { onConflict: "ls_consignment_id" });
      if (error) return await fail(`Upsert POs: ${error.message}`);
    }

    // resolve ids for the POs whose line items we just fetched
    const { data: idRows } = await admin.from("purchase_orders")
      .select("id, ls_consignment_id").in("ls_consignment_id", [...itemsById.keys()]);
    const idByLs = new Map((idRows ?? []).map((r) => [r.ls_consignment_id as string, r.id as string]));

    // A PO can list the same product on more than one line — collapse them, or the
    // upsert would try to touch the same (po_id, ls_product_id) twice in one statement.
    const itemByKey = new Map<string, Record<string, unknown>>();
    for (const [lsId, items] of itemsById) {
      const poId = idByLs.get(lsId);
      if (!poId) continue;
      for (const i of items) {
        if (!i.product_id) continue;
        const key = `${poId}|${i.product_id}`;
        const prev = itemByKey.get(key);
        if (prev) {
          prev.ordered_qty = Number(prev.ordered_qty) + Number(i.count ?? 0);
          prev.received_qty = Number(prev.received_qty) + Number(i.received ?? 0);
        } else {
          itemByKey.set(key, {
            po_id: poId, ls_product_id: i.product_id,
            ordered_qty: Number(i.count ?? 0), received_qty: Number(i.received ?? 0),
            cost: Number(i.cost ?? 0), synced_at: syncedAt,
          });
        }
      }
    }
    const itemRows = [...itemByKey.values()];
    for (let k = 0; k < itemRows.length; k += 500) {
      const { error } = await admin.from("purchase_order_items")
        .upsert(itemRows.slice(k, k + 500), { onConflict: "po_id,ls_product_id" });
      if (error) return await fail(`Upsert items: ${error.message}`);
    }
    // drop lines removed from the PO in Lightspeed (only for POs refreshed this run)
    if (idByLs.size) {
      await admin.from("purchase_order_items")
        .delete().in("po_id", [...idByLs.values()]).lt("synced_at", syncedAt);
    }

    // (product names/SKUs come from the stock sync via purchase_order_items_view)

    // consignments carry no brand — take it from the products on the PO
    await admin.rpc("po_fill_brands");

    const { data: match } = await admin.rpc("po_match_legacy");
    const m = Array.isArray(match) ? match[0] : match;

    await admin.from("lightspeed_sync_log").update({
      status: "ok", products_synced: changed.length, finished_at: new Date().toISOString(),
      error: truncated ? "po: line-item budget reached, remaining POs sync next run" : null,
    }).eq("id", logRow!.id);

    return json({
      ok: true, purchase_orders: poRows.length, updated: changed.length,
      line_items: itemRows.length, backfill_remaining: Math.max(0, queue.length - wanted.length),
      auto_linked: m?.auto_linked ?? 0, suggested: m?.suggested ?? 0, truncated,
    });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
});
