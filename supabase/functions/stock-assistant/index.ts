// Ask: the owners' stock analyst chat.
//
// The model never writes SQL. It may only call the fixed, tested calculations
// below (Phase 2 migration 20261008133553), which run as the service role.
// Every reply is checked before it is shown: each number in it must appear in
// what the calculations returned. A reply that fails gets one retry on the
// stronger model; if that fails too, the owner gets the data without a reading.
//
// Callers:
//   - an owner listed in stock_ai_access, with their own session (JWT);
//   - a test run with x-sync-key and as_user (an owner's id), costed as "test".
// Every model call is reserved against the one monthly AI budget first
// (ai_budget_reserve) and settled with its real cost after.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.129.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

const PRIMARY = "claude-haiku-5-5";
const RETRY = "claude-sonnet-5-5";
// USD per million tokens: input, cached input read, cache write, output
const PRICE: Record<string, [number, number, number, number]> = {
  "claude-haiku-5-5": [0.10, 0.01, 0.125, 0.50],
  "claude-sonnet-5-5": [2.00, 0.10, 2.50, 10.00],
};
const MAX_TOKENS = 4000;
const MAX_ROUNDS = 6;
const HISTORY_TURNS = 10;

const OUTLETS = ["avenues", "time_gallery", "hq", "online", "whatsapp"];

const TOOLS: Anthropic.Tool[] = [
  {
    name: "find_products",
    description: "Find products by words from the name, SKU or brand. Use before anything about a named product. Returns matches with stock on hand now and whether the words matched more than one product.",
    input_schema: { type: "object", properties: {
      text: { type: "string", description: "Words from the product name, SKU or brand" },
      limit: { type: "integer", minimum: 1, maximum: 30 } }, required: ["text"] },
  },
  {
    name: "explain_product",
    description: "Everything about one product: stock now and by outlet, sales over 30/90/180/365 days, monthly sales for a year, pace, cover, margin, class with its rule, the recommendation with every rule passed or failed, open purchase orders.",
    input_schema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
  },
  {
    name: "stock_summary",
    description: "Stock and its value at cost and retail, kept apart by ownership (owned = the company's money, consignment = the supplier's, pre-owned), by product type, outlet and class (fast/healthy/slow/dead/new), with sales and data issues.",
    input_schema: { type: "object", properties: {
      brand: { type: "string" }, outlet: { type: "string", enum: OUTLETS }, product_type: { type: "string" } } },
  },
  {
    name: "sales_ranking",
    description: "Best sellers by revenue and by units over a period, and the worst (dead or slow stock on the shelf long enough to judge, by unsold value).",
    input_schema: { type: "object", properties: {
      days: { type: "integer", minimum: 7, maximum: 730, description: "Period in days ending yesterday; default 90" },
      brand: { type: "string" }, outlet: { type: "string", enum: OUTLETS }, product_type: { type: "string" },
      ownership: { type: "string", enum: ["owned", "consignment", "pre_owned"] },
      limit: { type: "integer", minimum: 1, maximum: 50 } } },
  },
  {
    name: "brand_performance",
    description: "Sales by whole calendar months against the months just before or the same months a year earlier. With a brand: that brand with its monthly series. Without: a table of brands.",
    input_schema: { type: "object", properties: {
      brand: { type: "string" }, months: { type: "integer", minimum: 1, maximum: 24 },
      compare: { type: "string", enum: ["previous", "last_year"] },
      outlet: { type: "string", enum: OUTLETS }, product_type: { type: "string" } } },
  },
  {
    name: "explain_change",
    description: "Why a brand's or a product's sales changed: each possible cause marked present, absent or cannot_tell, with its evidence (concentration in a few models, stock-outs, new launches, discounting, price mix, outlet shift, seasonality), plus what the data cannot see. Only causes marked present may be given as reasons.",
    input_schema: { type: "object", properties: {
      brand: { type: "string" }, product_id: { type: "string" },
      months: { type: "integer", minimum: 1, maximum: 12, description: "Length of the recent period and of the period it is compared with" },
      outlet: { type: "string", enum: OUTLETS } } },
  },
  {
    name: "reorder_advice",
    description: "What to buy, what to leave to the owner's judgement, what to ask consignment suppliers for or to swap, and what to avoid, each with its reasons and the rules applied. The only source of buy or avoid advice.",
    input_schema: { type: "object", properties: {
      brand: { type: "string" }, outlet: { type: "string", enum: OUTLETS }, product_type: { type: "string" },
      target_months: { type: "number", minimum: 1, maximum: 12, description: "Months of stock to cover; default 3" },
      limit: { type: "integer", minimum: 1, maximum: 50 } } },
  },
  {
    name: "budget_plan",
    description: "How to spend a purchasing budget in KD on owned stock: lines ranked by score with caps (no model over 20%, no brand over 40% unless one brand is asked for). The budget is a ceiling.",
    input_schema: { type: "object", properties: {
      budget: { type: "number", minimum: 1 }, brand: { type: "string" }, product_type: { type: "string" },
      target_months: { type: "number", minimum: 1, maximum: 12 } }, required: ["budget"] },
  },
];

