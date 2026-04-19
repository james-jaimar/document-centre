import { Navigate } from "react-router-dom";
import { getDefaultRoute, useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { buildAdminPath } from "@/lib/adminRouting";
import MarketingLanding from "@/pages/MarketingLanding";

export function AppEntryRedirect() {
  const { user, highestRole, loading, rolesLoaded } = useAuth();
  const { tenantId, loading: tenantLoading } = useTenantContext();

  const defaultRoute = getDefaultRoute(highestRole);

  // Wait for roles to resolve before deciding — otherwise a platform admin can
  // briefly look role-less and get sent to /dashboard.
  if (loading || (user && !rolesLoaded) || (user && defaultRoute.startsWith("/admin") && tenantLoading)) {
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

  const targetRoute = defaultRoute.startsWith("/admin")
    ? buildAdminPath(defaultRoute, tenantId)
    : defaultRoute;

  return <Navigate to={targetRoute} replace />;
}