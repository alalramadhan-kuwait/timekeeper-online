// Watch News sync — reads the watch press, scores each story against the brands
// we carry, and keeps the lead photo so a slide can be built from it.
// Callers: pg_cron (x-sync-key) or an admin/manager/marketing JWT ("Sync now").
// POST {} runs the feeds; POST { url } ingests that one article straight away —
// the story you want is usually the one you just read on your phone.
//
// Two secrets, both optional in different ways:
//   ANTHROPIC_API_KEY — writes the Arabic headline. Without it the story still
//     lands, with the Arabic left blank for marketing to type.
//   (nothing else) — the feeds themselves are public.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser";
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const PER_FEED = 15;        // newest N per feed; older stories are not news
const MAX_NEW_PER_RUN = 40; // a bound on image downloads and the Arabic call
const UA = "Mozilla/5.0 (compatible; TimekeeperNewsBot/1.0; +https://timekeeper.com.kw)";

interface SourceRow { id: string; name: string; feed_url: string; weight: number }
interface FeedItem {
  guid: string; title: string; link: string | null; summary: string | null;
  author: string | null; published_at: string | null; image_source_url: string | null;
}

/* ---------------- feed parsing ---------------- */

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });
const asArray = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
// A feed node is sometimes a string and sometimes { "#text": ..., "@_attr": ... }.
const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["#text"] ?? "");
  return "";
};
const stripHtml = (s: string) =>
  s.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();

/** First usable image the feed itself offers, before we go and fetch the article. */
function imageFromEntry(e: Record<string, unknown>): string | null {
  const media = asArray(e["media:content"] as Record<string, string> | Record<string, string>[])
    .find((m) => m?.["@_url"] && !String(m["@_medium"] ?? "image").startsWith("video"));
  if (media?.["@_url"]) return media["@_url"];
  const thumb = asArray(e["media:thumbnail"] as Record<string, string> | Record<string, string>[])[0];
  if (thumb?.["@_url"]) return thumb["@_url"];
  const enc = asArray(e.enclosure as Record<string, string> | Record<string, string>[])
    .find((x) => String(x?.["@_type"] ?? "").startsWith("image/"));
  if (enc?.["@_url"]) return enc["@_url"];
  const body = `${text(e["content:encoded"])}${text(e.content)}${text(e.description)}${text(e.summary)}`;
  return body.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null;
}

function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const channel = doc?.rss?.channel ?? doc?.["rdf:RDF"] ?? null;
  const entries: Record<string, unknown>[] = channel
    ? asArray(channel.item ?? doc?.["rdf:RDF"]?.item)
    : asArray(doc?.feed?.entry);

  return entries.map((e) => {
    // Atom puts the URL on <link href>; RSS puts it in the element body.
    const linkNode = asArray(e.link as unknown);
    // Atom lists several <link>s; the article is the one that is not the feed itself.
    const link = linkNode
      .filter((l) => typeof l === "string" || String((l as Record<string, string>)?.["@_rel"] ?? "alternate") === "alternate")
      .map((l) => (typeof l === "string" ? l : (l as Record<string, string>)?.["@_href"] ?? ""))
      .find((u) => u && !u.endsWith("/feed/")) ?? null;
    const title = stripHtml(text(e.title));
    const guid = text(e.guid) || text(e.id) || link || title;
    const published = text(e.pubDate) || text(e.published) || text(e.updated) || text(e["dc:date"]);
    const when = published ? new Date(published) : null;
    const summary = stripHtml(text(e.description) || text(e.summary) || text(e["content:encoded"])).slice(0, 600);
    return {
      guid, title, link,
      summary: summary || null,
      author: stripHtml(text(e["dc:creator"]) || text((e.author as Record<string, unknown>)?.name) || text(e.author)) || null,
      published_at: when && !isNaN(when.getTime()) ? when.toISOString() : null,
      image_source_url: imageFromEntry(e),
    };
  }).filter((i) => i.title && i.guid);
}

/* ---------------- ranking ---------------- */

const LAUNCH_WORDS = ["new", "launch", "unveil", "introduc", "release", "novelt", "debut", "first look", "hands-on"];
const MARKET_WORDS = ["auction", "record", "price", "sotheby", "christie", "phillips", "sold for"];

