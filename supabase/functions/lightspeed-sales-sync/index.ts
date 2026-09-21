/**
 * Every Lightspeed sale, one row each, kept current every ten minutes.
 *
 * The daily sync reads the same sales and keeps only the totals: a day, an
 * outlet, a figure. That was the right shape for a revenue dashboard and the
 * wrong one for anything about a customer — which sale, sold by whom, to whom,
 * at what time — because all of that was discarded before it reached the
 * database. This function keeps it.
 *
 * It walks Lightspeed's version cursor rather than a date range, so a sale that
 * is voided or returned a week later is picked up again with its new status —
 * a date window would have missed it. The cursor is stored after every page, so
 * a run cut short simply resumes, and every write is an upsert on the sale's
 * own id, so running it twice changes nothing. The first run starts from the
 * beginning of the account's history and catches up a few pages at a time.
 *
 * Nothing here touches the aggregate tables. They stay exactly as the daily
 * sync leaves them; lightspeed_sales_reconciliation is how the two are compared.
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { lightspeedToken, lsGet, callerAllowed } from "../_shared/lightspeedAuth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

/* The shop's day, not Greenwich's — the same rule the daily sync applies, so
   the two agree on which day a 10pm sale belongs to. */
const kuwaitDay = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);

/* How far one run may walk. Enough to catch up quickly on the first run,
   small enough that a run never nears the function's time limit. */
const SALE_PAGES_PER_RUN = 40;
const CUSTOMER_PAGES_PER_RUN = 30;
const PAGE = 500;

interface LsSale {
  id: string; outlet_id?: string; register_id?: string; user_id?: string; customer_id?: string;
  invoice_number?: string; receipt_number?: string; status?: string; state?: string; source?: string;
  return_for?: string | null; note?: string; total_price?: number; total_tax?: number;
  total_price_incl?: number; total_loyalty?: number; sale_date?: string; created_at?: string;
  updated_at?: string; deleted_at?: string | null; version: number;
  line_items?: LsLine[]; payments?: { name?: string; amount?: number; payment_date?: string }[];
}
interface LsLine {
  id: string; product_id?: string; quantity?: number; price?: number; price_total?: number;
  discount_total?: number; tax_total?: number; is_return?: boolean; status?: string;
  salesperson_id?: string | null; sequence?: number;
}
interface LsCustomer {
  id: string; customer_code?: string; name?: string; first_name?: string; last_name?: string;
  mobile?: string; phone?: string; email?: string; date_of_birth?: string | null;
  do_not_email?: boolean; enable_promotional_sms?: boolean; privacy_consent?: boolean;
  customer_group_id?: string; year_to_date?: number; created_at?: string; updated_at?: string;
  deleted_at?: string | null; version: number;
}
interface Page<T> { data?: T[]; version?: { min?: number; max?: number } }

const blank = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);

/* A birthday is typed by hand at the till, and "0000-12-30" is what Lightspeed
   stores when somebody clears the field. Postgres refuses it, and rightly: a
   date that cannot be a birthday is better kept as no birthday at all. */
const validDate = (s: unknown) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  return y >= 1900 && y <= new Date().getFullYear() ? s.slice(0, 10) : null;
};

/* The same year-zero placeholder turns up on created_at / updated_at for a
   record Lightspeed migrated in from somewhere else. It means "never", and
   null says that honestly. */
const validTs = (s: unknown) =>
  typeof s === "string" && /^\d{4}-/.test(s) && Number(s.slice(0, 4)) >= 1970 ? s : null;

