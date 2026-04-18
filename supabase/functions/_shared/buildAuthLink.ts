// Shared helper to build app-hosted auth links instead of exposing Supabase URLs.
// Resolves origin from (1) tenant branding portal_url, (2) global app_url, (3) caller origin.

export async function resolveAppOrigin(
  admin: any,
  tenantId: string | null,
  fallbackOrigin: string | null
): Promise<string | null> {
  // 1. Tenant-specific portal_url
  if (tenantId) {
    const { data } = await admin
      .from("tenant_settings")
      .select("setting_value")
      .eq("tenant_id", tenantId)
      .eq("category", "branding")
      .eq("setting_key", "portal_url")
      .maybeSingle();
    const v = data?.setting_value;
    const url = typeof v === "string" ? v : (v && typeof v === "object" ? null : null);
    if (typeof v === "string" && v.trim()) return normaliseOrigin(v);
  }

  // 2. Global app_url
  const { data: globalRow } = await admin
    .from("tenant_settings")
    .select("setting_value")
    .is("tenant_id", null)
    .eq("category", "global")
    .eq("setting_key", "app_url")
    .maybeSingle();
  const gv = globalRow?.setting_value;
  if (typeof gv === "string" && gv.trim()) return normaliseOrigin(gv);

  // 3. Caller origin (never the Supabase URL)
  if (fallbackOrigin) {
    try {
      return new URL(fallbackOrigin).origin;
    } catch {
      return null;
    }
  }
  return null;
}

function normaliseOrigin(s: string): string | null {
  try {
    return new URL(s.trim()).origin;
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
  next: string = "/reset-password"
): string | null {
  const props = linkData?.properties;
  const hashedToken = props?.hashed_token;
  const verificationType = props?.verification_type || "recovery";
  if (!hashedToken || !appOrigin) return null;

  const u = new URL(`${appOrigin}/auth/verify`);
  u.searchParams.set("token_hash", hashedToken);
  u.searchParams.set("type", verificationType);
  u.searchParams.set("next", next);
  return u.toString();
}
