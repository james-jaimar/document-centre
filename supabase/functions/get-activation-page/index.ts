// Public endpoint backing /activate/:slug.
// Returns branded-but-non-sensitive info about a branch activation page,
// plus masked contact name/email so the visitor can confirm they are the
// right person without us leaking the full address.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "•••";
  const head = local.slice(0, 1);
  return `${head}${"•".repeat(Math.max(2, local.length - 1))}@${domain}`;
}

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts.length) return "";
  const first = parts[0];
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : "";
  return `${first}${lastInitial}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug ?? "").trim();
    if (!slug) return json({ error: "slug_required" }, 400);

    const { data: page } = await admin
      .from("platform_branch_activation_pages")
      .select("id, tenant_id, branch_id, contact_email, contact_name, is_active")
      .eq("slug", slug).maybeSingle();
    if (!page) return json({ error: "not_found" }, 404);

    const { data: tenant } = await admin
      .from("tenants").select("id, name, slug, custom_domain").eq("id", page.tenant_id).maybeSingle();
    const { data: branch } = await admin
      .from("branches").select("id, name, city").eq("id", page.branch_id).maybeSingle();

    const { data: brandSettings } = await admin
      .from("tenant_settings")
      .select("setting_key, setting_value")
      .eq("tenant_id", page.tenant_id).eq("category", "branding");
    const brandMap: Record<string, any> = {};
    for (const r of (brandSettings ?? []) as any[]) brandMap[r.setting_key] = r.setting_value;
    const tenantLogoUrl = typeof brandMap.logo_url === "string" ? brandMap.logo_url : null;
    const primaryColor = typeof brandMap.primary_color === "string" ? brandMap.primary_color : null;

    // Heuristic: "already_completed" = a profile with this email has signed in at least once
    let alreadyCompleted = false;
    if (page.contact_email) {
      const { data: list } = await admin.auth.admin.listUsers();
      const u = list?.users?.find((u: any) => u.email?.toLowerCase() === page.contact_email.toLowerCase());
      if (u?.last_sign_in_at) alreadyCompleted = true;
    }

    return json({
      tenant_name: tenant?.name ?? null,
      tenant_logo_url: tenantLogoUrl,
      primary_color: primaryColor,
      branch_name: branch?.name ?? null,
      branch_city: branch?.city ?? null,
      contact_name_masked: page.contact_name ? maskName(page.contact_name) : null,
      contact_email_masked: maskEmail(page.contact_email),
      is_active: page.is_active,
      already_completed: alreadyCompleted,
    });
  } catch (e) {
    console.error("get-activation-page error:", e);
    return json({ error: "internal" }, 500);
  }
});