const RPC: Record<string, string> = {
  find_products: "find_products", explain_product: "explain_product", stock_summary: "stock_summary",
  sales_ranking: "sales_ranking", brand_performance: "brand_performance", explain_change: "explain_change",
  reorder_advice: "reorder_advice", budget_plan: "budget_plan",
};

const SYSTEM = `You are the stock analyst for Time Keeper, a watch retailer in Kuwait, answering its owners. Money is in Kuwaiti dinars (KD).

Data
- Answer only from the results of the tools. Call a tool for every question about stock, sales, brands, products or buying. Never answer figures from memory or from earlier turns without calling again when the question changes.
- Quote numbers exactly as the tools give them. You may round KD to whole dinars and fractions to whole percent (0.589 = 59%). Never add, subtract, average or otherwise compute a figure the tools did not return.
- For a named product, call find_products first. If it matches more than one product and the question does not settle which, list the matches with their stock and ask which one.
- Lightspeed names brands and products in English. When the owner writes a name in Arabic letters (نيفادا, دنيسون, هوفمان), use its English spelling in tool calls (Nivada, Dennison, Hoffman). If a brand finds nothing, look it up with find_products in English before saying it is not there.
- Outlets: avenues (Time Keeper - Avenues), time_gallery (Time Gallery), hq (the HQ stock, which online and WhatsApp orders ship from).
- Stock is as of the morning sync; sales are through yesterday. The app shows these dates above your answer, so do not repeat them at length.

Ownership
- Owned stock is the company's money. Consignment stock belongs to the supplier: never suggest buying it; suggest asking the supplier for more, or to swap or take back. Pre-owned pieces are one-offs. Keep the three apart.

Advice and reasons
- Buy, avoid or "your call" advice comes only from reorder_advice, budget_plan or explain_product, with the reasons they give. Never advise buying or avoiding from total sales alone.
- For "why" questions call explain_change. Give as causes only signals marked present, with their numbers. If none is present, say the data does not show why, and name what the data cannot see.
- Say so when a figure is estimated (shelf age, rebuilt past stock, pace while out of stock) or when data is missing (products without a type, negative stock).

Form
- Separate what the data says from your reading of it. In English use the headings "Facts" and "Reading"; in Arabic "الأرقام" and "قراءتي". Leave out "Reading" when there is nothing to interpret.
- Reply in the language of the question. Arabic questions get simple Kuwaiti Arabic. Keep product names and SKUs as Lightspeed writes them.
- Phones first: short lines, short bullet lists, tables of at most four columns and ten rows.
- Follow-up questions continue the conversation: keep the brand, product, outlet and period from before unless the owner changes them.
- Never mention tools, functions, queries or system errors by name. If figures could not be fetched, say plainly that they are not available right now.`;

