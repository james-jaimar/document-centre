/**
 * Shared tenant sign-out helpers.
 *
 * After signing out on a tenant portal we set a short-lived sessionStorage
 * flag so the anonymous-session bootstrap in CustomerLayout does NOT
 * immediately recreate a session.
 */

const SIGNOUT_FLAG_PREFIX = "tenant_signed_out_";

export function setTenantSignOutFlag(slug: string) {
  try {
    sessionStorage.setItem(`${SIGNOUT_FLAG_PREFIX}${slug}`, Date.now().toString());
  } catch {
    // private browsing — ignore
  }
}

export function hasTenantSignOutFlag(slug: string): boolean {
  try {
    const ts = sessionStorage.getItem(`${SIGNOUT_FLAG_PREFIX}${slug}`);
    if (!ts) return false;
    // Suppress for 30 seconds after sign-out
    if (Date.now() - Number(ts) < 30_000) return true;
    sessionStorage.removeItem(`${SIGNOUT_FLAG_PREFIX}${slug}`);
    return false;
  } catch {
    return false;
  }
}

export function clearTenantSignOutFlag(slug: string) {
  try {
    sessionStorage.removeItem(`${SIGNOUT_FLAG_PREFIX}${slug}`);
  } catch {
    // ignore
  }
}

/**
 * Check whether the current Supabase user is anonymous.
 */
export function isAnonymousUser(user: { is_anonymous?: boolean } | null): boolean {
  return !!(user as any)?.is_anonymous;
}

/**
 * Resolve the URL the customer should land on after signing out of a
 * tenant portal. Priority:
 *   1. Active branch's `website_url` (the branch's real public web page)
 *   2. Tenant-level `branding.origin_url` (franchisor / brand site)
 *   3. Current window origin (stay on the same host — never kick to document-centre.com)
 */
export function resolvePostSignOutUrl(
  activeBranchWebsite: string | null | undefined,
  tenantOrigin: string | null | undefined,
): string {
  const normalise = (u: string | null | undefined): string | null => {
    if (!u) return null;
    const trimmed = u.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };
  return (
    normalise(activeBranchWebsite) ||
    normalise(tenantOrigin) ||
    (typeof window !== "undefined" ? window.location.origin : "/")
  );
}
