/**
 * Lightspeed's own product type for every product, kept current once a day.
 *
 * Lightspeed is the source of truth for what a product is — Watches, Straps,
 * Consignment Watches, Pre-owned Watches and so on — and staff already set it
 * there. This copies it, with the brand, supplier and variant parent, into
 * lightspeed_products so the stock analyst can tell owned stock from
 * consignment and pre-owned without anyone keeping a second list here.
 *
 * It only reads from Lightspeed and only writes lightspeed_products and its
 * own run log (stock_analyst_runs). Products Lightspeed no longer returns are
 * kept, with their last synced_at, so history still has a type to join to.
 * Its own log keeps it out of lightspeed_sync_log, which the back office reads
 * for "last synced". About ten requests a day against Lightspeed's
 * ~200/hour limit, with the token taken through the shared lease.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { lightspeedToken, callerAllowed } from "../_shared/lightspeedAuth.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

interface LsProduct {
  id: string; name?: string; sku?: string; is_active?: boolean; active?: boolean; has_inventory?: boolean;
  product_type_id?: string | null; type?: { id?: string; name?: string } | null;
  brand?: { name?: string } | null; supplier?: { name?: string } | null;
  variant_parent_id?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null;
}

const validTs = (s: unknown) =>
  typeof s === "string" && /^\d{4}-/.test(s) && Number(s.slice(0, 4)) >= 1970 ? s : null;

async function get(url: string, token: string) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 429) { await new Promise((x) => setTimeout(x, 3000)); continue; }
    if (!r.ok) throw new Error(`${new URL(url).pathname} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  }
  throw new Error(`${new URL(url).pathname} → still rate limited`);
}

Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!(await callerAllowed(req, admin))) return json({ error: "Unauthorized" }, 401);

  const { data: run } = await admin.from("stock_analyst_runs").insert({ job: "products", status: "running" }).select("id").single();
  const finish = (status: "ok" | "error", detail: Record<string, unknown>) =>
    admin.from("stock_analyst_runs").update({ status, detail, finished_at: new Date().toISOString() }).eq("id", run!.id);

  try {
    const { base, token } = await lightspeedToken(admin);

    const typeBody = await get(`${base}/api/2.0/product_types?page_size=500`, token);
    const typeName = new Map<string, string>(
      ((typeBody.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));

    const products: LsProduct[] = [];
    let after = 0;
    for (let page = 0; page < 60; page++) {
      const body = await get(`${base}/api/2.0/products?page_size=500&after=${after}`, token);
      const data: LsProduct[] = body.data ?? [];
      products.push(...data);
      const max = body.version?.max;
      if (!data.length || max == null || max === after) break;
      after = max;
    }

    const syncedAt = new Date().toISOString();
    const rows = products.map((p) => {
      const typeId = p.product_type_id ?? p.type?.id ?? null;
      return {
        product_id: p.id,
        name: p.name ?? null,
        sku: p.sku ?? null,
        brand: p.brand?.name?.trim() || null,
        supplier: p.supplier?.name?.trim() || null,
        product_type_id: typeId,
        product_type: p.type?.name ?? (typeId ? typeName.get(typeId) ?? null : null),
        variant_parent_id: p.variant_parent_id ?? null,
        is_active: p.is_active ?? p.active ?? null,
        has_inventory: p.has_inventory ?? null,
        ls_created_at: validTs(p.created_at),
        ls_updated_at: validTs(p.updated_at),
        synced_at: syncedAt,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("lightspeed_products").upsert(rows.slice(i, i + 500), { onConflict: "product_id" });
      if (error) throw new Error(`upsert: ${error.message}`);
    }

    const untyped = rows.filter((r) => !r.product_type).length;
    const detail = { products: rows.length, types: typeName.size, untyped };
    await finish("ok", detail);
    return json({ ok: true, ...detail });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish("error", { error: msg.slice(0, 500) });
    return json({ ok: false, error: msg }, 500);
  }
});
