import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 200_000;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$sha256$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { tenant_id, password } = await req.json();
    if (!tenant_id || typeof password !== "string" || password.length < 4) {
      return json({ error: "tenant_id and password (min 4 chars) required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let authorized = false;
    try {
      const { data: isTenantAdmin } = await admin.rpc("user_is_tenant_admin", {
        _tenant_id: tenant_id,
      } as any);
      if (isTenantAdmin === true) authorized = true;
    } catch (_) { /* fall through */ }

    if (!authorized) {
      const { data: platformRoles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "platform_admin");
      if ((platformRoles?.length ?? 0) > 0) authorized = true;
    }

    if (!authorized) {
      const { data: mem } = await admin
        .from("tenant_memberships")
        .select("role")
        .eq("user_id", user.id)
        .eq("tenant_id", tenant_id)
        .in("role", ["owner", "admin"])
        .eq("is_active", true);
      if ((mem?.length ?? 0) > 0) authorized = true;
    }

    if (!authorized) return json({ error: "Forbidden" }, 403);

    const hash = await hashPassword(password);

    const { error: upErr } = await admin
      .from("tenant_demo_gate")
      .upsert(
        { tenant_id, password_hash: hash },
        { onConflict: "tenant_id" },
      );
    if (upErr) throw upErr;

    return json({ ok: true });
  } catch (e) {
    console.error("demo-gate-set-password error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
