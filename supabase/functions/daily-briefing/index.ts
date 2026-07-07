// Daily briefing email — key numbers from Timekeeper Online, sent via Resend.
// Callers: pg_cron (x-sync-key) or admin/manager JWT (Send test button).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

const kd = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // authorize: shared sync key (cron) or admin/manager JWT
  const { data: auth } = await admin.from("lightspeed_auth").select("sync_key").eq("id", 1).single();
  const syncKey = req.headers.get("x-sync-key");
  let allowed = !!syncKey && syncKey === auth?.sync_key;
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

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = (Deno.env.get("BRIEFING_TO") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!apiKey || to.length === 0) {
    return json({ error: "Not configured: set RESEND_API_KEY and BRIEFING_TO secrets in Supabase" }, 400);
  }
  const from = Deno.env.get("BRIEFING_FROM") ?? "Timekeeper Online <onboarding@resend.dev>";

  // Kuwait dates
  const nowKw = new Date(Date.now() + 3 * 3600_000);
  const todayKw = nowKw.toISOString().slice(0, 10);
  const yestKw = new Date(nowKw.getTime() - 86400_000).toISOString().slice(0, 10);

  const [salesQ, fuQ, poQ, lowQ, stockQ, leaveQ] = await Promise.all([
    admin.from("cases").select("amount_kd, sale_items(amount_kd)").eq("case_type", "Sale").eq("deleted", false).eq("date_logged", yestKw),
    admin.from("cases").select("id", { count: "exact", head: true }).eq("case_type", "Follow-up").eq("status", "Open").eq("deleted", false).lt("promised_callback", todayKw),
    admin.from("purchase_orders").select("total_cost, amount_paid").not("status", "in", '("Received","Cancelled","Returned")'),
    admin.from("lightspeed_low_stock").select("product_id", { count: "exact", head: true }),
    admin.from("lightspeed_stock_summary").select("*").single(),
    admin.from("leave_records").select("id", { count: "exact", head: true }).eq("approval_status", "Pending"),
  ]);

  const caseTotal = (c: { amount_kd: number | null; sale_items: { amount_kd: number }[] }) =>
    c.sale_items?.length ? c.sale_items.reduce((s, i) => s + Number(i.amount_kd), 0) : Number(c.amount_kd ?? 0);
  const salesRows = (salesQ.data ?? []) as { amount_kd: number | null; sale_items: { amount_kd: number }[] }[];
  const salesYest = salesRows.reduce((s, c) => s + caseTotal(c), 0);
  const poBalance = ((poQ.data ?? []) as { total_cost: number; amount_paid: number }[]).reduce(
    (s, p) => s + Number(p.total_cost ?? 0) - Number(p.amount_paid ?? 0), 0);
  const deadValue = Number(stockQ.data?.dead_value ?? 0);
  const stockValue = Number(stockQ.data?.retail_value ?? 0);

  const line = (label: string, value: string, color = "#0f172a") =>
    `<tr><td style="padding:8px 12px;color:#64748b;font-size:14px">${label}</td>
     <td style="padding:8px 12px;font-weight:700;color:${color};font-size:14px;text-align:right">${value}</td></tr>`;

  const appUrl = "https://alalramadhan-kuwait.github.io/timekeeper-online/index.html#/";
  const html = `
  <div style="font-family:system-ui,Arial;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="background:#0f172a;color:#fff;padding:16px 20px">
      <div style="font-size:18px;font-weight:800">⏱ Timekeeper Daily Briefing</div>
      <div style="color:#94a3b8;font-size:13px">${todayKw} · numbers as of this morning</div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      ${line(`Sales yesterday (${yestKw})`, `${kd(salesYest)} KD · ${salesRows.length} sales`, "#059669")}
      ${line("Overdue follow-ups", String(fuQ.count ?? 0), (fuQ.count ?? 0) > 0 ? "#dc2626" : "#059669")}
      ${line("Supplier balance outstanding", `${kd(poBalance)} KD`, poBalance > 0 ? "#dc2626" : "#059669")}
      ${line("Stock retail value", `${kd(stockValue)} KD`)}
      ${line("Not-moving stock (90d)", `${kd(deadValue)} KD`, deadValue > 0 ? "#e11d48" : "#059669")}
      ${line("Low stock items", String(lowQ.count ?? 0), (lowQ.count ?? 0) > 0 ? "#d97706" : "#059669")}
      ${line("Pending leave requests", String(leaveQ.count ?? 0), (leaveQ.count ?? 0) > 0 ? "#d97706" : "#059669")}
    </table>
    <div style="padding:14px 20px;border-top:1px solid #e2e8f0">
      <a href="${appUrl}" style="color:#2563eb;font-size:13px">Open Timekeeper Online →</a>
    </div>
  </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: `Timekeeper Daily Briefing — ${todayKw}`, html }),
  });
  const resBody = await res.text();
  if (!res.ok) return json({ error: `Resend ${res.status}: ${resBody.slice(0, 300)}` }, 500);

  return json({ ok: true, sent_to: to, sales_yesterday: salesYest });
});
