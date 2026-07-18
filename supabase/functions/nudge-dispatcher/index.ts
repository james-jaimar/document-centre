// nudge-dispatcher: platform-controlled system email nudges.
// Runs hourly via pg_cron. For each enabled nudge, finds branches whose
// anchor timestamp matches one of the configured offsets_days, resolves
// branch-admin recipients, renders the template, enqueues via email-queue,
// and records a row in nudge_send_log to guarantee each nudge fires at
// most once per (branch, nudge_key, offset_day, recipient).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { enqueueEmail } from "../_shared/email-queue.ts";
import { kickEmailWorker } from "../_shared/email-kick.ts";
import { renderNudge } from "../_shared/nudge-templates.ts";
import { htmlToText } from "../_shared/htmlToText.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NUDGE_KEYS = [
  "trial_expiring",
  "trial_expired",
  "payment_past_due",
  "subscription_cancelled",
  "onboarding_stalled",
] as const;

type NudgeKey = typeof NUDGE_KEYS[number];

interface Settings {
  nudge_key: NudgeKey;
  enabled: boolean;
  offsets_days: number[];
}

function daysBetween(future: Date, from: Date) {
  const ms = future.getTime() - from.getTime();
  return Math.round(ms / 86_400_000);
}

async function resolveRecipients(admin: any, branch: { id: string; tenant_id: string; email: string | null }) {
  // Branch owner/admin members via tenant_memberships → profiles.email
  const { data: memberships } = await admin
    .from("tenant_memberships")
    .select("profile_id, role, branch_id, is_active")
    .eq("tenant_id", branch.tenant_id)
    .eq("is_active", true);
  const profileIds = new Set<string>();
  for (const m of memberships ?? []) {
    const role = String(m.role || "").toLowerCase();
    const branchScoped = m.branch_id === branch.id;
    const tenantScoped = m.branch_id == null;
    if ((tenantScoped && (role === "owner" || role === "admin")) ||
        (branchScoped && (role === "owner" || role === "admin" || role === "branch_manager"))) {
      profileIds.add(m.profile_id);
    }
  }
  const emails = new Set<string>();
  if (profileIds.size) {
    const { data: profiles } = await admin
      .from("profiles").select("id, email").in("id", Array.from(profileIds));
    for (const p of profiles ?? []) if (p.email) emails.add(String(p.email).toLowerCase());
  }
  if (branch.email) emails.add(String(branch.email).toLowerCase());
  return Array.from(emails);
}

