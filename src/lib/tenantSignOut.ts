import { isTenantOwnHost } from "@/lib/tenantUrl";
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
 * Normalise a URL so it always has a protocol.
 */
export function normaliseExternalUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const trimmed = u.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Resolve the in-app path the customer should land on after signing out
 * of a tenant portal. We deliberately keep them inside the Print Centre
 * rather than kicking them out to the brand's public website — a small
 * "Back to main site" link in the footer handles that case instead.
 */
export function resolvePostSignOutPath(slug: string | null | undefined): string {
  // On a tenant-owned host the tenant is implied by the domain — never emit
  // the platform's /t/{slug} prefix there.
  if (isTenantOwnHost()) return "/";
  if (!slug) return "/";
  return `/t/${slug}`;
}