type Json = Record<string, unknown>;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: { action?: string; conversation_id?: string; message?: string; as_user?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  // who is asking
  let userId: string | null = null;
  let purpose: "production" | "test" = "production";
  const syncKey = req.headers.get("x-sync-key");
  if (syncKey) {
    const { data: auth } = await admin.from("lightspeed_auth").select("sync_key").eq("id", 1).single();
    if (!auth?.sync_key || syncKey !== auth.sync_key) return json({ error: "Unauthorized" }, 401);
    userId = body.as_user ?? null;
    purpose = "test";
  } else {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    userId = userData?.user?.id ?? null;
  }
  if (!userId) return json({ error: "Unauthorized" }, 401);
  const { data: access } = await admin.from("stock_ai_access").select("user_id").eq("user_id", userId).maybeSingle();
  if (!access) return json({ error: "Ask is limited to the owners." }, 403);

  const { data: settings } = await admin.from("ai_settings").select("key, value");
  const setting = (k: string) => (settings ?? []).find((s: { key: string }) => s.key === k)?.value;
  const enabled = setting("chat_enabled") === true;
  const hasKey = !!Deno.env.get("ANTHROPIC_API_KEY");

  if (body.action === "status") {
    const { data: budget } = await admin.rpc("ai_budget_status");
    return json({ ok: true, enabled, has_key: hasKey, budget });
  }

  if (body.action !== "ask") return json({ error: "Unknown action" }, 400);
  const question = (body.message ?? "").trim();
  if (!question) return json({ error: "Type a question." }, 400);
  if (question.length > 2000) return json({ error: "That question is too long." }, 400);
  if (!enabled && purpose !== "test") return json({ error: "Ask is not switched on yet." }, 409);
  if (!hasKey) return json({ error: "The AI key is not set up yet." }, 503);

  // the conversation, or a new one
  let conversationId = body.conversation_id ?? null;
  let context: Json = {};
  if (conversationId) {
    const { data: conv } = await admin.from("ai_conversations").select("id, user_id, context").eq("id", conversationId).maybeSingle();
    if (!conv || conv.user_id !== userId) return json({ error: "Conversation not found" }, 404);
    context = (conv.context ?? {}) as Json;
  } else {
    const { data: conv, error } = await admin.from("ai_conversations")
      .insert({ user_id: userId, language: /[؀-ۿ]/.test(question) ? "ar" : "en" })
      .select("id").single();
    if (error) return json({ error: error.message }, 500);
    conversationId = conv.id;
  }

  const { data: past } = await admin.from("ai_messages").select("role, content")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(HISTORY_TURNS * 2);
  // turns alternate, starting with the owner; a turn that got no answer is merged into the next
  const history: Anthropic.MessageParam[] = [];
  for (const m of (past ?? []).reverse() as { role: "user" | "assistant"; content: string }[]) {
    const last = history[history.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
    else history.push({ role: m.role, content: m.content });
  }
  while (history.length && history[0].role !== "user") history.shift();
  if (history.length && history[history.length - 1].role === "user") history.pop();

  const { data: userMsg } = await admin.from("ai_messages")
    .insert({ conversation_id: conversationId, role: "user", content: question }).select("id").single();

  const contextNote = Object.keys(context).length
    ? `\n\n[Earlier in this conversation the owner was looking at: ${JSON.stringify(context)}]` : "";
  // the reply's language follows the question, decided here rather than left to the model
  const langNote = /[\u0600-\u06FF]/.test(question) ? "\n\n[Reply in Kuwaiti Arabic.]" : "\n\n[Reply in English.]";
  const firstTurn: Anthropic.MessageParam = { role: "user", content: question + contextNote + langNote };

  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  const started = Date.now();

  let run = await converse(client, admin, PRIMARY, purpose === "test" ? "test" : "production", userId, [...history, firstTurn]);
  let checks = run.error ? null : groundingCheck(run.reply, run.results, question, history);
  let model: string = PRIMARY;
  const attempts: Json[] = [{ model: PRIMARY, checks, error: run.error, cost_usd: run.cost }];

  if (run.error === "budget") {
    return json({ error: "This month's AI budget is used up.", conversation_id: conversationId }, 402);
  }
  const ledgerIds = [...run.ledger];
  if (run.error || !checks?.ok) {
    // one retry on the stronger model, told what failed
    const why = run.error ? "" : `\n\n[Your previous answer used figures that are not in the tool results: ${checks!.ungrounded.join(", ")}. Use only figures the tools return.]`;
    const retry = await converse(client, admin, RETRY, purpose === "test" ? "test" : "retry", userId,
      [...history, { role: "user", content: question + contextNote + langNote + why }]);
    ledgerIds.push(...retry.ledger);
    const retryChecks = retry.error ? null : groundingCheck(retry.reply, retry.results, question, history);
    attempts.push({ model: RETRY, checks: retryChecks, error: retry.error, cost_usd: retry.cost });
    if (!retry.error && retryChecks?.ok) { run = retry; checks = retryChecks; model = RETRY; }
    else {
      // fall back to the figures themselves, with no reading
      const base = retry.results.length ? retry : run;
      if (!base.results.length) {
        return json({ error: "The analyst could not answer just now. Try again in a minute.", conversation_id: conversationId }, 502);
      }
      run = { ...base, reply: plainData(base.results, question) };
      checks = { ok: true, ungrounded: [], numbers_checked: 0, fallback: true };
      model = "data-only";
    }
  }

  const strip = buildStrip(run.results);
  const newContext = { ...context, ...run.context };

  const { data: aMsg } = await admin.from("ai_messages").insert({
    conversation_id: conversationId, role: "assistant", content: run.reply,
    understood: run.calls.map((c) => ({ tool: c.name, input: c.input })),
    calls: run.calls, results: run.results,
    checks: { ...checks, attempts, strip, ms: Date.now() - started },
    model,
  }).select("id").single();
  await admin.from("ai_conversations").update({ context: newContext, updated_at: new Date().toISOString() }).eq("id", conversationId);
  // link this turn's spend to the answer
  if (aMsg?.id && ledgerIds.length) await admin.from("ai_usage_ledger").update({ message_id: aMsg.id }).in("id", ledgerIds);

  return json({
    ok: true, conversation_id: conversationId, message_id: aMsg?.id, question_id: userMsg?.id,
    reply: run.reply, strip, model, ms: Date.now() - started,
  });
});

