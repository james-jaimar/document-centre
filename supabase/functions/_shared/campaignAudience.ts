// Shared helpers for platform- AND tenant-scoped email campaigns.
//
// A campaign targets one of three audiences, all normalised into the same
// `CampaignTarget` shape so the dispatch pipeline stays audience-agnostic:
//   branch   → public.branches
//   company  → public.customer_companies (business / trade accounts)
//   customer → public.profiles reachable through tenant_memberships
//
// Also owns sender resolution (platform mailbox vs the tenant's own account),
// activation-page upserts per audience, and unsubscribe suppression.

// deno-lint-ignore no-explicit-any
type Admin = any;

export type Audience = "branch" | "company" | "customer";
export type CampaignScope = "platform" | "tenant";

export interface CampaignTarget {
  id: string;
  kind: Audience;
  /** Organisation / person name shown as {{branch_name}} / {{company_name}}. */
  name: string;
  email: string | null;
  /** Person we address in the greeting ({{contact_name}}). */
  contactName: string;
  slug?: string | null;
  urlSlug?: string | null;
}

export const AUDIENCE_COLUMN: Record<Audience, "branch_id" | "company_id" | "profile_id"> = {
  branch: "branch_id",
  company: "company_id",
  customer: "profile_id",
};

export function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id ?? "").trim()).filter(Boolean))];
}

