// deno test supabase/functions/watch-news-sync/images.test.ts
//
// The header parsing and the per-site rewrites are the two places this can go
// quietly wrong — a misread JPEG marker or a rule that stops matching gives you
// a thumbnail on a slide with no error anywhere. Both are pure functions, so
// both are cheap to pin down.
import { assertEquals } from "jsr:@std/assert@1";
import { imageCandidates, imageSize, upgrades } from "./images.ts";

const urls = (u: string) => upgrades(u).map((c) => c.url);

Deno.test("PNG dimensions come from IHDR", () => {
  const b = new Uint8Array(32);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(b.buffer).setUint32(16, 1920);
  new DataView(b.buffer).setUint32(20, 1080);
  assertEquals(imageSize(b), { width: 1920, height: 1080, type: "image/png" });
});

Deno.test("JPEG dimensions survive a preceding APP0 segment", () => {
  const b = new Uint8Array(32);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);          // SOI, APP0 of length 16
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 20);            // SOF0, length 17, 8-bit
  const dv = new DataView(b.buffer);
  dv.setUint16(25, 1600); // height first — the order that is easy to get backwards
  dv.setUint16(27, 2400);
  assertEquals(imageSize(b), { width: 2400, height: 1600, type: "image/jpeg" });
});

Deno.test("GIF dimensions are little-endian", () => {
  const b = new Uint8Array(16);
  b.set(new TextEncoder().encode("GIF89a"));
  const dv = new DataView(b.buffer);
  dv.setUint16(6, 300, true);
  dv.setUint16(8, 200, true);
  assertEquals(imageSize(b), { width: 300, height: 200, type: "image/gif" });
});

Deno.test("WebP VP8X stores dimensions minus one, in 24 bits", () => {
  const b = new Uint8Array(40);
  const put = (s: string, at: number) => b.set(new TextEncoder().encode(s), at);
  put("RIFF", 0); put("WEBP", 8); put("VP8X", 12);
  const [w, h] = [3000 - 1, 2000 - 1];
  b[24] = w & 0xff; b[25] = (w >> 8) & 0xff; b[26] = (w >> 16) & 0xff;
  b[27] = h & 0xff; b[28] = (h >> 8) & 0xff; b[29] = (h >> 16) & 0xff;
  assertEquals(imageSize(b), { width: 3000, height: 2000, type: "image/webp" });
});

Deno.test("an HTML page is not mistaken for an image", () => {
  assertEquals(imageSize(new TextEncoder().encode("<!doctype html><html>")), null);
});

Deno.test("WordPress crops rewrite to the original, keeping -scaled as a fallback", () => {
  const got = urls("https://monochrome-watches.com/wp-content/uploads/2026/09/foo-1024x683.jpg");
  assertEquals(got[0], "https://monochrome-watches.com/wp-content/uploads/2026/09/foo.jpg");
  assertEquals(got[1], "https://monochrome-watches.com/wp-content/uploads/2026/09/foo-scaled.jpg");
});

Deno.test("Photon loses its sizing keys but keeps ssl", () => {
  assertEquals(
    urls("https://i0.wp.com/watchtime.com/img.jpg?w=800&h=600&ssl=1")[0],
    "https://i0.wp.com/watchtime.com/img.jpg?ssl=1",
  );
});

Deno.test("imgix-style params are dropped", () => {
  assertEquals(
    urls("https://hodinkee-cdn.s3.amazonaws.com/a.jpg?auto=format&w=1200&q=70")[0],
    "https://hodinkee-cdn.s3.amazonaws.com/a.jpg",
  );
});

Deno.test("Squarespace is asked for its largest render", () => {
  assertEquals(
    urls("https://x.squarespace.com/a.jpg?format=750w")[0],
    "https://x.squarespace.com/a.jpg?format=2500w",
  );
});

Deno.test("a plain URL passes through and a malformed one yields nothing", () => {
  assertEquals(urls("https://a.com/b.jpg"), ["https://a.com/b.jpg"]);
  assertEquals(urls("not a url"), []);
});

Deno.test("candidates come from every place a page hides its photo", () => {
  const html = `
    <meta property="og:image" content="https://cdn.site.com/social-1200x630.jpg">
    <script type="application/ld+json">
      {"@type":"Article","image":{"url":"https://cdn.site.com/wp-content/uploads/hero-2048x1365.jpg"}}
    </script>
    <picture><source srcset="https://cdn.site.com/a-480x320.webp 480w, https://cdn.site.com/a-1600x1067.webp 1600w"></picture>
    <img data-lazy-src="https://cdn.site.com/wp-content/uploads/lazy-800x533.jpg" src="data:image/gif;base64,R0lGOD">
    <img src="https://cdn.site.com/logo.svg">`;
  const got = imageCandidates(html, "https://site.com/article", "https://feed.site.com/feed-600x400.jpg");
  const has = (u: string) => got.some((c) => c.url === u);

  assertEquals(has("https://feed.site.com/feed.jpg"), true, "the feed's own image is upgraded too");
  assertEquals(has("https://cdn.site.com/wp-content/uploads/hero.jpg"), true, "JSON-LD hero, uncropped");
  assertEquals(has("https://cdn.site.com/a-1600x1067.webp"), true, "largest srcset entry");
  assertEquals(has("https://cdn.site.com/a-480x320.webp"), false, "smaller srcset entries are not worth measuring");
  // This is the one that decides whether a lazy-loading site needs a browser.
  assertEquals(has("https://cdn.site.com/wp-content/uploads/lazy.jpg"), true, "lazy-load attribute");
  assertEquals(got.some((c) => c.url.endsWith(".svg")), false, "logos are not article photos");
  assertEquals(got.some((c) => c.url.startsWith("data:")), false, "inline placeholders are skipped");
});
