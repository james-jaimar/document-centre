import MasterCatalogPricingEditor from "@/components/pricing/MasterCatalogPricingEditor";
import RateCardEditor from "@/components/pricing/RateCardEditor";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card, CardContent } from "@/components/ui/card";

export default function BranchCatalogPricing() {
  const { tenantId, branchId } = useTenantContext();

  if (!tenantId) {
    return <div className="p-6 text-sm text-muted-foreground">No active tenant.</div>;
  }
  if (!branchId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            You aren't assigned to a branch yet — branch pricing isn't available.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <MasterCatalogPricingEditor scope="branch" tenantId={tenantId} branchId={branchId} />

      <div className="border-t border-border pt-6">
        <RateCardEditor
          scope="branch"
          tenantId={tenantId}
          branchId={branchId}
          title="Click Charges, Photo Prints & Business Cards"
          description="Your branch's own copy of click charges, photo prints and business cards. Edit any line to set your branch-specific price."
        />
      </div>
    </div>
  );
}
