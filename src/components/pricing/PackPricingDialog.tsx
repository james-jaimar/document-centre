import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PackPricingMatrixEditor from "@/components/pricing/PackPricingMatrixEditor";
import {
  usePackPricingOverride,
  useUpsertPackPricingOverride,
  useDeletePackPricingOverride,
} from "@/hooks/useProductPackPricingOverrides";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: "tenant" | "branch";
  tenantId: string;
  branchId?: string | null;
  productFamilyId: string;
  productFamilyName: string;
}

export default function PackPricingDialog({
  open,
  onOpenChange,
  scope,
  tenantId,
  branchId = null,
  productFamilyId,
  productFamilyName,
}: Props) {
  // Master family — for parent ladder + allowed sizes
  const { data: family } = useQuery({
    queryKey: ["product_family_pack_source", productFamilyId],
    enabled: open && !!productFamilyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_families")
        .select("id, name, quantity_mode, quantity_blocks, printing_rules")
        .eq("id", productFamilyId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // For branch scope, also load the tenant-wide override (that's the parent)
  const { data: tenantOverride } = usePackPricingOverride(
    scope === "branch" ? productFamilyId : null,
    { tenantId, branchId: null },
  );

  const { data: scopeOverride, isLoading: scopeLoading } = usePackPricingOverride(
    open ? productFamilyId : null,
    { tenantId, branchId: scope === "branch" ? branchId : null },
  );

  const upsert = useUpsertPackPricingOverride();
  const remove = useDeletePackPricingOverride();

  const parentBlocks: QuantityBlock[] = useMemo(() => {
    if (scope === "branch") {
      if (tenantOverride?.quantity_blocks?.length) return tenantOverride.quantity_blocks;
    }
    const raw = family?.quantity_blocks;
    return Array.isArray(raw) ? (raw as QuantityBlock[]) : [];
  }, [scope, tenantOverride, family]);

  const allowedSizes: string[] = useMemo(() => {
    const pr = family?.printing_rules as any;
    return Array.isArray(pr?.allowed_finished_sizes) ? pr.allowed_finished_sizes : [];
  }, [family]);

  const initialBlocks: QuantityBlock[] = useMemo(
    () => (scopeOverride?.quantity_blocks ?? []) as QuantityBlock[],
    [scopeOverride],
  );

  const isBlocksFamily = family?.quantity_mode === "blocks";

  async function handleSave(blocks: QuantityBlock[]) {
    try {
      await upsert.mutateAsync({
        product_family_id: productFamilyId,
        tenant_id: tenantId,
        branch_id: scope === "branch" ? branchId ?? null : null,
        quantity_blocks: blocks,
      });
      toast({
        title: "Pack pricing saved",
        description:
          scope === "branch"
            ? "This branch will now use these pack prices."
            : "This tenant will now use these pack prices (branches can still override).",
      });
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    }
  }

  async function handleRevert() {
    if (!scopeOverride) return;
    try {
      await remove.mutateAsync(scopeOverride.id);
      toast({
        title: "Reverted to parent",
        description:
          scope === "branch"
            ? "This branch now inherits tenant / master pack pricing."
            : "This tenant now inherits master pack pricing.",
      });
    } catch (e: any) {
      toast({ title: "Could not revert", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] sm:w-[80vw] max-w-[90vw] sm:max-w-[80vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {productFamilyName} — Pack Pricing
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({scope === "branch" ? "branch override" : "tenant override"})
            </span>
          </DialogTitle>
          <DialogDescription>
            {scope === "branch"
              ? "Set pack prices for this branch. Leave empty to inherit from the tenant (or master if the tenant has no override)."
              : "Set tenant-wide pack prices. Individual branches can still override these in their own Pack Pricing view."}
          </DialogDescription>
        </DialogHeader>

        {!isBlocksFamily ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            This product family is sold with a free-number quantity spinner, not fixed
            pack sizes. No pack matrix to override.
          </p>
        ) : scopeLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : (
          <PackPricingMatrixEditor
            scope={scope}
            parentBlocks={parentBlocks}
            initialBlocks={initialBlocks}
            allowedSizeCodes={allowedSizes}
            saving={upsert.isPending}
            reverting={remove.isPending}
            onSave={handleSave}
            onRevertToParent={scopeOverride ? handleRevert : undefined}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
