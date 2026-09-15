/**
 * Finding the full-resolution photo.
 *
 * `og:image` is a social card — often 1200x630, cropped, and useless for a
 * 1080x1350 slide. So instead of trusting one tag we collect every candidate the
 * page offers, rewrite each into the largest form that site is known to serve,
 * then MEASURE them and keep the biggest. Measuring is the point: a rule that
 * "should" give the original is a guess until the pixels come back.
 *
 * Measuring costs one ranged request per candidate — the first 64 KB carries the
 * header every format puts its dimensions in, so nothing downloads a whole photo
 * just to find out it was a thumbnail.
 */

const UA = "Mozilla/5.0 (compatible; TimekeeperNewsBot/1.0; +https://timekeeper.com.kw)";

/** A slide is 1080 wide; anything narrower is upscaled and looks it. */
export const SLIDE_WIDTH = 1080;

export interface ImagePick {
  url: string;
  width: number;
  height: number;
  bytes: number | null;
  contentType: string;
  /** How we got it — 'srcset', 'wordpress-original', … Diagnosable after the fact. */
  strategy: string;
}

interface Candidate { url: string; strategy: string }

/* ---------------- dimensions from the file header ---------------- */

const tag = (b: Uint8Array, at: number, len: number) =>
  String.fromCharCode(...b.subarray(at, at + len));

/** Width and height straight out of the header bytes. No decoding, no library. */
export function imageSize(b: Uint8Array): { width: number; height: number; type: string } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);

  // PNG — IHDR is always the first chunk.
  if (b.length > 24 && b[0] === 0x89 && tag(b, 1, 3) === "PNG") {
    return { width: dv.getUint32(16), height: dv.getUint32(20), type: "image/png" };
  }

  // GIF — logical screen descriptor, little-endian.
  if (b.length > 10 && tag(b, 0, 3) === "GIF") {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true), type: "image/gif" };
  }

  // WebP — three sub-formats, three different places to look.
  if (b.length > 30 && tag(b, 0, 4) === "RIFF" && tag(b, 8, 4) === "WEBP") {
    const fmt = tag(b, 12, 4);
    if (fmt === "VP8X") {
      return {
        width: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1,
        height: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1,
        type: "image/webp",
      };
    }
    if (fmt === "VP8 ") {
      return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff, type: "image/webp" };
    }
    if (fmt === "VP8L") {
      const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
      return {
        width: (((b1 & 0x3f) << 8) | b0) + 1,
        height: (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) + 1,
        type: "image/webp",
      };
    }
  }

  // JPEG — walk the segments to the start-of-frame marker.
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      // SOF0..SOF15, excluding the huffman/arithmetic/restart markers in that range
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7), type: "image/jpeg" };
      }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return null;
}

/* ---------------- per-site rewrites to the original ---------------- */

