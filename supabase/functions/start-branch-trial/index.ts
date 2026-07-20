import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { branch_id?: string; acceptances?: { slug: string; version: number }[] };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.branch_id) {
    return new Response(JSON.stringify({ error: "branch_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const REQUIRED_DOCS = ["terms", "privacy", "dpa", "billing"];
  const acceptedSlugs = new Set((body.acceptances ?? []).map((a) => a.slug));
  const missing = REQUIRED_DOCS.filter((s) => !acceptedSlugs.has(s));
  if (missing.length > 0) {
    return new Response(JSON.stringify({ error: `Missing acceptance for: ${missing.join(", ")}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify caller belongs to this branch (any active tenant membership scoped to it,
  // or owner/admin of the tenant the branch belongs to)
  const { data: branch } = await sb.from("branches")
    .select("id, tenant_id, name, email")
    .eq("id", body.branch_id).single();
  if (!branch) {
    return new Response(JSON.stringify({ error: "Branch not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: memberships } = await sb.from("tenant_memberships")
    .select("role, branch_id").eq("profile_id", user.id)
    .eq("tenant_id", branch.tenant_id).eq("is_active", true);
  const hasAccess = (memberships ?? []).some((m: any) =>
    m.role === "owner" || m.role === "admin" ||
    (m.branch_id === branch.id));
  if (!hasAccess) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check prior state to know if this call actually starts the trial
  const { data: prior } = await sb.from("branch_subscriptions" as any)
    .select("trial_started_at, trial_ends_at, assigned_plan_slug, trial_days, region_id, trial_started_via, stripe_subscription_id").eq("branch_id", branch.id).maybeSingle();

  // Only stamp if a plan is assigned (no plan → nothing to trial)
  if (!(prior as any)?.assigned_plan_slug) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_plan" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Enforce one-trial-per-branch. Once a trial has been started (either path),
  // a Stripe subscription exists, or a prior trial window has already elapsed,
  // the only remaining option is paid checkout.
  const priorTrialEndsAt = (prior as any)?.trial_ends_at ? new Date((prior as any).trial_ends_at) : null;
  const priorTrialElapsed = priorTrialEndsAt && priorTrialEndsAt.getTime() <= Date.now();
  if ((prior as any)?.trial_started_via || (prior as any)?.trial_started_at || (prior as any)?.stripe_subscription_id || priorTrialElapsed) {
    return new Response(JSON.stringify({ error: "trial_already_used", message: "This branch has already used its trial. Please subscribe to continue." }), {
      status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Enforce the plan's trial_offer setting — 14-day no-card path must be allowed.
  const { data: plan } = await sb.from("platform_pricing_plans")
    .select("trial_offer")
    .eq("region_id", (prior as any).region_id)
    .eq("plan_slug", (prior as any).assigned_plan_slug)
    .maybeSingle();
  const trialOffer = (plan as any)?.trial_offer ?? "both";
  if (trialOffer !== "trial_14_no_card" && trialOffer !== "both") {
    return new Response(JSON.stringify({ error: "14-day no-card trial is not offered on this plan" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const wasNotStarted = !prior?.trial_started_at;

  const { data: sub, error: rpcErr } = await sb.rpc("start_branch_trial", {
    _branch_id: branch.id,
  });
  if (rpcErr) {
    return new Response(JSON.stringify({ error: rpcErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Stamp which trial path was used + ensure status='trialing' (best-effort).
  await sb.from("branch_subscriptions" as any)
    .update({ trial_started_via: "no_card_14", status: "trialing" })
    .eq("branch_id", branch.id);

  // Persist acceptances in the immutable ledger — same shape as create-branch-checkout.
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") || null;
    const rows = (body.acceptances ?? []).map((a) => ({
      branch_id: branch.id,
      tenant_id: branch.tenant_id,
      accepted_by: user.id,
      document_slug: a.slug,
      document_version: a.version,
      ip_address: ip,
      user_agent: ua,
      context: "branch_trial_14_no_card",
    }));
    if (rows.length > 0) {
      const { error: accErr } = await sb.from("subscription_acceptances" as any).insert(rows);
      if (accErr) console.error("subscription_acceptances insert failed:", accErr);
    }
  } catch (e) {
    console.error("Failed to log acceptances:", e);
  }

  // Fire welcome email exactly once (when trial flipped from not_started → active)
  if (wasNotStarted) {
    try {
      const { data: bp } = await sb.from("branch_private" as any).select("billing_email").eq("branch_id", branch.id).maybeSingle();
      const toEmail = (bp as any)?.billing_email || (branch as any).email || user.email;
      if (toEmail) {
        await sb.functions.invoke("send-email", {
          body: {
            to: toEmail,
            subject: "Your 14-day Document Centre trial has started",
            html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
              <h1 style="font-size:22px;margin:0 0 12px">Welcome, ${branch.name}!</h1>
              <p>Your 14-day free trial of the Document Centre branch portal is now active.</p>
              <p><strong>What you can do right now:</strong></p>
              <ul>
                <li>Confirm your company details</li>
                <li>Connect your branch email account</li>
                <li>Upload your branding</li>
                <li>Set up PayFast to start accepting card payments</li>
                <li>Invite your team</li>
              </ul>
              <p>Head to your branch dashboard to see your onboarding checklist.</p>
              <p style="margin-top:24px;color:#64748b;font-size:13px">If you didn't expect this email, please ignore it.</p>
            </div>`,
          },
        });
      }
    } catch (e) {
      console.error("trial welcome email failed:", e);
    }
  }

  return new Response(JSON.stringify({ ok: true, subscription: sub }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
