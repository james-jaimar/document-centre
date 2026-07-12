// Public endpoint that exchanges our opaque onboarding token for a
// freshly-minted Supabase recovery (or magiclink) action URL. Lets a
// welcome link stay reusable for the full 1-hour window — each click
// gets a fresh Supabase OTP — until the user actually completes the
// flow (then `complete-onboarding-token` marks it consumed).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_USES = 20;

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function rewriteVerifyLink(rawLink: string, appOrigin: string, redirectPath: string): string {
  try {
    const u = new URL(rawLink);
    const tokenHash = u.searchParams.get("token_hash");
    const type = u.searchParams.get("type") ?? "recovery";
    if (!tokenHash) return rawLink;
    const target = new URL("/auth/verify", appOrigin);
    target.searchParams.set("token_hash", tokenHash);
    target.searchParams.set("type", type);
    target.searchParams.set("next", redirectPath);
    return target.toString();
  } catch {
    return rawLink;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    if (!token) return json({ error: "missing_token" }, 400);

    const { data: row, error } = await admin
      .from("platform_onboarding_tokens")
      .select("id, email, profile_id, tenant_id, branch_id, expires_at, consumed_at, use_count")
      .eq("token", token)
      .maybeSingle();

    if (error) return json({ error: "lookup_failed", detail: error.message }, 500);
    if (!row) return json({ error: "not_found" }, 404);
    if (row.consumed_at) return json({ error: "already_completed" }, 410);
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: "expired" }, 410);
    if (row.use_count >= MAX_USES) return json({ error: "use_limit_reached" }, 429);

    // Resolve tenant + branch slug to build the post-reset return path.
    let tenantSlug: string | null = null;
    let branchSlug: string | null = null;
    if (row.tenant_id) {
      const { data: t } = await admin
        .from("tenants").select("slug, custom_domain").eq("id", row.tenant_id).maybeSingle();
      tenantSlug = t?.slug ?? null;
    }
    if (row.branch_id) {
      const { data: b } = await admin
        .from("branches").select("url_slug, slug").eq("id", row.branch_id).maybeSingle();
      branchSlug = b?.url_slug ?? b?.slug ?? null;
    }

    // Decide which Supabase link type to mint.
    // Branch activation ALWAYS forces a password-set flow so the user lands on
    // /reset-password → /branch (where the subscription modal + onboarding
    // checklist live). Non-branch tokens fall back to magiclink for repeat users.
    let linkType: "recovery" | "magiclink" = "recovery";
    if (!row.branch_id && row.profile_id) {
      const { data: u } = await admin.auth.admin.getUserById(row.profile_id);
      if (u?.user?.last_sign_in_at) linkType = "magiclink";
    }

    const appOrigin = new URL(req.url).origin.includes("supabase")
      ? (req.headers.get("origin") || req.headers.get("referer") || "")
      : new URL(req.url).origin;
    // Prefer caller origin (the welcome page hosting this exchange) so we
    // bounce back to the same host the user is already on.
    const callerOrigin = req.headers.get("origin") || req.headers.get("referer") || "";
    const resolvedOrigin = (() => {
      try { return new URL(callerOrigin).origin; } catch { return appOrigin; }
    })();

    const slugPrefix = tenantSlug ? `/t/${tenantSlug}` : "";
    const branchPath = branchSlug ? `/${branchSlug}` : "";
    const nextParam = row.branch_id ? `&next=branch` : "";
    const redirectPath = linkType === "recovery"
      ? `${slugPrefix}/reset-password?welcome_token=${encodeURIComponent(token)}${nextParam}`
      : `${slugPrefix}${branchPath}?welcome_token=${encodeURIComponent(token)}`;

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: linkType,
      email: row.email,
      options: { redirectTo: `${resolvedOrigin}${redirectPath}` },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      return json({ error: "link_failed", detail: linkErr?.message ?? "no link" }, 500);
    }

    const actionLink = rewriteVerifyLink(linkData.properties.action_link, resolvedOrigin, redirectPath);

    await admin
      .from("platform_onboarding_tokens")
      .update({
        use_count: row.use_count + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return json({ action_link: actionLink, link_type: linkType });
  } catch (e) {
    return json({ error: "internal", detail: (e as Error).message }, 500);
  }
});
