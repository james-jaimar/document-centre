import { useContext } from "react";
import { useParams } from "react-router-dom";
import { TenantSlugContext } from "@/contexts/TenantSlugContext";

/**
 * Returns the effective tenant slug — from hostname context (subdomain)
 * or from the `:slug` URL param (path-based routing).
 *
 * Also provides `tenantPath(path)` to build correct links regardless
 * of which routing mode is active.
 */
export function useTenantSlug() {
  const ctx = useContext(TenantSlugContext);
  const { slug: paramSlug } = useParams<{ slug: string }>();

  const slug = ctx?.slug ?? paramSlug ?? "";
  const isSubdomain = !!ctx?.isSubdomain;

  /** Build a tenant-relative path: `/orders` on subdomain, `/t/slug/orders` on path-based */
  const tenantPath = (path: string) => {
    const clean = path.replace(/^\//, "");
    return isSubdomain ? `/${clean}` : `/t/${slug}/${clean}`;
  };

  return { slug, isSubdomain, tenantPath };
}
