// Branch portal role gating.
//
// Two-tier model:
//   - Branch Manager (and tenant owner/admin acting in branch context):
//       Owns the shop. Manages branch settings, branch users, payment
//       gateway credentials, billing and subscription.
//   - Store Operator:
//       Runs the day. Handles orders, customers, quotes, products,
//       delivery, refunds, cancellations, manual discounts and
//       fulfillment changes. Locked out of the four manager-only areas.

export type BranchPortalRole =
  | "owner"
  | "admin"
  | "branch_manager"
  | "store_operator"
  | string
  | null
  | undefined;

const MANAGER_ROLES = new Set(["owner", "admin", "branch_manager"]);

/** True when the role acts as branch manager (incl. tenant owner/admin). */
export function isBranchManagerRole(role: BranchPortalRole): boolean {
  return !!role && MANAGER_ROLES.has(role);
}

/** Pretty label for the staff role badge. */
export function branchRoleLabel(role: BranchPortalRole): string {
  switch (role) {
    case "branch_manager":
      return "Branch Manager";
    case "store_operator":
      return "Store Operator";
    case "owner":
      return "Owner";
    case "admin":
      return "Tenant Admin";
    default:
      return role ?? "Staff";
  }
}
