import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTenantFromHost } from "@/hooks/useTenantFromHost";
import { TenantSlugProvider } from "@/contexts/TenantSlugContext";
import { isPlatformHost, stripTenantPrefix } from "@/lib/tenantUrl";

/**
 * On a tenant-owned host, `/t/{slug}/...` URLs are rogue duplicates of the
 * clean paths. Rewrite them in place so the address bar (and any bookmark
 * that gets made from it) stays on the tenant's own URL shape.
 */
function TenantUrlNormaliser({ slug }: { slug: string }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isPlatformHost(window.location.hostname)) return;
    if (!/^\/t\/[^/]+/.test(location.pathname)) return;
    const next = stripTenantPrefix(location.pathname, slug);
    if (next === location.pathname) return;
    navigate(`${next}${location.search}${location.hash}`, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate, slug]);

  return null;
}


interface SubdomainState {
  matched: boolean;
  slug: string | null;
  tenantId: string | null;
  name: string | null;
}

const SubdomainContext = createContext<SubdomainState>({
  matched: false,
  slug: null,
  tenantId: null,
  name: null,
});

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
  const platformHost =
    typeof window !== "undefined" ? isPlatformHost(window.location.hostname) : true;

  // Safety bail-out: ONLY for the platform host. On a tenant host (custom
  // domain or {slug}.document-centre.com) we must never fall through to
  // the marketing route tree — that would render Document Centre branding
  // on someone else's domain. Keep the spinner / loading state until the
  // lookup actually resolves.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!loading || !platformHost) return;
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [loading, platformHost]);

  if (loading && (platformHost ? !timedOut : true)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Tenant host where lookup finished but produced no match — show a neutral
  // "loading storefront" panel and retry via reload. Never the marketing site.
  if (!platformHost && !matched) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">
          Loading storefront… if this persists, please refresh the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Retry
        </button>
      </div>
    );
  }

  const state: SubdomainState = {
    matched: !!matched && !!tenant,
    slug: tenant?.slug ?? null,
    tenantId: tenant?.id ?? null,
    name: tenant?.name ?? null,
  };

  if (matched && tenant) {
    return (
      <SubdomainContext.Provider value={state}>
        <TenantSlugProvider slug={tenant.slug}>
          <TenantUrlNormaliser slug={tenant.slug} />
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
