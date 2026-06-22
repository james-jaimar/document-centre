import MasterCatalogPricingEditor from "@/components/pricing/MasterCatalogPricingEditor";
import RateCardEditor from "@/components/pricing/RateCardEditor";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card, CardContent } from "@/components/ui/card";
import {
  useClonePricingToBranch,
  useResyncBranchPricing,
} from "@/hooks/useRateCard";
import { toast } from "@/hooks/use-toast";

export default function BranchCatalogPricing() {
  const { tenantId, branchId } = useTenantContext();
  const clonePricing = useClonePricingToBranch();
  const resyncPricing = useResyncBranchPricing();

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

  async function handlePull() {
    try {
      await clonePricing.mutateAsync(branchId!);
      toast({ title: "Pulled missing rate-card rows from tenant" });
    } catch (e: any) {
      toast({ title: "Pull failed", description: e.message, variant: "destructive" });
    }
  }

  async function handleResync() {
    try {
      await resyncPricing.mutateAsync(branchId!);
      toast({ title: "Re-synced rate card from tenant" });
    } catch (e: any) {
      toast({ title: "Re-sync failed", description: e.message, variant: "destructive" });
    }
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
          description="Your branch's own copy of click charges, photo prints and business cards. 'Pull missing from tenant' adds new items without overwriting your prices; 'Re-sync from tenant' replaces everything."
          onPull={handlePull}
          pullPending={clonePricing.isPending}
          onResync={handleResync}
          resyncPending={resyncPricing.isPending}
        />
      </div>
    </div>
  );
}
