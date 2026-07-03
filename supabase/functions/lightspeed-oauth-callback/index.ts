// Lightspeed X-Series OAuth callback — exchanges the authorization code for tokens
// and stores them in lightspeed_auth. Redirect URI of the Lightspeed app must point here.
import { createClient } from "jsr:@supabase/supabase-js@2";

const html = (title: string, body: string, ok: boolean) =>
  new Response(
    `<!doctype html><html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#fff">
      <div style="text-align:center;max-width:420px">
        <h2 style="color:${ok ? "#34d399" : "#f87171"}">${title}</h2>
        <p style="color:#94a3b8">${body}</p>
      </div></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const domainPrefix = url.searchParams.get("domain_prefix");
  const errorParam = url.searchParams.get("error");

  if (errorParam) return html("Authorization declined", `Lightspeed returned: ${errorParam}`, false);
  if (!code || !domainPrefix) return html("Missing parameters", "Expected ?code and ?domain_prefix from Lightspeed.", false);

  const clientId = Deno.env.get("LS_CLIENT_ID");
  const clientSecret = Deno.env.get("LS_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return html("Not configured", "LS_CLIENT_ID / LS_CLIENT_SECRET secrets are not set in Supabase.", false);
  }

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/lightspeed-oauth-callback`;
  const tokenRes = await fetch(`https://${domainPrefix}.retail.lightspeed.app/api/1.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const tokenBody = await tokenRes.text();
  if (!tokenRes.ok) return html("Token exchange failed", `Lightspeed responded ${tokenRes.status}: ${tokenBody.slice(0, 300)}`, false);

  let tok: { access_token?: string; refresh_token?: string; expires?: number; expires_at?: string };
  try { tok = JSON.parse(tokenBody); } catch { return html("Unexpected response", tokenBody.slice(0, 300), false); }
  if (!tok.access_token) return html("No access token", tokenBody.slice(0, 300), false);

  const expiresAt = tok.expires
    ? new Date(tok.expires * 1000).toISOString()
    : new Date(Date.now() + 6 * 3600_000).toISOString();

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.from("lightspeed_auth").upsert({
    id: 1,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? null,
    expires_at: expiresAt,
    domain_prefix: domainPrefix,
    updated_at: new Date().toISOString(),
  });
  if (error) return html("Database error", error.message, false);

  return html("Lightspeed connected ✓", "Stock will sync automatically every morning. You can close this tab and open the Stock page in Timekeeper Online.", true);
});