export function mintToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Owner/admin of the tenant, or a platform admin. */
export async function callerCanSendForTenant(
  admin: Admin,
  callerId: string,
  tenantId: string,
): Promise<{ allowed: boolean; scope: CampaignScope }> {
  const { data: roleRow } = await admin
    .from("user_roles").select("role")
    .eq("user_id", callerId).eq("role", "platform_admin").maybeSingle();
  if (roleRow) return { allowed: true, scope: "platform" };

  if (!tenantId) return { allowed: false, scope: "tenant" };
  const { data: membership } = await admin
    .from("tenant_memberships").select("id")
    .eq("profile_id", callerId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .limit(1).maybeSingle();
  return { allowed: !!membership, scope: "tenant" };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Resolves selected ids into targets. Ids are queried in chunks — a single
 * `id=in.(...)` with hundreds of UUIDs blows the PostgREST URL length limit.
 */
export async function resolveTargets(
  admin: Admin,
  tenantId: string,
  audience: Audience,
  allIds: string[],
): Promise<CampaignTarget[]> {
  if (!allIds.length) return [];
  if (allIds.length > 100) {
    const out: CampaignTarget[] = [];
    for (const part of chunk(allIds, 100)) {
      out.push(...await resolveTargets(admin, tenantId, audience, part));
    }
    return out;
  }
  const ids = allIds;

  if (audience === "branch") {
    const { data, error } = await admin
      .from("branches")
      .select("id, name, email, slug, url_slug, trading_name")
      .eq("tenant_id", tenantId).in("id", ids);
    if (error) throw new Error(`branch_lookup: ${error.message}`);
    return ((data ?? []) as any[]).map((b) => ({
      id: b.id,
      kind: "branch" as const,
      name: b.name,
      email: b.email ?? null,
      contactName: b.trading_name || b.name,
      slug: b.slug,
      urlSlug: b.url_slug,
    }));
  }

  if (audience === "company") {
    const { data, error } = await admin
      .from("customer_companies")
      .select("id, name, trading_name, email")
      .eq("tenant_id", tenantId).in("id", ids);
    if (error) throw new Error(`company_lookup: ${error.message}`);
    return ((data ?? []) as any[]).map((c) => ({
      id: c.id,
      kind: "company" as const,
      name: c.trading_name || c.name,
      email: c.email ?? null,
      contactName: c.trading_name || c.name,
    }));
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name, first_name, last_name, tenant_id")
    .in("id", ids);
  if (error) throw new Error(`customer_lookup: ${error.message}`);

  // Only people who actually belong to this tenant.
  const { data: memberships } = await admin
    .from("tenant_memberships").select("profile_id")
    .eq("tenant_id", tenantId).in("profile_id", ids);
  const allowed = new Set(((memberships ?? []) as any[]).map((m) => m.profile_id));

  return ((data ?? []) as any[])
    .filter((p) => allowed.has(p.id) || p.tenant_id === tenantId)
    .map((p) => {
      const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      const name = p.display_name || full || p.email || "Customer";
      return {
        id: p.id,
        kind: "customer" as const,
        name,
        email: p.email ?? null,
        contactName: p.first_name || p.display_name || name,
      };
    });
}

/**
 * Platform campaigns send from the Document Centre mailbox; tenant campaigns
 * send from the tenant's own connected account.
 */
export async function resolveSenderAccountId(
  admin: Admin,
  scope: CampaignScope,
  tenantId: string,
): Promise<string | null> {
  const base = () =>
    admin.from("email_accounts").select("id").eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

  if (scope === "tenant") {
    const { data, error } = await base().eq("tenant_id", tenantId).is("branch_id", null).maybeSingle();
    if (error) throw new Error(`Tenant sender lookup failed: ${error.message}`);
    return data?.id ?? null;
  }

  const { data, error } = await base().is("tenant_id", null).is("branch_id", null).maybeSingle();
  if (error) throw new Error(`Platform sender lookup failed: ${error.message}`);
  return data?.id ?? null;
}

export const NO_SENDER_MESSAGE: Record<CampaignScope, string> = {
  platform: "Platform sender mailbox not configured — connect one under Platform → Settings → Email.",
  tenant: "No outgoing email account for this tenant — connect one under Settings → Email Accounts.",
};

/** Emails (lowercase) that must never receive marketing for this tenant. */
export async function fetchSuppressedEmails(
  admin: Admin,
  tenantId: string,
  emails: string[],
): Promise<Set<string>> {
  const lower = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const out = new Set<string>();
  if (!lower.length) return out;

  const { data: unsub } = await admin
    .from("email_unsubscribes").select("email, tenant_id")
    .in("email", lower);
  for (const row of ((unsub ?? []) as any[])) {
    if (!row.tenant_id || row.tenant_id === tenantId) out.add(String(row.email).toLowerCase());
  }

  const { data: hard } = await admin
    .from("email_suppressions").select("email").in("email", lower);
  for (const row of ((hard ?? []) as any[])) out.add(String(row.email).toLowerCase());

  return out;
}

export function buildUnsubscribeUrl(supabaseUrl: string, token: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/email-unsubscribe?t=${encodeURIComponent(token)}`;
}

/** Appends a compliant unsubscribe footer when the body doesn't already carry one. */
export function withUnsubscribeFooter(
  html: string,
  text: string,
  unsubscribeUrl: string,
  senderLabel: string,
): { html: string; text: string } {
  if (html.includes(unsubscribeUrl)) return { html, text };
  const footer = `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:12px;line-height:1.5;color:#8a8a8a;text-align:center;">
You received this email from ${senderLabel}.<br />
<a href="${unsubscribeUrl}" style="color:#8a8a8a;text-decoration:underline;">Unsubscribe from these emails</a>
</div>`;
  const closing = html.lastIndexOf("</body>");
  const nextHtml = closing >= 0
    ? `${html.slice(0, closing)}${footer}${html.slice(closing)}`
    : `${html}${footer}`;
  const nextText = `${text}\n\n—\nYou received this email from ${senderLabel}.\nUnsubscribe: ${unsubscribeUrl}\n`;
  return { html: nextHtml, text: nextText };
}

/** Creates (or reuses) the /activate/:slug page for any audience member. */
export async function upsertActivationPage(
  admin: Admin,
  tenant: { id: string; app_id: string | null },
  target: CampaignTarget,
  email: string,
  contactName: string,
): Promise<string> {
  const column = AUDIENCE_COLUMN[target.kind];
  const { data: existing, error: lookupErr } = await admin
    .from("platform_branch_activation_pages")
    .select("id, slug")
    .eq(column, target.id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (lookupErr) throw new Error(`activation_page_lookup: ${lookupErr.message}`);

  const payload: Record<string, unknown> = {
    tenant_id: tenant.id,
    app_id: tenant.app_id,
    contact_email: email,
    contact_name: contactName,
    is_active: true,
  };
  payload[column] = target.id;

  if (existing?.id) {
    const { error } = await admin
      .from("platform_branch_activation_pages").update(payload).eq("id", existing.id);
    if (error) throw new Error(`activation_page_update: ${error.message}`);
    return existing.slug as string;
  }

  const slug = mintToken(12);
  const { error } = await admin
    .from("platform_branch_activation_pages").insert({ ...payload, slug });
  if (error) throw new Error(`activation_page_insert: ${error.message}`);
  return slug;
}
