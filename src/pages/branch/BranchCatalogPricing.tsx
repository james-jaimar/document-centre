import MasterCatalogPricingEditor from "@/components/pricing/MasterCatalogPricingEditor";
import RateCardEditor from "@/components/pricing/RateCardEditor";
import BranchPackPricingEditor from "@/components/pricing/BranchPackPricingEditor";
import BranchPricingIO from "@/components/pricing/BranchPricingIO";
import BranchVariantPricingSection from "@/components/pricing/BranchVariantPricingSection";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import {
  useClonePricingToBranch,
  useResyncBranchPricing,
} from "@/hooks/useRateCard";
import { toast } from "@/hooks/use-toast";
import { useBranchOnboarding } from "@/hooks/useBranchOnboarding";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export default function BranchCatalogPricing() {
  const { tenantId, branchId } = useTenantContext();
  const clonePricing = useClonePricingToBranch();
  const resyncPricing = useResyncBranchPricing();
  const { data: onboarding } = useBranchOnboarding(branchId ?? undefined);
  const qc = useQueryClient();
  const [marking, setMarking] = useState(false);

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

  async function handleMarkReviewed() {
    if (!branchId) return;
    setMarking(true);
    try {
      const { error } = await (supabase as any).rpc("mark_branch_pricing_reviewed", { _branch_id: branchId });
      if (error) throw error;
      toast({ title: "Prices marked as reviewed", description: "Onboarding checklist updated." });
      qc.invalidateQueries({ queryKey: ["branch_onboarding"] });
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="p-6 space-y-8">
      <BranchPricingIO branchId={branchId} />

      {onboarding && !onboarding.pricing_reviewed && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="text-sm">
              <p className="font-medium">Confirm your branch pricing</p>
              <p className="text-muted-foreground">
                Review the prices below. When you're happy (either as-is from the master catalogue or with your own adjustments), mark them reviewed to clear this onboarding step.
              </p>
            </div>
            <Button onClick={handleMarkReviewed} disabled={marking} className="shrink-0">
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {marking ? "Saving…" : "Mark prices reviewed"}
            </Button>
          </CardContent>
        </Card>
      )}

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

      <div className="border-t border-border pt-6">
        <BranchVariantPricingSection tenantId={tenantId} branchId={branchId} />
      </div>

      <div className="border-t border-border pt-6">
        <BranchPackPricingEditor tenantId={tenantId} branchId={branchId} />
      </div>
    </div>
  );
}
