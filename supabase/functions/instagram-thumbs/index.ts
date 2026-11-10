// Saved covers for the studio's Instagram grid. Instagram's image links expire and the page cannot load them, so posts
// shown on the page without one get a 320 px JPEG stored as a data URI in instagram_media.thumb ('' = could not be made).
// Decoding is heavy, so each run makes a few and the cron comes back every 2 minutes. The page reads them with studio_thumbs().
// Callers: pg_cron (x-sync-key, the key in instagram_auth).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decode, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: auth } = await admin.from("instagram_auth").select("sync_key").eq("id", 1).maybeSingle();
  const key = req.headers.get("x-sync-key");
  if (!key || !auth?.sync_key || key !== auth.sync_key) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: state } = await admin.from("studio_state").select("data").eq("key", "dash").maybeSingle();
  const ids = Object.values((state?.data ?? {}) as Record<string, { feed?: { id: string }[] }>).flatMap((d) => (d.feed ?? []).map((f) => f.id));
  const { data: rows } = await admin.from("instagram_media").select("media_id,thumbnail_url")
    .in("media_id", ids.length ? ids : ["none"]).is("thumb", null).not("thumbnail_url", "is", null).limit(4);
  let made = 0, failed = 0;
  for (const r of rows ?? []) {
    let thumb = "";
    try {
      const res = await fetch(r.thumbnail_url);
      if (!res.ok) throw new Error(String(res.status));
      const img = await decode(new Uint8Array(await res.arrayBuffer())) as Image;
      const jpg = await img.resize(320, Image.RESIZE_AUTO).encodeJPEG(55);
      thumb = "data:image/jpeg;base64," + btoa(Array.from(jpg, (b) => String.fromCharCode(b)).join(""));
      made++;
    } catch { failed++; }
    await admin.from("instagram_media").update({ thumb }).eq("media_id", r.media_id);
  }
  return new Response(JSON.stringify({ made, failed }), { headers: { "Content-Type": "application/json" } });
});