/** WordPress writes the crop into the filename: foo-1024x683.jpg → foo.jpg */
const WP_SIZED = /-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp|avif)(?:$|[?#]))/i;
/** Shopify and friends: foo_1024x.jpg → foo.jpg */
const SHOPIFY_SIZED = /_\d{2,5}x\d{0,5}(?=\.(?:jpe?g|png|webp)(?:$|[?#]))/i;

/** Every larger form of a URL that is worth measuring, most promising first. */
export function upgrades(raw: string): Candidate[] {
  const out: Candidate[] = [];
  const push = (url: string, strategy: string) => {
    if (url && !out.some((c) => c.url === url)) out.push({ url, strategy });
  };

  let url: URL;
  try { url = new URL(raw); } catch { return []; }
  const host = url.hostname.replace(/^www\./, "");

  // WordPress — Revolution, Monochrome, Fratello, SJX, WatchPro, aBlogtoWatch,
  // Worn & Wound and WatchTime are all on it, and all of them serve the
  // untouched upload beside the cropped one.
  if (WP_SIZED.test(url.pathname)) {
    const original = new URL(url.href);
    original.pathname = url.pathname.replace(WP_SIZED, "");
    push(original.href, "wordpress-original");
    // WordPress also keeps a -scaled copy of very large uploads; when the
    // original is gone that is the biggest thing left.
    const scaled = new URL(original.href);
    scaled.pathname = original.pathname.replace(/(\.\w+)$/, "-scaled$1");
    push(scaled.href, "wordpress-scaled");
  }
  if (SHOPIFY_SIZED.test(url.pathname)) {
    const original = new URL(url.href);
    original.pathname = url.pathname.replace(SHOPIFY_SIZED, "");
    push(original.href, "cdn-original");
  }

  // Jetpack / Photon (i0-i3.wp.com) and most CDNs size by query string. Drop
  // the sizing keys and keep the rest — ssl=1 is load-bearing on Photon.
  const SIZING = ["w", "h", "width", "height", "resize", "fit", "crop", "quality", "q", "strip", "dpr", "rect", "ar", "cs", "auto", "s"];
  if (SIZING.some((k) => url.searchParams.has(k))) {
    const bare = new URL(url.href);
    for (const k of SIZING) bare.searchParams.delete(k);
    push(bare.href, host.endsWith("wp.com") ? "photon-original" : "cdn-unsized");
  }
  // Squarespace serves by explicit width; ask for its largest.
  if (url.searchParams.get("format")?.endsWith("w")) {
    const big = new URL(url.href);
    big.searchParams.set("format", "2500w");
    push(big.href, "squarespace-max");
  }

  push(raw, "as-published");
  return out;
}

/* ---------------- candidates on the page ---------------- */

const attr = (s: string, name: string) =>
  s.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1] ?? null;

/** The largest URL in a srcset, by its own width descriptor. */
function largestInSrcset(srcset: string): string | null {
  const best = srcset.split(",")
    .map((part) => {
      const [u, d] = part.trim().split(/\s+/);
      const w = d?.endsWith("w") ? parseInt(d) : d?.endsWith("x") ? parseFloat(d) * 1000 : 0;
      return { u, w: w || 0 };
    })
    .filter((c) => c.u)
    .sort((a, b) => b.w - a.w)[0];
  return best?.u ?? null;
}

/**
 * Every image the HTML points at, before any of it is measured.
 *
 * The lazy-loading attributes matter more than they look: a page that "needs a
 * browser" because the photo appears on scroll almost always still ships the
 * real URL in data-src or srcset, and reading it costs nothing.
 */
export function imageCandidates(html: string, pageUrl: string, seed?: string | null): Candidate[] {
  const found: Candidate[] = [];
  const add = (u: string | null | undefined, strategy: string) => {
    if (!u) return;
    try {
      const abs = new URL(u, pageUrl).href;
      if (!/^https?:/i.test(abs)) return;
      if (/\.svg(\?|$)|\/(logo|avatar|icon|sprite|placeholder)/i.test(abs)) return;
      if (!found.some((c) => c.url === abs)) found.push({ url: abs, strategy });
    } catch { /* a malformed src is not worth a throw */ }
  };

  add(seed, "feed");

  for (const key of ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"]) {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"))
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i"));
    add(m?.[1], "og");
  }

  // JSON-LD: an Article's image is the editorial one, not the share card.
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (node: unknown): void => {
        if (!node) return;
        if (typeof node === "string") return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        const o = node as Record<string, unknown>;
        const img = o.image ?? o.thumbnailUrl ?? o.contentUrl;
        if (typeof img === "string") add(img, "json-ld");
        else if (Array.isArray(img)) img.forEach((x) => add(typeof x === "string" ? x : (x as Record<string, string>)?.url, "json-ld"));
        else if (img && typeof img === "object") add((img as Record<string, string>).url, "json-ld");
        for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
      };
      walk(JSON.parse(m[1]));
    } catch { /* one bad block does not spoil the page */ }
  }

  // <source srcset> inside <picture>, then every <img>, lazy attributes included.
  for (const m of html.matchAll(/<source\b[^>]*>/gi)) {
    const ss = attr(m[0], "srcset") ?? attr(m[0], "data-srcset");
    if (ss) add(largestInSrcset(ss), "srcset");
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const ss = attr(m[0], "srcset") ?? attr(m[0], "data-srcset") ?? attr(m[0], "data-lazy-srcset");
    if (ss) add(largestInSrcset(ss), "srcset");
    for (const a of ["data-src", "data-lazy-src", "data-original", "data-full-src", "data-large-file", "src"]) {
      add(attr(m[0], a), a === "src" ? "img" : "lazy-attr");
    }
  }

  // Expand each into its larger forms, keeping the first strategy that named it.
  const expanded: Candidate[] = [];
  for (const c of found) {
    for (const u of upgrades(c.url)) {
      if (!expanded.some((e) => e.url === u.url)) {
        expanded.push({ url: u.url, strategy: u.strategy === "as-published" ? c.strategy : u.strategy });
      }
    }
  }
  return expanded;
}

/* ---------------- measuring ---------------- */

/** Read just enough of a candidate to learn its real size. */
export async function probe(url: string, strategy: string): Promise<ImagePick | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Range: "bytes=0-65535", Accept: "image/*" } });
    if (!res.ok && res.status !== 206) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.startsWith("image/")) return null;

    const head = new Uint8Array(await res.arrayBuffer());
    const size = imageSize(head);
    if (!size) return null;

    // Content-Range gives the true length even though we only asked for the head.
    const total = res.headers.get("content-range")?.split("/")[1];
    const bytes = total && total !== "*" ? Number(total) : Number(res.headers.get("content-length")) || null;

    return { url, width: size.width, height: size.height, bytes, contentType: contentType || size.type, strategy };
  } catch {
    return null;
  }
}

/** Run a few at a time — these are other people's servers. */
export async function pooled<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

/**
 * The biggest real image among the candidates.
 *
 * Sorted by measured pixels, not by how promising the rule that produced it
 * looked — a "wordpress-original" that 404s loses to a srcset entry that exists.
 */
export async function bestImage(candidates: Candidate[], limit = 8): Promise<ImagePick | null> {
  const picks = (await pooled(candidates.slice(0, limit), 4, (c) => probe(c.url, c.strategy)))
    .filter((p): p is ImagePick => p !== null)
    // Banners and tracking pixels are wide and flat; a watch photo is not.
    .filter((p) => p.width >= 400 && p.height >= 300);
  if (picks.length === 0) return null;
  picks.sort((a, b) => b.width * b.height - a.width * a.height);
  return picks[0];
}
