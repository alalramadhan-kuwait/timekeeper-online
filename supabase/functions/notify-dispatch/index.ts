// Retired. This function used to deliver one notification on request, authenticated by a static secret
// written into its source. Nothing calls it any more (notify-flush delivers everything), and delivery now
// follows push_targets() so each notification reaches one app. Kept as a stub so the old URL answers "gone".
Deno.serve(() => new Response(JSON.stringify({ error: 'retired' }), { status: 410, headers: { 'Content-Type': 'application/json' } }));
