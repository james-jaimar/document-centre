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

/**
 * Returns true if the hostname is the platform/marketing host (or a local/preview
 * host that should behave like one). Any other hostname is treated as a tenant
 * host (custom domain or {slug}.document-centre.com) where the Document Centre
 * marketing landing must NEVER render.
 */
export function isPlatformHost(hostname: string): boolean {
  const h = hostname.replace(/^www\./, "");
  if (h === "document-centre.com") return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h.endsWith(".lovable.app")) return true;
  if (h.endsWith(".lovable.dev")) return true;
  if (h.endsWith(".lovableproject.com")) return true;
  if (h.endsWith(".jaimar.dev")) return true;
  return false;
}
