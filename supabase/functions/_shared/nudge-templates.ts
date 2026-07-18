// Copy for v1 platform nudges. Kept in code by design — Platform → Communications
// only exposes toggles and timing offsets, not template editing.

export interface NudgeTemplateVars {
  branch_name: string;
  tenant_name: string;
  portal_url: string;
  days_left?: number;      // for expiring / grace
  days_since?: number;     // for expired / stalled
}

export interface RenderedNudge {
  subject: string;
  html: string;
}

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function shell(bodyHtml: string) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1f2937;line-height:1.55;font-size:15px">${bodyHtml}</div>`;
}

function cta(label: string, url: string) {
  return `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${esc(label)}</a></p>`;
}

export function renderNudge(nudgeKey: string, offsetDay: number, v: NudgeTemplateVars): RenderedNudge {
  const branch = esc(v.branch_name);
  const tenant = esc(v.tenant_name);
  const days = v.days_left ?? 0;
  const since = v.days_since ?? 0;

  switch (nudgeKey) {
    case "trial_expiring": {
      const subject = days <= 1
        ? `Your ${tenant} trial ends tomorrow`
        : `Your ${tenant} trial ends in ${days} days`;
      return {
        subject,
        html: shell(
          `<p>Hi ${branch} team,</p>
           <p>Your ${tenant} trial ends in <strong>${days} day${days === 1 ? "" : "s"}</strong>. To keep your store open and continue taking orders, pick a subscription now.</p>
           ${cta("Choose a subscription", `${v.portal_url}/branch/billing`)}
           <p style="color:#6b7280;font-size:13px">If you subscribe before the trial ends, service continues without interruption.</p>`
        ),
      };
    }

    case "trial_expired": {
      const subject = offsetDay === 0
        ? `Your ${tenant} trial has ended`
        : `Reminder: activate your ${tenant} subscription`;
      return {
        subject,
        html: shell(
          `<p>Hi ${branch} team,</p>
           <p>Your trial ended ${since === 0 ? "today" : `${since} day${since === 1 ? "" : "s"} ago`}. Your storefront is currently paused for new orders.</p>
           <p>Activate a paid subscription to reopen the store and access the admin portal.</p>
           ${cta("Activate subscription", `${v.portal_url}/branch/billing`)}`
        ),
      };
    }

    case "payment_past_due": {
      const subject = days <= 1
        ? `Payment failed — action required within 24 hours`
        : `Payment failed — please update your card within ${days} days`;
      return {
        subject,
        html: shell(
          `<p>Hi ${branch} team,</p>
           <p>We couldn't collect your latest ${tenant} subscription payment. Your account is in a grace period for <strong>${days} more day${days === 1 ? "" : "s"}</strong>.</p>
           <p>Please update your payment method to avoid interruption.</p>
           ${cta("Update payment", `${v.portal_url}/branch/billing`)}`
        ),
      };
    }

    case "subscription_cancelled": {
      return {
        subject: `Your ${tenant} subscription has been cancelled`,
        html: shell(
          `<p>Hi ${branch} team,</p>
           <p>Your ${tenant} subscription has been cancelled and your storefront is now closed to new orders.</p>
           <p>If this wasn't intended, you can reactivate at any time.</p>
           ${cta("Reactivate", `${v.portal_url}/branch/billing`)}`
        ),
      };
    }

    case "onboarding_stalled": {
      return {
        subject: `Finish setting up ${branch} on ${tenant}`,
        html: shell(
          `<p>Hi ${branch} team,</p>
           <p>It's been ${since} day${since === 1 ? "" : "s"} since your branch was activated and there are still a few setup steps to complete before you can start trading.</p>
           <p>The checklist takes about 10 minutes and covers your company details, banking, pricing review, and a test order.</p>
           ${cta("Open the checklist", `${v.portal_url}/branch/settings`)}`
        ),
      };
    }
  }

  return {
    subject: `${tenant} — notification`,
    html: shell(`<p>Hi ${branch} team,</p><p>This is a system notification from ${tenant}.</p>`),
  };
}
