import { useTenantContext } from "@/hooks/useTenantContext";
import { useStorefrontPages } from "@/hooks/useStorefrontPages";
import { useTenantSlug } from "@/hooks/useTenantSlug";

/**
 * Nav targets that respect per-tenant ecommerce storefront pages.
 *
 * "Home" always points at the tenant index route, which renders the
 * ecommerce landing when the platform admin has enabled storefront pages
 * and the classic Print Centre dashboard otherwise. That keeps a single
 * link correct for both kinds of tenant.
 */
export function useStorefrontNav() {
  const { tenantId } = useTenantContext();
  const { isPageEnabled } = useStorefrontPages(tenantId);
  const { tenantPath } = useTenantSlug();

  return {
    /** Tenant index — storefront landing or Print Centre dashboard. */
    homePath: tenantPath(""),
    shopPath: tenantPath("shop"),
    landingEnabled: isPageEnabled("landing"),
    shopEnabled: isPageEnabled("shop"),
  };
}
