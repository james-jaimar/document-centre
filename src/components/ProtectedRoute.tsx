import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, roles, loading } = useAuth();
  const location = useLocation();

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

  // Extract tenant slug from current path for context-aware redirects
  const slugMatch = location.pathname.match(/^\/t\/([^/]+)/);
  const fallback = slugMatch ? `/t/${slugMatch[1]}/dashboard` : "/dashboard";

  if (!user) {
    const authPath = slugMatch ? `/t/${slugMatch[1]}/auth` : "/auth";
    return <Navigate to={authPath} replace />;
  }

  if (allowedRoles && !allowedRoles.some((r) => roles.includes(r))) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
