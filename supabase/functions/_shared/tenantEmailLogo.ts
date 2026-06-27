// Resolves a clean, app-domain-hosted logo URL for use inside email HTML.
//
// Email clients (Outlook in particular) expose the raw <img src=...> string
// in the "preview" column of the inbox list when a preheader is missing.
// Even with a proper preheader, the URL is still visible whenever a user
// inspects message source / forwards as text. We therefore never embed a
// Supabase Storage URL directly — instead we route through our own app
// origin so the URL reads as e.g.
//   https://document-centre.com/logo/<tenant-id>.png
//
// That path is fronted by the public `tenant-logo` edge function, which
// streams the underlying image with long cache headers. See
// supabase/functions/tenant-logo/index.ts.
//
// The public origin used for the URL is, in order of preference:
//   1. PLATFORM_PUBLIC_ORIGIN env var
//   2. Global tenant_settings `app_url` (category=global)
//   3. https://document-centre.com (hard-coded last-resort default)

const DEFAULT_ORIGIN = "https://document-centre.com";

export async function resolvePlatformLogoOrigin(admin: any): Promise<string> {
  const env = (Deno.env.get("PLATFORM_PUBLIC_ORIGIN") ?? "").trim();
  if (env) {
    try { return new URL(env).origin; } catch { /* fall through */ }
  }
  try {
    const { data } = await admin
      .from("tenant_settings")
      .select("setting_value")
      .is("tenant_id", null)
      .eq("category", "global")
      .eq("setting_key", "app_url")
      .maybeSingle();
    const v = data?.setting_value;
    if (typeof v === "string" && v.trim()) {
      return new URL(v.trim()).origin;
    }
  } catch { /* ignore */ }
  return DEFAULT_ORIGIN;
}

/**
 * Build the email-safe logo URL for a tenant. Returns null if the tenant
 * has no logo configured (caller should fall back to portal name text).
 *
 * `brandMap` is the resolved tenant_settings branding map (key→value).
 * If neither `email_logo_url` nor `logo_url` is set, returns null.
 */
export async function buildEmailLogoUrl(
  admin: any,
  tenantId: string,
  brandMap: Record<string, unknown>,
): Promise<string | null> {
  const hasLogo =
    (typeof brandMap.email_logo_url === "string" && brandMap.email_logo_url) ||
    (typeof brandMap.logo_url === "string" && brandMap.logo_url);
  if (!hasLogo) return null;

  const origin = await resolvePlatformLogoOrigin(admin);
  // .png extension is purely cosmetic — the edge function reports the real
  // Content-Type from the underlying stored file. Email clients are happy
  // with whatever Content-Type comes back.
  return `${origin}/logo/${encodeURIComponent(tenantId)}.png`;
}
