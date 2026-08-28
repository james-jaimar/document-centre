// Attaches the signed-in user to a tenant as a customer, if not already attached.
// Used at checkout so an existing login (created on another tenant) can shop here
// without needing a second email address.
//
// Body: { tenant_slug: string, first_name?, last_name?, phone? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);
    if ((user as any).is_anonymous) return json({ error: "Anonymous users cannot be enrolled" }, 400);

    const body = await req.json().catch(() => ({}));
    const tenantSlug = typeof body?.tenant_slug === "string" ? body.tenant_slug.trim() : "";
    if (!tenantSlug) return json({ error: "tenant_slug is required" }, 400);

    const firstName = body?.first_name ? String(body.first_name).trim() : null;
    const lastName = body?.last_name ? String(body.last_name).trim() : null;
    const phone = body?.phone ? String(body.phone).trim() : null;

    const admin = createClient(url, serviceKey);

    const { data: tenant } = await admin
      .from("tenants")
      .select("id, app_id")
      .eq("slug", tenantSlug)
      .maybeSingle();
    if (!tenant) return json({ error: "Unknown tenant" }, 404);

    // Ensure a profile row exists and fill in blanks only.
    const { data: profile } = await admin
      .from("profiles")
      .select("id, first_name, last_name, display_name, phone, email, tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    const patch: Record<string, unknown> = {};
    if (firstName && !profile?.first_name) patch.first_name = firstName;
    if (lastName && !profile?.last_name) patch.last_name = lastName;
    if (phone && !profile?.phone) patch.phone = phone;
    if (!profile?.display_name) {
      const dn = `${firstName ?? profile?.first_name ?? ""} ${lastName ?? profile?.last_name ?? ""}`.trim();
      if (dn) patch.display_name = dn;
    }
    if (!profile?.email && user.email) patch.email = user.email;
    // Only set a "home" tenant when the profile has none — never rewrite it.
    if (!profile?.tenant_id) patch.tenant_id = tenant.id;
    patch.is_anonymous = false;

    if (profile) {
      if (Object.keys(patch).length > 0) {
        await admin.from("profiles").update(patch).eq("id", user.id);
      }
    } else {
      await admin.from("profiles").insert({
        id: user.id,
        email: user.email ?? null,
        first_name: firstName,
        last_name: lastName,
        phone,
        display_name: `${firstName ?? ""} ${lastName ?? ""}`.trim() || null,
        tenant_id: tenant.id,
        is_anonymous: false,
      });
    }

    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("id, is_active")
      .eq("profile_id", user.id)
      .eq("tenant_id", tenant.id)
      .eq("app_id", tenant.app_id)
      .maybeSingle();

    if (membership) {
      return json({ ok: true, created: false, membership_id: membership.id });
    }

    const { data: inserted, error: insErr } = await admin
      .from("tenant_memberships")
      .insert({
        profile_id: user.id,
        tenant_id: tenant.id,
        app_id: tenant.app_id,
        role: "customer",
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      console.error("ensure-tenant-membership insert failed", insErr);
      return json({ error: insErr.message }, 500);
    }

    return json({ ok: true, created: true, membership_id: inserted?.id ?? null });
  } catch (e) {
    console.error("ensure-tenant-membership error", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