interface Call { name: string; input: Json; ms: number; error?: string }
interface Run {
  reply: string; calls: Call[]; results: Json[]; context: Json; cost: number; ledger: number[];
  error?: "budget" | "model" | "rounds";
}

/** One model's attempt at an answer: the tool loop, every call reserved and settled. */
async function converse(client: Anthropic, admin: SupabaseClient, model: string, purpose: string,
                        userId: string, messages: Anthropic.MessageParam[]): Promise<Run> {
  const calls: Call[] = []; const results: Json[] = []; const ledger: number[] = [];
  let context: Json = {}; let cost = 0;
  const msgs = [...messages];
  const [pin, pcache, pwrite, pout] = PRICE[model];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const inEstimate = Math.ceil((SYSTEM.length + JSON.stringify(TOOLS).length + JSON.stringify(msgs).length) / 3);
    const maxUsd = Number(((inEstimate * pin + MAX_TOKENS * pout) / 1e6 * 1.25).toFixed(6));
    const { data: ledgerId, error: resErr } = await admin.rpc("ai_budget_reserve", {
      p_provider: "anthropic", p_model: model, p_purpose: purpose, p_max_usd: maxUsd, p_user: userId, p_message: null,
    });
    if (resErr || ledgerId === null) return { reply: "", calls, results, context, cost, ledger, error: "budget" };
    ledger.push(ledgerId as number);

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model, max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS, messages: msgs,
      });
    } catch (e) {
      await admin.rpc("ai_budget_settle", { p_id: ledgerId, p_cost_usd: 0, p_input: 0, p_cached: 0, p_cache_write: 0, p_output: 0, p_ok: false });
      console.error("model call failed", model, String(e));
      return { reply: "", calls, results, context, cost, ledger, error: "model" };
    }
    const u = response.usage;
    const cached = u.cache_read_input_tokens ?? 0, written = u.cache_creation_input_tokens ?? 0;
    const callCost = (u.input_tokens * pin + cached * pcache + written * pwrite + u.output_tokens * pout) / 1e6;
    cost += callCost;
    await admin.rpc("ai_budget_settle", { p_id: ledgerId, p_cost_usd: callCost, p_input: u.input_tokens,
      p_cached: cached, p_cache_write: written, p_output: u.output_tokens, p_ok: true });

    if (response.stop_reason === "pause_turn") { msgs.push({ role: "assistant", content: response.content }); continue; }
    const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || uses.length === 0) {
      const reply = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { reply, calls, results, context, cost, ledger };
    }

    msgs.push({ role: "assistant", content: response.content });
    const out: Anthropic.ToolResultBlockParam[] = [];
    for (const use of uses) {
      const input = (use.input ?? {}) as Json;
      const t0 = Date.now();
      const fn = RPC[use.name];
      if (!fn) { out.push({ type: "tool_result", tool_use_id: use.id, content: "Unknown tool", is_error: true }); continue; }
      const args: Json = {};
      for (const [k, v] of Object.entries(input)) if (v !== null && v !== undefined && v !== "") args[`p_${k}`] = v;
      let { data, error } = await admin.rpc(fn, args);
      // a busy moment can push a calculation past the 8 s limit; try once more
      if (error && /statement timeout/i.test(error.message)) ({ data, error } = await admin.rpc(fn, args));
      calls.push({ name: use.name, input, ms: Date.now() - t0, ...(error ? { error: error.message } : {}) });
      if (error) { out.push({ type: "tool_result", tool_use_id: use.id, content: `Error: ${error.message}`, is_error: true }); continue; }
      results.push({ tool: use.name, input, result: data });
      context = { ...context, ...remember(use.name, input, data) };
      out.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(data) });
    }
    msgs.push({ role: "user", content: out });
  }
  return { reply: "", calls, results, context, cost, ledger, error: "rounds" };
}

