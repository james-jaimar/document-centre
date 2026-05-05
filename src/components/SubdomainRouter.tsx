import { type ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import { useTenantFromHost } from "@/hooks/useTenantFromHost";
import { TenantSlugProvider } from "@/contexts/TenantSlugContext";

interface SubdomainRouterProps {
  /** Customer portal routes to render at / when a subdomain matches */
  customerRoutes: ReactNode;
  /** All other routes (platform, admin, marketing, etc.) */
  children: ReactNode;
}

/**
 * Detects tenant subdomains (e.g. postnet.document-centre.com) and renders
 * customer portal routes at `/` instead of requiring `/t/:slug/` prefix.
 *
 * When no subdomain matches, falls through to the normal route tree.
 */
export function SubdomainRouter({ customerRoutes, children }: SubdomainRouterProps) {
  const { tenant, loading, matched } = useTenantFromHost();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Subdomain matched — render customer routes at root, wrapped in slug context
  if (matched && tenant) {
    return (
      <TenantSlugProvider slug={tenant.slug}>
        <Routes>
          {customerRoutes}
          {/* Also include non-customer routes so /auth, /auth/callback, etc. still work */}
          {children}
        </Routes>
      </TenantSlugProvider>
    );
  }

  // No subdomain — render all routes as normal
  return <Routes>{children}</Routes>;
}
