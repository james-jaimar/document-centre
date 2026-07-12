import MasterCatalogPricingEditor from "@/components/pricing/MasterCatalogPricingEditor";
import RateCardEditor from "@/components/pricing/RateCardEditor";
import MasterPackPricingEditor from "@/components/pricing/MasterPackPricingEditor";

export default function PlatformMasterPricing() {
  return (
    <div className="p-6 space-y-8">
      <MasterCatalogPricingEditor />

      <div className="border-t border-border pt-6">
        <RateCardEditor
          scope="master"
          title="Click Charges, Photo Prints & Business Cards"
          description="Per-click colour/mono rates and the standalone Photo Print and Business Card products. These still live on the rate-card tables — paper stocks and finishing items have moved to the catalogue editor above."
        />
      </div>

      <div className="border-t border-border pt-6">
        <MasterPackPricingEditor />
      </div>
    </div>
  );
}