function scoreItem(item: FeedItem, weight: number, brands: string[]): { score: number; matched: string[] } {
  const hay = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  const matched = brands.filter((b) => b.length > 2 && hay.includes(b.toLowerCase()));

  let score = weight * 2;
  const ageHours = item.published_at ? (Date.now() - Date.parse(item.published_at)) / 3600_000 : 999;
  if (ageHours < 24) score += 5;
  else if (ageHours < 72) score += 3;
  else if (ageHours < 168) score += 1;
  // Brands we can actually sell are the whole point of the ranking.
  score += Math.min(matched.length, 3) * 4;
  if (LAUNCH_WORDS.some((w) => hay.includes(w))) score += 2;
  if (MARKET_WORDS.some((w) => hay.includes(w))) score += 1;
  if (item.image_source_url) score += 1; // a story without a photo cannot become a slide
  return { score: Math.round(score * 10) / 10, matched };
}

/* ---------------- the lead photo ---------------- */

/** Fall back to the article's og:image when the feed carried no picture. */
async function ogImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000); // <head> is all we need
    for (const re of [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    ]) {
      const m = html.match(re);
      if (m?.[1]) return m[1];
    }
  } catch { /* an article that will not load is not worth a retry */ }
  return null;
}

/**
 * Copy the photo onto our own storage. A canvas that drew a cross-origin image
 * cannot be exported, so the slide renderer needs the bytes on our origin —
 * and this way the slide survives the article being edited or pulled.
 */
async function mirrorImage(
  admin: ReturnType<typeof createClient>, itemId: string, src: string,
): Promise<string | null> {
  try {
    const res = await fetch(src, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 8_000 || bytes.byteLength > 12_000_000) return null; // tracking pixel / absurdly large
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const path = `${itemId}.${ext}`;
    const { error } = await admin.storage.from("news-images")
      .upload(path, bytes, { contentType: type, upsert: true });
    if (error) return null;
    return admin.storage.from("news-images").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

/* ---------------- the Arabic headline ---------------- */

interface ArabicLine { id: string; title_ar: string; top: string; bottom: string }

/**
 * One call for the whole batch — the slide needs two short right-to-left lines,
 * not a translation of the article. Returns an empty map when no key is set, and
 * the page then asks for the Arabic by hand.
 */
async function arabicHeadlines(rows: { id: string; title: string; summary: string | null }[]): Promise<Map<string, ArabicLine>> {
  const out = new Map<string, ArabicLine>();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey || rows.length === 0) return out;

  const client = new Anthropic({ apiKey });
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["headlines"],
    properties: {
      headlines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title_ar", "top", "bottom"],
          properties: {
            id: { type: "string", description: "the id given in the input" },
            title_ar: { type: "string", description: "the headline in Arabic, one line" },
            top: { type: "string", description: "slide line 1, Arabic, at most 30 characters" },
            bottom: { type: "string", description: "slide line 2, Arabic, at most 30 characters, may be empty" },
          },
        },
      },
    },
  };

  try {
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system:
        "You write Arabic headlines for Timekeeper, a luxury watch retailer in Kuwait, for Instagram slides.\n" +
        "For each story return Modern Standard Arabic that a Gulf audience reads naturally.\n" +
        "Keep brand and model names in Latin script (Rolex, Omega, Land-Dweller) — that is how the market writes them.\n" +
        "`top` and `bottom` are two stacked lines on the slide: short, factual, no hype, no emoji, no hashtags, no ending punctuation.\n" +
        "`bottom` may be an empty string when one line says it. Never invent a fact the story does not carry.",
      messages: [{
        role: "user",
        content: rows.map((r) => `id: ${r.id}\ntitle: ${r.title}\nsummary: ${(r.summary ?? "").slice(0, 300)}`).join("\n\n"),
      }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (block && block.type === "text") {
      const parsed = JSON.parse(block.text) as { headlines?: ArabicLine[] };
      for (const h of parsed.headlines ?? []) if (h?.id) out.set(h.id, h);
    }
  } catch (e) {
    // The story is still worth having without its Arabic line.
    console.error("arabic headlines failed:", (e as Error).message);
  }
  return out;
}

/* ---------------- one pasted link ---------------- */

/** A meta tag's content, whichever attribute order the page happens to use. */
function meta(html: string, key: string): string | null {
  for (const re of [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, "i"),
  ]) {
    const m = html.match(re);
    if (m?.[1]) return stripHtml(m[1]);
  }
  return null;
}

/** The same article shared from the app and from the web must be one story. */
function canonicalise(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) {
      if (k.startsWith("utm_") || k === "ref" || k === "fbclid") url.searchParams.delete(k);
    }
    return url.toString();
  } catch {
    return u;
  }
}

/**
 * Which source a pasted link belongs to. A site we already follow keeps its
 * weight and its name; anything else gets a row of its own, disabled, so the
 * daily run does not go looking for a feed nobody configured.
 */
