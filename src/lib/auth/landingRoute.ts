// Membership-aware landing route resolution.
// Tenant admins/staff should land in /admin (with tenant override),
// branch staff in /branch, and customers in the storefront.

import { buildAdminPath } from "@/lib/adminRouting";

export type MembershipRole =
  | "owner"
  | "admin"
  | "sales"
  | "production"
  | "accounts"
  | "branch_manager"
  | "store_operator"
  | "customer"
  | string;

export interface LandingMembership {
  tenant_id: string;
  role: MembershipRole;
  branch_id?: string | null;
  tenants?: { slug: string | null; name?: string | null } | null;
}

const STAFF_ROLES = new Set(["owner", "admin", "sales", "production", "accounts"]);
const BRANCH_ROLES = new Set(["branch_manager", "store_operator"]);

/**
 * Decide where to send a user after sign-in based on their membership for
 * a given tenant slug. If `slug` is null, picks a sensible default from the
 * highest-priority membership.
 */
export function resolveTenantLanding(
  membership: LandingMembership,
  slug: string | null
): string {
  const role = membership.role;
  const targetSlug = slug ?? membership.tenants?.slug ?? null;

  if (BRANCH_ROLES.has(role)) {
    return "/branch";
  }
  if (STAFF_ROLES.has(role)) {
    // Tenant admin console, scoped via ?tenant=
    return buildAdminPath("/admin", membership.tenant_id);
  }
  // Default: customer storefront
  if (targetSlug) return `/t/${targetSlug}/dashboard`;
  return "/dashboard";
}

const ROLE_PRIORITY: MembershipRole[] = [
  "owner",
  "admin",
  "sales",
  "production",
  "accounts",
  "branch_manager",
  "store_operator",
  "customer",
];

export function pickPrimaryMembership(
  list: LandingMembership[],
  slug: string | null
): LandingMembership | null {
  if (list.length === 0) return null;
  const scoped = slug
    ? list.filter((m) => m.tenants?.slug === slug)
    : list;
  const pool = scoped.length ? scoped : list;
  const sorted = [...pool].sort(
    (a, b) =>
      ROLE_PRIORITY.indexOf(a.role as MembershipRole) -
      ROLE_PRIORITY.indexOf(b.role as MembershipRole)
  );
  return sorted[0] ?? null;
}
