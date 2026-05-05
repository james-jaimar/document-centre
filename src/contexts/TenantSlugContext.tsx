import { createContext, type ReactNode } from "react";

/**
 * When a tenant is resolved from the hostname (subdomain routing),
 * this context provides the slug so that child components can build
 * tenant-relative paths without relying on the `:slug` URL param.
 */
export interface HostSlugValue {
  slug: string;
  /** true when the slug was resolved from the hostname, not the URL */
  isSubdomain: boolean;
}

export const TenantSlugContext = createContext<HostSlugValue | null>(null);

export function TenantSlugProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  return (
    <TenantSlugContext.Provider value={{ slug, isSubdomain: true }}>
      {children}
    </TenantSlugContext.Provider>
  );
}
