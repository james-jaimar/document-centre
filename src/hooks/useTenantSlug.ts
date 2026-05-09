import { useContext } from "react";
import { useParams } from "react-router-dom";
import { TenantSlugContext } from "@/contexts/TenantSlugContext";
import { useBranch, branchUrlSlug } from "@/contexts/BranchContext";

/**
 * Returns the effective tenant slug — from hostname context (subdomain)
 * or from the `:slug` URL param (path-based routing).
 *
 * Also provides `tenantPath(path)` to build correct links — when an active
 * branch is set, paths automatically include the branch URL slug:
 *   /t/postnet/sandtoncity/orders/new   (path-based)
 *   /sandtoncity/orders/new             (subdomain)
 */
export function useTenantSlug() {
  const ctx = useContext(TenantSlugContext);
  const { slug: paramSlug } = useParams<{ slug: string }>();
  const { activeBranch } = useBranch();

  const slug = ctx?.slug ?? paramSlug ?? "";
  const isSubdomain = !!ctx?.isSubdomain;
  const branchSeg = activeBranch ? branchUrlSlug(activeBranch) : "";

  /** Build a tenant- and branch-relative path. */
  const tenantPath = (path: string) => {
    const clean = path.replace(/^\//, "");
    const branchPrefix = branchSeg ? `${branchSeg}/` : "";
    if (isSubdomain) {
      return `/${branchPrefix}${clean}`.replace(/\/$/, "") || "/";
    }
    return `/t/${slug}/${branchPrefix}${clean}`.replace(/\/$/, "");
  };

  return { slug, isSubdomain, tenantPath, activeBranchSlug: branchSeg || null };
}
