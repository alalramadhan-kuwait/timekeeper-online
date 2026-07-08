// Admin-only user management: create users and change roles.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

const VALID_ROLES = ["admin", "manager", "staff", "hr", "viewer", "sales", "operations"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // caller must be admin or manager; managers cannot touch admin accounts or grant admin
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  if (!userData?.user) return json({ error: "Unauthorized" }, 401);
  const { data: prof } = await admin.from("profiles").select("role").eq("id", userData.user.id).single();
  const callerRole = prof?.role ?? "";
  if (!["admin", "manager"].includes(callerRole)) return json({ error: "Admins and managers only" }, 403);
  const isManager = callerRole === "manager";

  let body: { action?: string; email?: string; password?: string; full_name?: string; role?: string; user_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  if (body.action === "create") {
    if (!body.email || !body.password || !body.role) return json({ error: "email, password and role are required" }, 400);
    if (!VALID_ROLES.includes(body.role)) return json({ error: "Invalid role" }, 400);
    if (isManager && body.role === "admin") return json({ error: "Only admins can create admin accounts" }, 403);
    if (body.password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
    const { data, error } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name ?? body.email, role: body.role },
    });
    if (error) return json({ error: error.message }, 400);
    // make sure the profile row matches even if the trigger defaulted differently
    await admin.from("profiles").upsert({ id: data.user.id, full_name: body.full_name ?? body.email, role: body.role });
    return json({ ok: true, user_id: data.user.id });
  }

  if (body.action === "set_role") {
    if (!body.user_id || !body.role) return json({ error: "user_id and role are required" }, 400);
    if (!VALID_ROLES.includes(body.role)) return json({ error: "Invalid role" }, 400);
    if (body.user_id === userData.user.id) return json({ error: "You cannot change your own role" }, 400);
    if (isManager) {
      if (body.role === "admin") return json({ error: "Only admins can grant the admin role" }, 403);
      const { data: target } = await admin.from("profiles").select("role").eq("id", body.user_id).single();
      if (target?.role === "admin") return json({ error: "Only admins can change an admin's role" }, 403);
    }
    const { error } = await admin.from("profiles").update({ role: body.role }).eq("id", body.user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (body.action === "set_password") {
    if (!body.user_id || !body.password) return json({ error: "user_id and password are required" }, 400);
    if (body.password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
    if (isManager) {
      const { data: target } = await admin.from("profiles").select("role").eq("id", body.user_id).single();
      if (target?.role === "admin") return json({ error: "Only admins can reset an admin's password" }, 403);
    }
    const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
