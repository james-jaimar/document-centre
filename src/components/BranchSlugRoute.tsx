import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useBranch } from "@/contexts/BranchContext";
import StoreNotAvailable from "@/components/StoreNotAvailable";
import StorefrontEntitlementGuard from "@/components/customer/StorefrontEntitlementGuard";

/**
 * Wrapper for routes nested under `:branchSlug`. Resolves the slug to a
 * branch in the current tenant. If valid + live, sets it as the active
 * branch and renders children (through the entitlement guard). Otherwise
 * shows the friendly fallback.
 */
export default function BranchSlugRoute() {
  const { branchSlug } = useParams<{ branchSlug: string }>();
  const { setUrlBranchSlug, findBranchBySlug, loading } = useBranch();

  useEffect(() => {
    setUrlBranchSlug(branchSlug ?? null);
    return () => setUrlBranchSlug(null);
  }, [branchSlug, setUrlBranchSlug]);

  if (loading || !branchSlug) {
    return <StorefrontEntitlementGuard />;
  }

  const branch = findBranchBySlug(branchSlug);

  // No branch with this slug, OR branch exists but isn't live yet → fallback
  if (!branch || !branch.is_live) {
    return <StoreNotAvailable slug={branchSlug} />;
  }

  return <StorefrontEntitlementGuard />;
}
