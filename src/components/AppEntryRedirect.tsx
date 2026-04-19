import { Navigate } from "react-router-dom";
import { getDefaultRoute, useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { buildAdminPath } from "@/lib/adminRouting";
import MarketingLanding from "@/pages/MarketingLanding";

export function AppEntryRedirect() {
  const { user, highestRole, loading, rolesLoaded } = useAuth();
  const { tenantId, memberships, loading: tenantLoading } = useTenantContext();

  // Wait for roles AND memberships to resolve before deciding — otherwise a
  // tenant admin can briefly look role-less and get sent to /dashboard.
  if (loading || (user && !rolesLoaded) || (user && tenantLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated visitors land on the public marketing site
  if (!user) {
    return <MarketingLanding />;
  }

  // Platform admin: always /platform.
  if (highestRole === "platform_admin") {
    return <Navigate to="/platform" replace />;
  }

  // Membership-based routing for tenant users.
  const STAFF = new Set(["owner", "admin", "sales", "production", "accounts"]);
  const BRANCH = new Set(["branch_manager", "store_operator"]);

  // Prefer staff role if user has one; then branch; then customer.
  const staffMembership = memberships.find((m) => m.is_active && STAFF.has(m.role));
  const branchMembership = memberships.find((m) => m.is_active && BRANCH.has(m.role));
  const customerMembership = memberships.find((m) => m.is_active && m.role === "customer");

  if (staffMembership) {
    return <Navigate to={buildAdminPath("/admin", staffMembership.tenant_id)} replace />;
  }
  if (branchMembership) {
    return <Navigate to="/branch" replace />;
  }
  if (customerMembership) {
    // Fallback to legacy /dashboard which redirects to the slug-based storefront.
    return <Navigate to="/dashboard" replace />;
  }

  // Legacy app-role fallback (e.g. orphan customers via user_roles only).
  const defaultRoute = getDefaultRoute(highestRole);
  const targetRoute = defaultRoute.startsWith("/admin")
    ? buildAdminPath(defaultRoute, tenantId)
    : defaultRoute;
  return <Navigate to={targetRoute} replace />;
}
