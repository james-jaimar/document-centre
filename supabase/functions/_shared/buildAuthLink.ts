// Shared helper to build app-hosted auth links instead of exposing Supabase URLs.
// Resolves origin from (1) tenants.custom_domain, (2) tenant branding portal_url,
// (3) global app_url, (4) caller origin. When the origin came from the tenant's
// own custom_domain we set `isTenantOwnedDomain=true` so callers can drop the
// `/t/<slug>` URL prefix that platform-hosted tenants use.

export interface ResolvedAppOrigin {
  origin: string;
  isTenantOwnedDomain: boolean;
}

export async function resolveAppOriginDetailed(
  admin: any,
  tenantId: string | null,
  fallbackOrigin: string | null
): Promise<ResolvedAppOrigin | null> {
  if (tenantId) {
    // 1. Tenant's own custom domain
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("custom_domain")
      .eq("id", tenantId)
      .maybeSingle();
    const cd = tenantRow?.custom_domain;
    if (typeof cd === "string" && cd.trim()) {
      const normalised = normaliseCustomDomain(cd);
      if (normalised) return { origin: normalised, isTenantOwnedDomain: true };
    }

    // 2. Tenant-specific portal_url
    const { data } = await admin
      .from("tenant_settings")
      .select("setting_value")
      .eq("tenant_id", tenantId)
      .eq("category", "branding")
      .eq("setting_key", "portal_url")
      .maybeSingle();
    const v = data?.setting_value;
    if (typeof v === "string" && v.trim()) {
      const o = normaliseOrigin(v);
      if (o) return { origin: o, isTenantOwnedDomain: false };
    }
  }

  // 3. Global app_url
  const { data: globalRow } = await admin
    .from("tenant_settings")
    .select("setting_value")
    .is("tenant_id", null)
    .eq("category", "global")
    .eq("setting_key", "app_url")
    .maybeSingle();
  const gv = globalRow?.setting_value;
  if (typeof gv === "string" && gv.trim()) {
    const o = normaliseOrigin(gv);
    if (o) return { origin: o, isTenantOwnedDomain: false };
  }

  // 4. Caller origin (never the Supabase URL)
  if (fallbackOrigin) {
    try {
      return { origin: new URL(fallbackOrigin).origin, isTenantOwnedDomain: false };
    } catch {
      return null;
    }
  }
  return null;
}

// Backwards-compatible wrapper used by other functions.
export async function resolveAppOrigin(
  admin: any,
  tenantId: string | null,
  fallbackOrigin: string | null
): Promise<string | null> {
  const r = await resolveAppOriginDetailed(admin, tenantId, fallbackOrigin);
  return r?.origin ?? null;
}

function normaliseOrigin(s: string): string | null {
  try {
    return new URL(s.trim()).origin;
  } catch {
    return null;
  }
}

function normaliseCustomDomain(s: string): string | null {
  const cleaned = s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!cleaned) return null;
  try {
    return new URL(`https://${cleaned}`).origin;
  } catch {
    return null;
  }
}

/**
 * Build an app-hosted verification link from a Supabase generateLink result.
 * Uses hashed_token + verification_type so the user never sees the Supabase domain.
 */
export function buildAppVerifyLink(
  appOrigin: string,
  linkData: any,
  next: string = "/reset-password",
  slugPrefix?: string | null
): string | null {
  const props = linkData?.properties;
  const hashedToken = props?.hashed_token;
  const verificationType = props?.verification_type || "recovery";
  if (!hashedToken || !appOrigin) return null;

  const prefix = slugPrefix ? `/t/${slugPrefix}` : "";
  const nextWithPrefix = slugPrefix && next.startsWith("/") && !next.startsWith("/t/")
    ? `${prefix}${next}`
    : next;

  const u = new URL(`${appOrigin}${prefix}/auth/verify`);
  u.searchParams.set("token_hash", hashedToken);
  u.searchParams.set("type", verificationType);
  u.searchParams.set("next", nextWithPrefix);
  return u.toString();
}
