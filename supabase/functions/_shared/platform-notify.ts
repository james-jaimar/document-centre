// Helper: send a platform-level notification email.
//
// Reads the `platform_settings` toggle (category='notifications', setting_key=event)
// and enqueues an email per recipient using the platform email account
// (tenant_id null in email-queue resolution).
//
// Best-effort by design — never throws back to the caller. Subscription
// updates, plan changes, etc. should still succeed even if email fails.

import { enqueueEmail } from "./email-queue.ts";
import { kickEmailWorker } from "./email-kick.ts";

type SupabaseClient = any;

export interface PlatformNotifyInput {
  event: string;
  recipients: string[]; // email addresses
  subject: string;
  html: string;
  text?: string;
  tenant_id?: string | null; // for related_id/audit only
  related_type?: string | null;
  related_id?: string | null;
  metadata?: Record<string, unknown>;
}

export async function isPlatformNotificationEnabled(
  admin: SupabaseClient,
  event: string,
): Promise<boolean> {
  const { data } = await admin
    .from("platform_settings")
    .select("setting_value")
    .eq("category", "notifications")
    .eq("setting_key", event)
    .maybeSingle();
  // Default to TRUE if no row (so missing seed doesn't silently disable).
  if (!data) return true;
  return data.setting_value === true || data.setting_value === "true";
}

export async function platformNotify(
  admin: SupabaseClient,
  input: PlatformNotifyInput,
): Promise<{ enqueued: number; skipped?: string }> {
  try {
    if (!input.recipients?.length) return { enqueued: 0, skipped: "no_recipients" };

    const enabled = await isPlatformNotificationEnabled(admin, input.event);
    if (!enabled) return { enqueued: 0, skipped: "disabled" };

    let count = 0;
    for (const to of input.recipients) {
      if (!to || !to.includes("@")) continue;
      try {
        await enqueueEmail(admin, {
          // tenant_id intentionally null → resolves to platform email account
          tenant_id: null,
          to,
          subject: input.subject,
          html: input.html,
          text: input.text ?? null,
          category: "system",
          related_type: input.related_type ?? `platform:${input.event}`,
          related_id: input.related_id ?? input.tenant_id ?? null,
          metadata: {
            platform_event: input.event,
            tenant_id: input.tenant_id ?? null,
            ...(input.metadata ?? {}),
          },
        });
        count++;
      } catch (e) {
        console.error(`platformNotify: enqueue failed for ${to}`, e);
      }
    }

    if (count > 0) kickEmailWorker();
    return { enqueued: count };
  } catch (e) {
    console.error("platformNotify error:", e);
    return { enqueued: 0, skipped: "error" };
  }
}

// ── Recipient resolvers ─────────────────────────────────────────────────────

export async function tenantOwnerEmails(
  admin: SupabaseClient,
  tenant_id: string,
): Promise<string[]> {
  const { data } = await admin
    .from("tenant_memberships")
    .select("profile_id, role, is_active, profiles:profile_id(email)")
    .eq("tenant_id", tenant_id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"]);
  const out = new Set<string>();
  for (const m of (data ?? []) as any[]) {
    const e = m?.profiles?.email;
    if (e) out.add(String(e).toLowerCase());
  }
  return [...out];
}

export async function platformAdminEmails(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from("user_roles")
    .select("user_id, profiles:user_id(email)")
    .eq("role", "platform_admin");
  const out = new Set<string>();
  for (const r of (data ?? []) as any[]) {
    const e = r?.profiles?.email;
    if (e) out.add(String(e).toLowerCase());
  }
  return [...out];
}

export async function branchBillingEmails(
  admin: SupabaseClient,
  branch_id: string,
): Promise<string[]> {
  const { data } = await admin
    .from("branches")
    .select("billing_email, email")
    .eq("id", branch_id)
    .maybeSingle();
  const out: string[] = [];
  if (data?.billing_email) out.push(String(data.billing_email).toLowerCase());
  if (data?.email && !out.includes(String(data.email).toLowerCase())) {
    out.push(String(data.email).toLowerCase());
  }
  return out;
}

// ── Tiny template helper ────────────────────────────────────────────────────

export function platformEmailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
<tr><td>
<div style="font-size:18px;font-weight:600;color:#1a1a2e;margin-bottom:20px;">Document Centre</div>
<h1 style="font-size:20px;font-weight:600;color:#111;margin:0 0 16px;">${title}</h1>
<div style="font-size:14px;line-height:1.6;color:#444;">${bodyHtml}</div>
<hr style="border:none;border-top:1px solid #eee;margin:28px 0 16px;" />
<p style="font-size:12px;color:#999;margin:0;">Document Centre — Jaimar Developments Ltd</p>
</td></tr></table></td></tr></table></body></html>`;
}
