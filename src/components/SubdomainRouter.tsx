import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { useTenantFromHost } from "@/hooks/useTenantFromHost";
import { TenantSlugProvider } from "@/contexts/TenantSlugContext";

interface SubdomainState {
  matched: boolean;
  slug: string | null;
}

const SubdomainContext = createContext<SubdomainState>({ matched: false, slug: null });

export function useSubdomainTenant() {
  return useContext(SubdomainContext);
}

/**
 * Wraps the entire route tree. When a tenant subdomain is detected,
 * provides the slug via context so all customer components can build
 * paths without the /t/:slug prefix.
 */
export function SubdomainWrapper({ children }: { children: ReactNode }) {
  const { tenant, loading, matched } = useTenantFromHost();

  // Safety bail-out: if the host lookup is stuck for any reason, fall
  // through to path-based routing rather than show an infinite spinner
  // for the whole app. A single failed tenant fetch must never blank
  // every page.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading && !timedOut) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const state: SubdomainState = { matched: !!matched && !!tenant, slug: tenant?.slug ?? null };

  if (matched && tenant) {
    return (
      <SubdomainContext.Provider value={state}>
        <TenantSlugProvider slug={tenant.slug}>
          {children}
        </TenantSlugProvider>
      </SubdomainContext.Provider>
    );
  }

  return (
    <SubdomainContext.Provider value={state}>
      {children}
    </SubdomainContext.Provider>
  );
}
