// Daily dunning sweep — fires reminder emails at day 0/3/6 of the 7-day grace
// window, and flips status to "restricted" once grace_until is in the past.
// Trigger via pg_cron (daily). Idempotent: tracked via dunning_log_<day> flags
// in branch_subscriptions.metadata to avoid double-sending.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  platformNotify,
  tenantOwnerEmails,
  platformEmailLayout,
} from "../_shared/platform-notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface BS {
  id: string;
  branch_id: string;
  tenant_id: string;
  status: string | null;
  grace_until: string | null;
  current_period_end: string | null;
  metadata: Record<string, unknown> | null;
}

const DAY = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const now = Date.now();
  const results = { reminded: 0, restricted: 0, errors: [] as string[] };

  try {
    const { data: rows, error } = await (sb as any)
      .from("branch_subscriptions")
      .select("id, branch_id, tenant_id, status, grace_until, current_period_end, metadata")
      .in("status", ["past_due", "unpaid"]);
    if (error) throw error;

    for (const bs of (rows ?? []) as BS[]) {
      try {
        const grace = bs.grace_until ? new Date(bs.grace_until).getTime() : null;
        const meta = (bs.metadata ?? {}) as Record<string, unknown>;

        // Grace expired → restrict
        if (grace && grace <= now && bs.status !== "restricted") {
          await (sb as any).from("branch_subscriptions")
            .update({ status: "restricted" }).eq("id", bs.id);
          results.restricted++;
          await notifyBranch(bs, "restricted");
          continue;
        }

        if (!grace) continue;

        // Reminder stages, anchored to (grace_until - 7 days) = day 0 of grace.
        const start = grace - 7 * DAY;
        const elapsed = Math.floor((now - start) / DAY);
        const stage =
          elapsed >= 6 ? "day6" :
          elapsed >= 3 ? "day3" :
          elapsed >= 0 ? "day0" : null;
        if (!stage) continue;
        const flagKey = `dunning_${stage}`;
        if (meta[flagKey]) continue;

        await notifyBranch(bs, stage);
        await (sb as any).from("branch_subscriptions")
          .update({ metadata: { ...meta, [flagKey]: new Date().toISOString() } })
          .eq("id", bs.id);
        results.reminded++;
      } catch (e: any) {
        console.error("dunning row failed", bs.id, e);
        results.errors.push(`${bs.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    console.error("dunning sweep failed:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function notifyBranch(bs: BS, stage: "day0" | "day3" | "day6" | "restricted") {
  const { data: branch } = await (sb as any).from("branches")
    .select("name, trading_name").eq("id", bs.branch_id).maybeSingle();
  const name = (branch as any)?.trading_name || (branch as any)?.name || "your branch";

  const recipients = new Set<string>(await tenantOwnerEmails(sb, bs.tenant_id));
  const { data: bp } = await (sb as any).from("branch_private")
    .select("billing_email").eq("branch_id", bs.branch_id).maybeSingle();
  if ((bp as any)?.billing_email) recipients.add((bp as any).billing_email);

  const graceEnd = bs.grace_until ? new Date(bs.grace_until).toLocaleDateString() : "";

  let subject = "";
  let body = "";
  if (stage === "day0") {
    subject = `Payment failed — ${name}`;
    body = `<p>We couldn't collect your Document Centre subscription payment for <strong>${name}</strong>.</p>
      <p>You have until <strong>${graceEnd}</strong> to update your billing details. Your branch remains fully operational during this grace period, but online checkout is paused.</p>`;
  } else if (stage === "day3") {
    subject = `Reminder: update billing for ${name}`;
    body = `<p>This is a reminder that the subscription payment for <strong>${name}</strong> is still outstanding.</p>
      <p>You have until <strong>${graceEnd}</strong> before the branch is restricted to billing-only access.</p>`;
  } else if (stage === "day6") {
    subject = `Final notice: ${name} will be restricted tomorrow`;
    body = `<p><strong>Final reminder:</strong> the subscription for <strong>${name}</strong> remains unpaid.</p>
      <p>On <strong>${graceEnd}</strong> the branch portal will be restricted to billing settings only and the storefront will not accept new orders.</p>`;
  } else {
    subject = `${name} has been restricted — update billing to restore access`;
    body = `<p>The grace period has expired. The branch portal for <strong>${name}</strong> is now restricted to billing settings only, and the storefront is not accepting new orders.</p>
      <p>Update your payment details to restore full access immediately.</p>`;
  }

  await platformNotify(sb, {
    event: stage === "restricted" ? "branch_restricted" : "branch_dunning",
    recipients: [...recipients],
    tenant_id: bs.tenant_id,
    related_type: "branch_subscription",
    related_id: bs.id,
    subject,
    html: platformEmailLayout(subject, body),
  });
}