async function sourceForLink(
  admin: ReturnType<typeof createClient>, host: string, siteName: string | null,
): Promise<SourceRow> {
  const bare = host.replace(/^www\./, "");
  const { data: all } = await admin.from("news_sources").select("id, name, feed_url, homepage, weight");
  const hit = ((all ?? []) as (SourceRow & { homepage: string | null })[])
    .find((s) => (s.homepage ?? "").includes(bare) || (s.feed_url ?? "").includes(bare));
  if (hit) return hit;

  const { data } = await admin.from("news_sources").upsert({
    name: siteName || bare,
    feed_url: `https://${host}/`,
    homepage: `https://${host}`,
    enabled: false,
    last_status: "added from a pasted link — no feed configured",
  }, { onConflict: "name" }).select("id, name, feed_url, weight").single();
  return data as SourceRow;
}

/**
 * Ingest a single article someone pasted. This exists because the story you
 * want is often the one you just read on your phone, and waiting for tomorrow's
 * feed run is not an answer. Everything after the fetch is the same path a feed
 * item takes — same scoring, same mirrored photo, same Arabic lines.
 */
async function ingestLink(
  admin: ReturnType<typeof createClient>, rawUrl: string, brands: string[],
): Promise<Response> {
  let host: string;
  try {
    host = new URL(rawUrl).host;
  } catch {
    return json({ error: `Not a URL: ${rawUrl.slice(0, 120)}` }, 400);
  }

  const res = await fetch(rawUrl, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } })
    .catch((e) => { throw new Error(`could not reach ${host}: ${(e as Error).message}`); });
  if (!res.ok) return json({ error: `${host} answered ${res.status}` }, 400);
  const html = (await res.text()).slice(0, 400_000);

  const title = meta(html, "og:title") ?? stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  if (!title) return json({ error: "No headline found on that page — is it an article?" }, 400);

  const canonical = canonicalise(meta(html, "og:url") ?? rawUrl);
  const published = meta(html, "article:published_time") ?? meta(html, "og:published_time");
  const when = published ? new Date(published) : null;
  const source = await sourceForLink(admin, host, meta(html, "og:site_name"));

  const item: FeedItem = {
    guid: canonical,
    title,
    link: canonical,
    summary: meta(html, "og:description") ?? meta(html, "description"),
    author: meta(html, "article:author") ?? null,
    published_at: when && !isNaN(when.getTime()) ? when.toISOString() : new Date().toISOString(),
    image_source_url: meta(html, "og:image") ?? meta(html, "twitter:image"),
  };
  const { score, matched } = scoreItem(item, Number(source.weight ?? 1), brands);

  const { data: row, error } = await admin.from("news_items").insert({
    source_id: source.id, source_name: source.name, guid: item.guid, title: item.title,
    link: item.link, summary: item.summary, author: item.author, published_at: item.published_at,
    image_source_url: item.image_source_url, image_credit: source.name,
    brands: matched, score, status: "Shortlisted", // you asked for this one by name
  }).select("*").single();

  if (error) {
    // Already stored — hand back the row we have rather than a second copy.
    const { data: existing } = await admin.from("news_items").select("*")
      .eq("source_id", source.id).eq("guid", item.guid).single();
    if (existing) return json({ ok: true, already: true, item: existing });
    return json({ error: error.message }, 400);
  }

  const id = (row as { id: string }).id;
  const [mirrored, arabic] = await Promise.all([
    item.image_source_url ? mirrorImage(admin, id, item.image_source_url) : Promise.resolve(null),
    arabicHeadlines([{ id, title: item.title, summary: item.summary }]),
  ]);

  const patch: Record<string, string | null> = {};
  if (mirrored) patch.image_url = mirrored;
  const h = arabic.get(id);
  if (h) {
    patch.title_ar = h.title_ar || null;
    patch.slide_top_ar = h.top || null;
    patch.slide_bottom_ar = h.bottom || null;
  }
  const { data: final } = Object.keys(patch).length
    ? await admin.from("news_items").update(patch).eq("id", id).select("*").single()
    : { data: row };

  return json({ ok: true, already: false, item: final ?? row });
}

