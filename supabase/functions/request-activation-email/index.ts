// Public endpoint backing the "Confirm your email" button on /activate/:slug.
// Verifies the typed email matches the contact on file, then sends the
// activation email (reusable /welcome?token=… link).
//
// Rate-limited: max 1 send per slug per 60s, max 3 per slug per hour.
// Generic response on email mismatch to prevent enumeration.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendBranchActivationEmail } from "../_shared/sendBranchActivation.ts";

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

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const DAILY_SALT = (() => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
})();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug ?? "").trim();
    const confirmEmail = String(body.confirm_email ?? "").trim().toLowerCase();
    if (!slug || !confirmEmail) return json({ error: "missing_fields" }, 400);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipHash = await sha256(`${ip}|${DAILY_SALT}`);
    const callerOrigin = req.headers.get("origin") || req.headers.get("referer") || null;

    const audit = async (result: string, email_confirmed: boolean) => {
      await admin.from("platform_activation_requests").insert({
        slug, ip_hash: ipHash, email_confirmed, result,
      });
    };

    // Rate limit
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const sixtySecAgo = new Date(now - 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("platform_activation_requests")
      .select("created_at, result")
      .eq("slug", slug)
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: false });
    const sentRecent = (recent ?? []).filter((r: any) => r.result === "sent");
    if (sentRecent.length >= 3) {
      await audit("rate_limited", false);
      return json({ ok: false, code: "rate_limited" });
    }
    if (sentRecent.some((r: any) => r.created_at > sixtySecAgo)) {
      await audit("rate_limited", false);
      return json({ ok: false, code: "rate_limited" });
    }

    const { data: page } = await admin
      .from("platform_branch_activation_pages")
      .select("id, tenant_id, branch_id, contact_email, is_active")
      .eq("slug", slug).maybeSingle();
    if (!page) {
      await audit("not_found", false);
      // Generic response — don't reveal slug validity
      return json({ ok: true, code: "sent_if_valid" });
    }
    if (!page.is_active) {
      await audit("inactive", false);
      return json({ ok: false, code: "inactive" });
    }

    // Constant-ish-time email compare
    const onFile = (page.contact_email ?? "").trim().toLowerCase();
    const matches = onFile && onFile === confirmEmail;
    if (!matches) {
      await audit("mismatch", false);
      // Always generic — never reveal the real address
      return json({ ok: true, code: "sent_if_valid" });
    }

    // Build authHeader for forwarding to send-email (use anon — send-email is jwt=false)
    const authHeader = req.headers.get("Authorization") ?? `Bearer ${anonKey}`;

    const result = await sendBranchActivationEmail({
      admin, supabaseUrl: url, anonKey, authHeader,
      tenantId: page.tenant_id, branchId: page.branch_id,
      templateSlug: "activation_branch_manager",
      callerOrigin,
    });

    if (!result.ok) {
      await audit("failed", true);
      console.error("activation send failed:", result.error);
      return json({ ok: false, code: "send_failed" }, 500);
    }

    // Persist the opaque token so /welcome can redeem it later
    await admin.from("platform_onboarding_tokens").insert({
      token: result.opaqueToken!,
      tenant_id: page.tenant_id,
      branch_id: page.branch_id,
      profile_id: result.profileId,
      email: result.email,
      purpose: "branch_activation",
    });

    // Mark the most recent marketing-campaign recipient for this branch as activated
    // so "not_activated" follow-up triggers stop firing.
    await admin.from("platform_email_campaign_recipients")
      .update({ activated_at: new Date().toISOString() })
      .eq("branch_id", page.branch_id)
      .is("activated_at", null);

    await audit("sent", true);
    return json({ ok: true, code: "sent_if_valid" });
  } catch (e) {
    console.error("request-activation-email error:", e);
    return json({ error: "internal" }, 500);
  }
});