async function readState(admin: SupabaseClient, kind: string) {
  const { data } = await admin.from("lightspeed_sync_state").select("cursor").eq("kind", kind).maybeSingle();
  return Number(data?.cursor ?? 0);
}
async function writeState(admin: SupabaseClient, kind: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("lightspeed_sync_state")
    .upsert({ kind, ...patch, last_run_at: new Date().toISOString() }, { onConflict: "kind" });
  if (error) throw new Error(`sync state (${kind}): ${error.message}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await callerAllowed(req, admin))) return json({ error: "Unauthorized" }, 401);

  const { data: logRow } = await admin.from("lightspeed_sync_log")
    .insert({ status: "running", kind: "sales" }).select("id").single();
  const finish = async (status: "ok" | "error", fields: Record<string, unknown>) => {
    await admin.from("lightspeed_sync_log")
      .update({ status, finished_at: new Date().toISOString(), ...fields }).eq("id", logRow!.id);
  };

  const t0 = Date.now();
  try {
    const { base, token, refreshed } = await lightspeedToken(admin);

    /* Names, so a row is readable without a second lookup. Outlet names are
       also what the aggregate tables are keyed by, so they have to match. */
    const [outlets, registers] = await Promise.all([
      lsGet<Page<{ id: string; name: string }>>(`${base}/api/2.0/outlets`, token),
      lsGet<Page<{ id: string; name: string }>>(`${base}/api/2.0/registers`, token),
    ]);
    const outletName = new Map((outlets.data ?? []).map((o) => [o.id, o.name]));
    const registerName = new Map((registers.data ?? []).map((r) => [r.id, r.name]));

    /* Product names from our own stock snapshot, written onto each line so it
       still reads sensibly after the product is retired from the catalogue. */
    const { data: stock } = await admin.from("lightspeed_stock").select("product_id, sku, name, brand");
    const product = new Map((stock ?? []).map((p) => [p.product_id as string, p]));

    // ── sales ─────────────────────────────────────────────────────────
    let cursor = await readState(admin, "sales");
    const startedAt = cursor;
    let salesSeen = 0, pages = 0, salesCaughtUp = false;
    const statusSeen: Record<string, number> = {};

    for (; pages < SALE_PAGES_PER_RUN; pages++) {
      const body = await lsGet<Page<LsSale>>(`${base}/api/2.0/sales?page_size=${PAGE}&after=${cursor}`, token);
      const data = body.data ?? [];
      if (!data.length) { salesCaughtUp = true; break; }

      const syncedAt = new Date().toISOString();
      const rows = data.map((s) => {
        const when = s.sale_date ?? s.created_at ?? syncedAt;
        const status = (s.status ?? "").toUpperCase();
        statusSeen[status || "(none)"] = (statusSeen[status || "(none)"] ?? 0) + 1;
        return {
          id: s.id,
          outlet_id: s.outlet_id ?? null,
          outlet: (s.outlet_id && outletName.get(s.outlet_id)) ?? null,
          register_id: s.register_id ?? null,
          register: (s.register_id && registerName.get(s.register_id)) ?? null,
          user_id: s.user_id ?? null,
          customer_id: s.customer_id ?? null,
          invoice_number: blank(s.invoice_number),
          receipt_number: blank(s.receipt_number),
          status,
          state: blank(s.state),
          source: blank(s.source),
          return_for: s.return_for ?? null,
          note: blank(s.note),
          total_price: s.total_price ?? null,
          total_tax: s.total_tax ?? null,
          total_price_incl: s.total_price_incl ?? null,
          total_loyalty: s.total_loyalty ?? null,
          sale_date: when,
          sale_day: kuwaitDay(when),
          ls_created_at: validTs(s.created_at),
          ls_updated_at: validTs(s.updated_at),
          ls_deleted_at: validTs(s.deleted_at),
          version: s.version,
          line_count: (s.line_items ?? []).length,
          payments: (s.payments ?? []).map((p) => ({ name: p.name ?? null, amount: p.amount ?? null, payment_date: p.payment_date ?? null })),
          synced_at: syncedAt,
          updated_at: syncedAt,
        };
      });
      const items = data.flatMap((s) => (s.line_items ?? []).map((li) => {
        const p = li.product_id ? product.get(li.product_id) : undefined;
        return {
          id: li.id,
          sale_id: s.id,
          product_id: li.product_id ?? null,
          sku: p?.sku ?? null,
          name: p?.name ?? null,
          brand: p?.brand ?? null,
          quantity: Number(li.quantity ?? 0),
          price: li.price ?? null,
          price_total: li.price_total ?? null,
          discount_total: li.discount_total ?? null,
          tax_total: li.tax_total ?? null,
          is_return: !!li.is_return,
          status: blank(li.status),
          salesperson_id: li.salesperson_id ?? null,
          sequence: li.sequence ?? null,
          synced_at: syncedAt,
        };
      }));

      const { error: e1 } = await admin.from("lightspeed_sales").upsert(rows, { onConflict: "id" });
      if (e1) throw new Error(`sales upsert: ${e1.message}`);
      /* Lines are replaced wholesale per sale: an edited or voided sale can
         drop a line, and an upsert alone would leave the old one behind. */
      const ids = rows.map((r) => r.id);
      const { error: e2 } = await admin.from("lightspeed_sale_items").delete().in("sale_id", ids);
      if (e2) throw new Error(`sale items clear: ${e2.message}`);
      if (items.length) {
        const { error: e3 } = await admin.from("lightspeed_sale_items").insert(items);
        if (e3) throw new Error(`sale items insert: ${e3.message}`);
      }
      salesSeen += rows.length;

      const max = body.version?.max;
      if (max == null || max === cursor) { salesCaughtUp = true; break; }
      cursor = max;
      await writeState(admin, "sales", { cursor, rows_last_run: salesSeen, caught_up: false });
    }
    await writeState(admin, "sales", {
      cursor, rows_last_run: salesSeen, caught_up: salesCaughtUp,
      last_success_at: new Date().toISOString(), last_error: null,
    });

    // ── customers: the same walk, kept minimal ─────────────────────────
    let cCursor = await readState(admin, "customers");
    let customersSeen = 0, cPages = 0, customersCaughtUp = false;
    for (; cPages < CUSTOMER_PAGES_PER_RUN; cPages++) {
      const body = await lsGet<Page<LsCustomer>>(`${base}/api/2.0/customers?page_size=${PAGE}&after=${cCursor}`, token);
      const data = body.data ?? [];
      if (!data.length) { customersCaughtUp = true; break; }
      const syncedAt = new Date().toISOString();
      const rows = data.map((c) => ({
        id: c.id,
        customer_code: blank(c.customer_code),
        name: blank(c.name) ?? blank([blank(c.first_name), blank(c.last_name)].filter(Boolean).join(" ")),
        first_name: blank(c.first_name),
        last_name: blank(c.last_name),
        mobile: blank(c.mobile),
        phone: blank(c.phone),
        email: blank(c.email),
        date_of_birth: validDate(c.date_of_birth),
        do_not_email: !!c.do_not_email,
        enable_promotional_sms: !!c.enable_promotional_sms,
        privacy_consent: !!c.privacy_consent,
        customer_group_id: c.customer_group_id ?? null,
        year_to_date: c.year_to_date ?? null,
        ls_created_at: validTs(c.created_at),
        ls_updated_at: validTs(c.updated_at),
        ls_deleted_at: validTs(c.deleted_at),
        version: c.version,
        synced_at: syncedAt,
        updated_at: syncedAt,
      }));
      const { error } = await admin.from("lightspeed_customers").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`customers upsert: ${error.message}`);
      customersSeen += rows.length;
      const max = body.version?.max;
      if (max == null || max === cCursor) { customersCaughtUp = true; break; }
      cCursor = max;
      await writeState(admin, "customers", { cursor: cCursor, rows_last_run: customersSeen, caught_up: false });
    }
    await writeState(admin, "customers", {
      cursor: cCursor, rows_last_run: customersSeen, caught_up: customersCaughtUp,
      last_success_at: new Date().toISOString(), last_error: null,
    });

    const summary = {
      ok: true, took_ms: Date.now() - t0, token_refreshed: refreshed,
      sales: { seen: salesSeen, pages, cursor_from: startedAt, cursor_to: cursor, caught_up: salesCaughtUp, statuses: statusSeen },
      customers: { seen: customersSeen, pages: cPages, cursor_to: cCursor, caught_up: customersCaughtUp },
    };
    await finish("ok", { products_synced: salesSeen, error: salesCaughtUp ? null : `not yet caught up (cursor ${cursor})` });
    return json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish("error", { error: msg.slice(0, 500) });
    await admin.from("lightspeed_sync_state").upsert(
      { kind: "sales", last_error: msg.slice(0, 500), last_run_at: new Date().toISOString() }, { onConflict: "kind" });
    return json({ error: msg, took_ms: Date.now() - t0 }, 500);
  }
});
