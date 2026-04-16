import { Navigate } from "react-router-dom";
import { getDefaultRoute, useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { buildAdminPath } from "@/lib/adminRouting";

export function AppEntryRedirect() {
  const { user, highestRole, loading } = useAuth();
  const { tenantId } = useTenantContext();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const defaultRoute = getDefaultRoute(highestRole);
  const targetRoute = defaultRoute.startsWith("/admin")
    ? buildAdminPath(defaultRoute, tenantId)
    : defaultRoute;

  return <Navigate to={targetRoute} replace />;
}