import { useTenantContext } from "@/hooks/useTenantContext";
import { useStorefrontPages } from "@/hooks/useStorefrontPages";
import CustomerDashboard from "@/pages/dashboard/CustomerDashboard";
import StorefrontHome from "@/pages/storefront/StorefrontHome";

/**
 * Tenant home. Renders the ecommerce landing page when the platform admin
 * has enabled custom storefront pages for this tenant, otherwise falls back
 * to the standard customer dashboard.
 */
export default function StorefrontIndex() {
  const { tenantId } = useTenantContext();
  const { isPageEnabled, isLoading } = useStorefrontPages(tenantId);

  if (tenantId && isLoading) return null;
  return isPageEnabled("landing") ? <StorefrontHome /> : <CustomerDashboard />;
}