/* ---------------- handler ---------------- */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // auth: shared sync key (cron) or an admin/manager/marketing JWT
  const { data: auth } = await admin.from("lightspeed_auth").select("sync_key").eq("id", 1).single();
  const syncKey = req.headers.get("x-sync-key");
  let allowed = !!syncKey && !!auth?.sync_key && syncKey === auth.sync_key;
  if (!allowed) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (jwt) {
      const { data: u } = await admin.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
        allowed = ["admin", "manager", "marketing"].includes(p?.role ?? "");
      }
    }
  }
  if (!allowed) return json({ error: "Unauthorized" }, 401);

  const { data: brandRows } = await admin.from("brands").select("name").eq("is_active", true);
  const brands = ((brandRows ?? []) as { name: string }[]).map((b) => b.name).filter(Boolean);

  // { url } ingests that one article now; an empty body runs the feeds.
  const body = await req.json().catch(() => ({})) as { url?: string };
  const pasted = typeof body.url === "string" ? body.url.trim() : "";
  if (pasted) {
    try {
      return await ingestLink(admin, pasted, brands);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  const { data: sources } = await admin.from("news_sources")
    .select("id, name, feed_url, weight").eq("enabled", true);
  if (!sources?.length) return json({ error: "No enabled sources in news_sources" }, 400);

  const fresh: (FeedItem & { source: SourceRow; score: number; matched: string[] })[] = [];
  const feedStatus: Record<string, string> = {};

  // One feed at a time: these are other people's servers, and a failing feed
  // must not take the run down with it.
  for (const src of (sources as SourceRow[])) {
    try {
      const res = await fetch(src.feed_url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseFeed(await res.text()).slice(0, PER_FEED);
      if (items.length === 0) throw new Error("no items parsed — has the feed URL moved?");

      // Skip what we already have before doing any work on it.
      const { data: seen } = await admin.from("news_items").select("guid")
        .eq("source_id", src.id).in("guid", items.map((i) => i.guid));
      const known = new Set(((seen ?? []) as { guid: string }[]).map((s) => s.guid));

      let added = 0;
      for (const item of items) {
        if (known.has(item.guid)) continue;
        const { score, matched } = scoreItem(item, Number(src.weight ?? 1), brands);
        fresh.push({ ...item, source: src, score, matched });
        added++;
      }
      feedStatus[src.id] = `ok · ${items.length} read, ${added} new`;
    } catch (e) {
      feedStatus[src.id] = `failed · ${(e as Error).message}`.slice(0, 200);
    }
  }

  // Best first, so a capped run keeps the stories worth having.
  fresh.sort((a, b) => b.score - a.score);
  const batch = fresh.slice(0, MAX_NEW_PER_RUN);

  // Insert first: the row id names the image file, and the Arabic is keyed by it.
  const inserted: { id: string; title: string; summary: string | null; image_source_url: string | null; link: string | null }[] = [];
  for (const item of batch) {
    const { data, error } = await admin.from("news_items").insert({
      source_id: item.source.id,
      source_name: item.source.name,
      guid: item.guid,
      title: item.title,
      link: item.link,
      summary: item.summary,
      author: item.author,
      published_at: item.published_at,
      image_source_url: item.image_source_url,
      image_credit: item.source.name,
      brands: item.matched,
      score: item.score,
    }).select("id, title, summary, image_source_url, link").single();
    if (!error && data) inserted.push(data as typeof inserted[number]);
  }

  // Photos and Arabic in parallel — neither needs the other.
  const [, arabic] = await Promise.all([
    Promise.all(inserted.map(async (row) => {
      const src = row.image_source_url ?? (row.link ? await ogImage(row.link) : null);
      if (!src) return;
      const url = await mirrorImage(admin, row.id, src);
      if (url) await admin.from("news_items").update({ image_url: url, image_source_url: src }).eq("id", row.id);
    })),
    arabicHeadlines(inserted.map((r) => ({ id: r.id, title: r.title, summary: r.summary }))),
  ]);

  for (const [id, h] of arabic) {
    await admin.from("news_items").update({
      title_ar: h.title_ar || null,
      slide_top_ar: h.top || null,
      slide_bottom_ar: h.bottom || null,
    }).eq("id", id);
  }

  // Scores carry a recency term, so yesterday's leader has to fall on its own.
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: recent } = await admin.from("news_items")
    .select("id, title, summary, published_at, image_url, source_id")
    .gte("published_at", since).eq("status", "New").limit(500);
  const weightOf = new Map((sources as SourceRow[]).map((s) => [s.id, Number(s.weight ?? 1)]));
  for (const row of ((recent ?? []) as Record<string, any>[])) {
    const { score, matched } = scoreItem({
      guid: "", title: row.title, link: null, summary: row.summary,
      author: null, published_at: row.published_at, image_source_url: row.image_url,
    }, weightOf.get(row.source_id) ?? 1, brands);
    await admin.from("news_items").update({ score, brands: matched }).eq("id", row.id);
  }

  for (const [id, status] of Object.entries(feedStatus)) {
    await admin.from("news_sources").update({ last_synced_at: new Date().toISOString(), last_status: status }).eq("id", id);
  }

  return json({
    ok: true,
    sources: (sources as SourceRow[]).length,
    new_items: inserted.length,
    arabic_written: arabic.size,
    feeds: feedStatus,
  });
});
