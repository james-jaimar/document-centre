import MasterCatalogPricingEditor from "@/components/pricing/MasterCatalogPricingEditor";
import RateCardEditor from "@/components/pricing/RateCardEditor";
import { useTenantContext } from "@/hooks/useTenantContext";

export default function AdminCatalogPricing() {
  const { tenantId } = useTenantContext();

  if (!tenantId) {
    return <div className="p-6 text-sm text-muted-foreground">No active tenant.</div>;
  }

  return (
    <div className="p-6 space-y-8">
      <MasterCatalogPricingEditor scope="tenant" tenantId={tenantId} />

      <div className="border-t border-border pt-6">
        <RateCardEditor
          scope="tenant"
          tenantId={tenantId}
          title="Click Charges, Photo Prints & Business Cards"
          description="Your tenant rate card for click charges, photo prints and business cards. Use 'Pull missing from master' to bring in any new items the platform has added."
        />
      </div>
    </div>
  );
}
