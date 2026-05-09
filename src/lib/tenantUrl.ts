/**
 * Pure URL helpers for parsing/building tenant + branch paths.
 * Used by redirect code that runs before BranchContext is available
 * (ProtectedRoute, AuthCallback, Auth, landingRoute).
 *
 * Reserved-word guard mirrors the DB trigger `validate_branch_url_slug`,
 * so paths like `/t/postnet/orders/123` aren't mis-parsed as branch="orders".
 */

const RESERVED_BRANCH_SEGMENTS = new Set([
  "auth",
  "dashboard",
  "print-centre",
  "orders",
  "cart",
  "checkout",
  "account",
  "settings",
  "terms",
  "privacy",
  "upload",
]);

export interface ParsedTenantPath {
  slug: string | null;
  branchSlug: string | null;
}

export function parseTenantPath(pathname: string): ParsedTenantPath {
  const m = pathname.match(/^\/t\/([^/]+)(?:\/([^/]+))?/);
  if (!m) return { slug: null, branchSlug: null };
  const second = m[2] && !RESERVED_BRANCH_SEGMENTS.has(m[2]) ? m[2] : null;
  return { slug: m[1], branchSlug: second };
}

export function buildTenantPath(
  slug: string,
  branchSlug: string | null,
  rest: string,
): string {
  const branch = branchSlug ? `${branchSlug}/` : "";
  const clean = rest.replace(/^\//, "");
  return `/t/${slug}/${branch}${clean}`.replace(/\/$/, "");
}
