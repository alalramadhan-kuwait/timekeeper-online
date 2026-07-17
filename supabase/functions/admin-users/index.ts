// Admin/manager user management: list, create, edit, delete accounts, change roles & passwords.
// Managers cannot create/modify/delete admin accounts or grant the admin role.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

const VALID_ROLES = ["admin", "manager", "staff", "hr", "viewer", "sales", "operations", "marketing"];

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

  let body: { action?: string; email?: string; password?: string; full_name?: string; role?: string; user_id?: string; page_access?: string[] | null };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  if (body.action === "list") {
    const { data: usersData, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return json({ error: error.message }, 400);
    const { data: profiles } = await admin.from("profiles").select("id, full_name, role, page_access");
    const profById = new Map((profiles ?? []).map((p: { id: string; full_name: string; role: string; page_access: string[] | null }) => [p.id, p]));
    const team = usersData.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      full_name: profById.get(u.id)?.full_name ?? u.email ?? "Unknown",
      role: profById.get(u.id)?.role ?? "viewer",
      page_access: profById.get(u.id)?.page_access ?? null,
    }));
    return json({ ok: true, team });
  }

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

  if (body.action === "update") {
    if (!body.user_id) return json({ error: "user_id is required" }, 400);
    if (isManager) {
      const { data: target } = await admin.from("profiles").select("role").eq("id", body.user_id).single();
      if (target?.role === "admin") return json({ error: "Only admins can edit an admin account" }, 403);
    }
    // update login email/username if provided
    if (body.email) {
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { email: body.email });
      if (error) return json({ error: error.message }, 400);
    }
    // update display name if provided
    if (body.full_name != null) {
      const { error } = await admin.from("profiles").update({ full_name: body.full_name }).eq("id", body.user_id);
      if (error) return json({ error: error.message }, 400);
    }
    return json({ ok: true });
  }

  if (body.action === "set_access") {
    if (!body.user_id) return json({ error: "user_id is required" }, 400);
    if (body.user_id === userData.user.id) return json({ error: "You cannot change your own page access" }, 400);
    if (isManager) {
      const { data: target } = await admin.from("profiles").select("role").eq("id", body.user_id).single();
      if (target?.role === "admin") return json({ error: "Only admins can change an admin's access" }, 403);
    }
    // null (or omitted) resets to role defaults; an array is the explicit allow-list
    const pa = Array.isArray(body.page_access) ? body.page_access : null;
    const { error } = await admin.from("profiles").update({ page_access: pa }).eq("id", body.user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (body.action === "delete") {
    if (!body.user_id) return json({ error: "user_id is required" }, 400);
    if (body.user_id === userData.user.id) return json({ error: "You cannot delete your own account" }, 400);
    if (isManager) {
      const { data: target } = await admin.from("profiles").select("role").eq("id", body.user_id).single();
      if (target?.role === "admin") return json({ error: "Only admins can delete an admin account" }, 403);
    }
    const { error } = await admin.auth.admin.deleteUser(body.user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
