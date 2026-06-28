// Mint a short-lived customer session on behalf of authorised staff.
// Returns access_token / refresh_token that the client uses with
// supabase.auth.setSession() to swap into the customer's identity.
//
// Authorisation is delegated to public.caller_can_impersonate(target),
// which forbids impersonating staff/platform admins and enforces tenant
// + branch scope for everyone else.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const target_profile_id = String(body.target_profile_id ?? "").trim();
    const tenant_id = body.tenant_id ? String(body.tenant_id) : null;
    const branch_id = body.branch_id ? String(body.branch_id) : null;
    if (!target_profile_id) return json({ error: "target_profile_id required" }, 400);

    // Authorisation: ask the database to decide using the caller's JWT.
    const { data: allowed, error: rpcErr } = await userClient.rpc(
      "caller_can_impersonate",
      { _target: target_profile_id },
    );
    if (rpcErr) return json({ error: rpcErr.message }, 500);
    if (allowed !== true) return json({ error: "Forbidden" }, 403);

    const admin = createClient(url, serviceKey);

    // Look up target email.
    const { data: targetProfile, error: profErr } = await admin
      .from("profiles")
      .select("id, email, display_name, first_name, last_name")
      .eq("id", target_profile_id)
      .maybeSingle();
    if (profErr || !targetProfile?.email) {
      return json({ error: "Target has no email on file" }, 400);
    }

    // Open audit row first so we have an id to stamp on any created rows.
    const { data: audit, error: auditErr } = await admin
      .from("impersonation_sessions")
      .insert({
        actor_profile_id: caller.id,
        target_profile_id,
        tenant_id,
        branch_id,
        ip: req.headers.get("x-forwarded-for") ?? null,
        user_agent: req.headers.get("user-agent") ?? null,
      })
      .select("id")
      .single();
    if (auditErr) return json({ error: auditErr.message }, 500);

    // Generate a magiclink for the target. Client will exchange via verifyOtp.
    const { data: link, error: linkErr } = await (admin.auth as any).admin.generateLink({
      type: "magiclink",
      email: targetProfile.email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return json({ error: linkErr?.message ?? "Failed to mint sign-in link" }, 500);
    }

    // 30-minute expiry hint for the client idle timer.
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    return json({
      ok: true,
      impersonation_id: audit.id,
      email: targetProfile.email,
      token_hash: link.properties.hashed_token,
      expires_at: expiresAt,
      target: {
        profile_id: targetProfile.id,
        email: targetProfile.email,
        display_name: targetProfile.display_name,
        first_name: targetProfile.first_name,
        last_name: targetProfile.last_name,
      },
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
