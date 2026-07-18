import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranchSubscriptionGate } from "@/hooks/useBranchSubscriptions";

/**
 * Hard-stop for restricted / cancelled branches on the branch admin portal.
 * When the entitlement gate is in `billingOnly` mode, every non-billing
 * route redirects to /branch/settings?tab=subscription so the branch admin
 * can only reactivate their subscription.
 *
 * The banner in BranchLayout continues to explain the state; this guard
 * enforces it.
 */
const BILLING_ALLOWED_PATH_PREFIXES = [
  "/branch/settings",
  "/branch/logout",
];

export default function BranchAdminBillingOnlyGuard() {
  const { branchId } = useTenantContext();
  const gate = useBranchSubscriptionGate(branchId);
  const location = useLocation();

  if (!branchId || gate.loading || !gate.billingOnly) {
    return <Outlet />;
  }

  const path = location.pathname;
  const allowed = BILLING_ALLOWED_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
  // Settings is reached without a tab — send them to the subscription tab.
  if (allowed) return <Outlet />;

  return <Navigate to="/branch/settings?tab=subscription" replace />;
}