async function loadPortalUrl(admin: any, tenant: { slug: string | null; custom_domain: string | null }): Promise<string> {
  if (tenant.custom_domain) {
    const clean = tenant.custom_domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return `https://${clean}`;
  }
  if (tenant.slug) return `https://document-centre.com/t/${tenant.slug}`;
  return "https://document-centre.com";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const now = new Date();
    const summary: Record<string, any> = { started_at: now.toISOString(), sent: 0, skipped: 0, errors: [] as any[] };

    const { data: settingsRows } = await admin
      .from("platform_nudge_settings").select("nudge_key, enabled, offsets_days");
    const settings = new Map<NudgeKey, Settings>();
    for (const r of (settingsRows ?? []) as Settings[]) settings.set(r.nudge_key, r);

    // Pre-load branch → tenant lookups lazily inside handlers below.
    const dispatch = async (
      nudgeKey: NudgeKey,
      candidates: Array<{ branch: any; tenant: any; anchor: Date | null; kind: "before" | "after" }>,
    ) => {
      const cfg = settings.get(nudgeKey);
      if (!cfg || !cfg.enabled || !cfg.offsets_days?.length) return;
      for (const { branch, tenant, anchor, kind } of candidates) {
        if (!anchor) continue;
        const delta = kind === "before" ? daysBetween(anchor, now) : daysBetween(now, anchor);
        // "Fire on the day the delta hits the offset". For cancellation/one-off we accept 0.
        if (!cfg.offsets_days.includes(delta)) continue;
        const recipients = await resolveRecipients(admin, branch);
        if (!recipients.length) { summary.skipped++; continue; }
        const portalUrl = await loadPortalUrl(admin, tenant);
        const vars = {
          branch_name: branch.name ?? "your branch",
          tenant_name: tenant.name ?? "Document Centre",
          portal_url: portalUrl,
          days_left: kind === "before" ? delta : undefined,
          days_since: kind === "after" ? delta : undefined,
        };
        const { subject, html } = renderNudge(nudgeKey, delta, vars);
        const text = htmlToText(html);

        for (const to of recipients) {
          // Dedupe pre-check
          const { data: existing } = await admin
            .from("nudge_send_log")
            .select("id")
            .eq("branch_id", branch.id)
            .eq("nudge_key", nudgeKey)
            .eq("offset_day", delta)
            .eq("recipient_email", to)
            .maybeSingle();
          if (existing) continue;
          try {
            const queued = await enqueueEmail(admin, {
              to,
              subject,
              html,
              text,
              tenant_id: tenant.id,
              branch_id: branch.id,
              app_id: tenant.app_id ?? null,
              category: "system",
              related_type: "nudge",
              related_id: null,
              metadata: { nudge_key: nudgeKey, offset_day: delta },
            });
            const { error: insErr } = await admin.from("nudge_send_log").insert({
              branch_id: branch.id, nudge_key: nudgeKey, offset_day: delta,
              recipient_email: to, outbox_id: queued?.id ?? null,
            });
            if (insErr && insErr.code !== "23505") throw insErr;
            summary.sent++;
          } catch (err: any) {
            summary.errors.push({ branch_id: branch.id, nudge_key: nudgeKey, to, error: String(err?.message ?? err) });
          }
        }
      }
    };

    // ---------- Gather candidate branches per nudge type ----------
    // We only join what we need. Small scale (hundreds of branches) so full scans are fine.

    const { data: allBranches } = await admin
      .from("branches").select("id, name, email, tenant_id, is_active").eq("is_active", true);
    const branchIds = (allBranches ?? []).map((b: any) => b.id);
    const tenantIds = Array.from(new Set((allBranches ?? []).map((b: any) => b.tenant_id)));

    const { data: tenantsRows } = await admin
      .from("tenants").select("id, name, slug, custom_domain, app_id").in("id", tenantIds.length ? tenantIds : ["00000000-0000-0000-0000-000000000000"]);
    const tenantById = new Map<string, any>();
    for (const t of tenantsRows ?? []) tenantById.set(t.id, t);

    const { data: subs } = await admin
      .from("branch_subscriptions")
      .select("branch_id, status, billing_status, trial_ends_at, cancelled_at, grace_until")
      .in("branch_id", branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"]);
    const subByBranch = new Map<string, any>();
    for (const s of subs ?? []) subByBranch.set(s.branch_id, s);

    const { data: onboarding } = await admin
      .from("branch_onboarding_progress")
      .select("branch_id, completed_at, created_at");
    const onboardingByBranch = new Map<string, any>();
    for (const o of onboarding ?? []) onboardingByBranch.set(o.branch_id, o);

    const trialExpiring: any[] = [];
    const trialExpired: any[] = [];
    const paymentPastDue: any[] = [];
    const cancelled: any[] = [];
    const onboardingStalled: any[] = [];

    for (const b of allBranches ?? []) {
      const tenant = tenantById.get(b.tenant_id);
      if (!tenant) continue;
      const sub = subByBranch.get(b.id);

      if (sub?.trial_ends_at) {
        const anchor = new Date(sub.trial_ends_at);
        const isPaid = sub.status === "active" && sub.billing_status !== "pending_payment";
        if (!isPaid) {
          if (anchor > now) trialExpiring.push({ branch: b, tenant, anchor, kind: "before" });
          else trialExpired.push({ branch: b, tenant, anchor, kind: "after" });
        }
      }

      if (sub?.billing_status === "past_due" && sub?.grace_until) {
        paymentPastDue.push({ branch: b, tenant, anchor: new Date(sub.grace_until), kind: "before" });
      }

      if (sub?.cancelled_at && (sub.status === "cancelled" || sub.billing_status === "cancelled" || sub.status === "force_cancel")) {
        cancelled.push({ branch: b, tenant, anchor: new Date(sub.cancelled_at), kind: "after" });
      }

      const ob = onboardingByBranch.get(b.id);
      if (ob && !ob.completed_at && ob.created_at) {
        onboardingStalled.push({ branch: b, tenant, anchor: new Date(ob.created_at), kind: "after" });
      }
    }

    await dispatch("trial_expiring", trialExpiring);
    await dispatch("trial_expired", trialExpired);
    await dispatch("payment_past_due", paymentPastDue);
    await dispatch("subscription_cancelled", cancelled);
    await dispatch("onboarding_stalled", onboardingStalled);

    if (summary.sent > 0) kickEmailWorker();

    summary.finished_at = new Date().toISOString();
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("nudge-dispatcher error", error);
    return new Response(JSON.stringify({ error: String(error?.message ?? error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
