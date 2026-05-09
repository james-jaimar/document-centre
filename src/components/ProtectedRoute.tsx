import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { parseTenantPath, buildTenantPath } from "@/lib/tenantUrl";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  /** Optional tenant_memberships.role values that also grant access */
  allowedMembershipRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles, allowedMembershipRoles }: ProtectedRouteProps) {
  const { user, roles, loading } = useAuth();
  const { memberships, loading: tenantLoading } = useTenantContext();
  const location = useLocation();

  if (loading || tenantLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const slugMatch = location.pathname.match(/^\/t\/([^/]+)/);
  const fallback = slugMatch ? `/t/${slugMatch[1]}/dashboard` : "/dashboard";

  if (!user) {
    const authPath = slugMatch ? `/t/${slugMatch[1]}/auth` : "/auth";
    return <Navigate to={authPath} replace />;
  }

  const hasAppRole = allowedRoles ? allowedRoles.some((r) => roles.includes(r)) : false;
  const hasMembershipRole = allowedMembershipRoles
    ? memberships.some((m) => m.is_active && allowedMembershipRoles.includes(m.role))
    : false;

  if ((allowedRoles || allowedMembershipRoles) && !hasAppRole && !hasMembershipRole) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
