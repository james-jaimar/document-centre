import { type ReactNode } from "react";
import { useTenantFromHost } from "@/hooks/useTenantFromHost";
import { TenantSlugProvider } from "@/contexts/TenantSlugContext";

/**
 * Wraps the entire route tree. When a tenant subdomain is detected,
 * provides the slug via context so all customer components can build
 * paths without the /t/:slug prefix.
 */
export function SubdomainWrapper({ children }: { children: ReactNode }) {
  const { tenant, loading, matched } = useTenantFromHost();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (matched && tenant) {
    return (
      <TenantSlugProvider slug={tenant.slug}>
        {children}
      </TenantSlugProvider>
    );
  }

  return <>{children}</>;
}