/** What a follow-up question should keep: brand, product, outlet, period. */
function remember(tool: string, input: Json, data: unknown): Json {
  const c: Json = { last_question_type: tool };
  for (const k of ["brand", "outlet", "product_type", "days", "months", "compare", "ownership", "budget"]) if (input[k] !== undefined) c[k] = input[k];
  if (tool === "explain_product" || (tool === "explain_change" && input.product_id)) {
    c.product_id = input.product_id;
    const name = (data as Json)?.product && ((data as Json).product as Json).name;
    if (name) c.product_name = name;
  }
  return c;
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const toLatin = (s: string) => s.replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10))
  .replace(/٫/g, ".").replace(/٬/g, ",");

/** Every number the tools returned, from values and from inside their text. */
function knownNumbers(results: Json[], extra: string[]): { nums: number[]; dates: Set<string> } {
  const nums: number[] = []; const dates = new Set<string>();
  const fromText = (s: string) => {
    for (const d of s.match(/\d{4}-\d{2}-\d{2}/g) ?? []) dates.add(d);
    for (const n of s.replace(/(\d),(?=\d{3})/g, "$1").match(/-?\d+(?:\.\d+)?/g) ?? []) nums.push(Number(n));
  };
  const walk = (v: unknown) => {
    if (typeof v === "number") nums.push(v);
    else if (typeof v === "string") fromText(v);
    else if (Array.isArray(v)) v.forEach(walk);
    // field names carry periods too ("sold_90d"), which answers may quote
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { fromText(k.replace(/_/g, " ")); walk(x); }
  };
  results.forEach(walk);
  extra.forEach((s) => fromText(toLatin(s)));
  return { nums, dates };
}

/** The reply may only use numbers the calculations gave (or the owner typed). */
function groundingCheck(reply: string, results: Json[], question: string, history: Anthropic.MessageParam[]) {
  const said = history.filter((m) => m.role === "user").map((m) => String(m.content));
  const { nums, dates } = knownNumbers(results, [question, ...said]);
  let text = toLatin(reply);
  // dates are checked whole, then removed so their parts are not checked again
  const badDates: string[] = [];
  text = text.replace(/\d{4}-\d{2}-\d{2}/g, (d) => { if (!dates.has(d)) badDates.push(d); return " "; });
  const ungrounded: string[] = [...badDates];
  let checked = badDates.length;
  const re = /(-?\d[\d,]*(?:\.\d+)?)(\s*[%\u066A])?/g;
  for (const m of text.matchAll(re)) {
    const raw = m[1].replace(/,(?=\d{3}\b)/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    checked++;
    if (Number.isInteger(n) && Math.abs(n) <= 12) continue;              // list numbering, months, small counts
    if (n >= 2020 && n <= 2030 && Number.isInteger(n)) continue;          // a year
    const pct = !!m[2];
    // signs are compared loosely: "RQ - 23" in a product name reads as -23 in some spellings
    const a = Math.abs(n);
    const ok = nums.some((k) => { const b = Math.abs(k); return Math.abs(b - a) <= Math.max(0.5, b * 0.005)
      || (pct && Math.abs(b * 100 - a) <= 0.6); });
    if (!ok) ungrounded.push(m[0].trim());
  }
  return { ok: ungrounded.length === 0, ungrounded: [...new Set(ungrounded)], numbers_checked: checked, fallback: false };
}

/** What the app shows above every answer: period, freshness, gaps. Written here, not by the model. */
function buildStrip(results: Json[]) {
  const headers = results.map((r) => (r.result as Json)?.header as Json | undefined).filter(Boolean) as Json[];
  const h = headers[0] ?? {};
  const notes = new Set<string>();
  const walk = (v: unknown, key = "") => {
    if (typeof v === "string" && /confidence|class_confidence/.test(key) && /estimat/i.test(v)) notes.add(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  results.forEach((r) => walk(r.result));
  for (const r of results) {
    const issues = (r.result as Json)?.data_issues as Json | undefined;
    if (issues?.untyped_products) notes.add(`${issues.untyped_products} products in stock have no type in Lightspeed`);
    if (issues?.negative_products) notes.add(`${issues.negative_products} products show negative stock`);
  }
  return {
    period: h.period ?? (h.period_days ? `${h.period_days} days` : null),
    compared_with: h.compared_with ?? null,
    sales_through: h.sales_through ?? null,
    stock_as_of: h.stock_as_of ?? null,
    stock_basis: h.stock_basis ?? null,
    filters: h.filters ?? null,
    notes: [...notes].slice(0, 4),
    sources: results.map((r) => r.tool),
  };
}

/** When no reading passes the checks: the key figures, straight from the calculations. */
function plainData(results: Json[], question: string): string {
  const ar = /[\u0600-\u06FF]/.test(question);
  const head = ar ? "ما قدرت أعطيك قراءة موثوقة لهذا السؤال. هذي الأرقام كما هي من الحسابات:" :
    "I could not give a reading I can stand behind. Here are the figures as the calculations returned them:";
  const words = (k: string) => k.replace(/_/g, " ");
  const figures = (o: Json) => Object.entries(o).filter(([k, v]) => typeof v === "number" && k !== "score").slice(0, 5)
    .map(([k, v]) => `${words(k)} ${(v as number).toLocaleString("en-US")}`).join(", ");
  const labelOf = (o: Json) => String(o.name ?? o.brand ?? o.signal ?? o.class ?? o.product_type ?? o.outlet ?? o.ownership ?? "");
  const lines: string[] = [head];
  for (const r of results.slice(0, 3)) {
    lines.push("");
    for (const [k, v] of Object.entries((r.result as Json) ?? {})) {
      if (["header", "rules", "notes", "confidence", "class_confidence"].includes(k) || v === null) continue;
      if (typeof v === "number") { lines.push(`- ${words(k)}: ${v.toLocaleString("en-US")}`); continue; }
      if (Array.isArray(v)) {
        lines.push(`**${words(k)}**`);
        for (const item of v.slice(0, 8)) {
          const o = item as Json;
          const f = figures(o);
          lines.push(`- ${[labelOf(o), o.ownership && labelOf(o) !== o.ownership ? `(${o.ownership})` : ""].join(" ").trim()}${f ? `: ${f}` : ""}${o.status ? ` (${o.status})` : ""}`);
        }
      } else if (typeof v === "object") {
        lines.push(`**${words(k)}**`);
        for (const [kk, vv] of Object.entries(v as Json).slice(0, 8)) {
          if (vv && typeof vv === "object" && !Array.isArray(vv)) { const f = figures(vv as Json); if (f) lines.push(`- ${words(kk)}: ${f}`); }
          else if (typeof vv === "number") lines.push(`- ${words(kk)}: ${vv.toLocaleString("en-US")}`);
        }
      }
    }
  }
  return lines.join("\n");
}
