import { useMemo } from "react";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  useUpsertPackPricingOverride,
  useDeletePackPricingOverride,
  usePackPricingOverridesForFamily,
} from "@/hooks/useProductPackPricingOverrides";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  usePackPricingOverride,
  useUpsertPackPricingOverride,
  useDeletePackPricingOverride,
  usePackPricingOverridesForFamily,
} from "@/hooks/useProductPackPricingOverrides";
import PackPricingMatrixEditor from "@/components/pricing/PackPricingMatrixEditor";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

interface Props {
  tenantId: string;
  branchId: string;
}

export default function BranchPackPricingEditor({ tenantId, branchId }: Props) {
  const { data: families = [], isLoading } = useProductFamilies(null, { masterOnly: true });
  const blocksFamilies = useMemo(
    () => families.filter((f) => (f as any).quantity_mode === "blocks"),
    [families],
  );

  if (isLoading) return <p className="text-sm text-muted-foreground py-6">Loading pack pricing…</p>;
  if (blocksFamilies.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No pack-priced products available yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Pack Pricing</h2>
        <p className="text-sm text-muted-foreground">
          Override pack ladders for this branch. Leave a family alone to keep inheriting tenant / master prices.
        </p>
      </div>
      <Accordion type="single" collapsible className="space-y-2">
        {blocksFamilies.map((family) => (
          <BranchFamilyRow
            key={family.id}
            tenantId={tenantId}
            branchId={branchId}
            familyId={family.id}
            familyName={family.name}
            masterBlocks={((family as any).quantity_blocks ?? []) as QuantityBlock[]}
            allowedSizes={
              Array.isArray(((family as any).printing_rules ?? {}).allowed_finished_sizes)
                ? ((family as any).printing_rules ?? {}).allowed_finished_sizes
                : []
            }
          />
        ))}
      </Accordion>
    </div>
  );
}

function BranchFamilyRow({
  tenantId,
  branchId,
  familyId,
  familyName,
  masterBlocks,
  allowedSizes,
}: {
  tenantId: string;
  branchId: string;
  familyId: string;
  familyName: string;
  masterBlocks: QuantityBlock[];
  allowedSizes: string[];
}) {
  const { data: allOverrides = [] } = usePackPricingOverridesForFamily(familyId, tenantId);
  const tenantOverride = allOverrides.find((o) => o.branch_id === null) ?? null;
  const branchOverride = allOverrides.find((o) => o.branch_id === branchId) ?? null;
  const upsert = useUpsertPackPricingOverride();
  const remove = useDeletePackPricingOverride();

  const parentBlocks = tenantOverride?.quantity_blocks?.length
    ? tenantOverride.quantity_blocks
    : masterBlocks;

  const initialBlocks = (branchOverride?.quantity_blocks ?? []) as QuantityBlock[];

  async function handleSave(blocks: QuantityBlock[]) {
    try {
      await upsert.mutateAsync({
        product_family_id: familyId,
        tenant_id: tenantId,
        branch_id: branchId,
        quantity_blocks: blocks,
      });
      toast({ title: "Branch pack pricing saved", description: `${familyName} — branch override active.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function handleRevert() {
    if (!branchOverride) return;
    try {
      await remove.mutateAsync(branchOverride.id);
      toast({ title: "Reverted", description: `${familyName} now inherits tenant / master pack prices.` });
    } catch (e: any) {
      toast({ title: "Revert failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <AccordionItem value={familyId} className="border rounded-lg">
      <AccordionTrigger className="px-4 hover:no-underline">
        <div className="flex items-center gap-3 flex-1">
          <span className="font-medium">{familyName}</span>
          {branchOverride ? (
            <Badge variant="secondary" className="text-[10px]">Branch override</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">Inheriting</Badge>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <PackPricingMatrixEditor
          scope="branch"
          parentBlocks={parentBlocks}
          initialBlocks={initialBlocks}
          allowedSizeCodes={allowedSizes}
          saving={upsert.isPending}
          reverting={remove.isPending}
          onSave={handleSave}
          onRevertToParent={branchOverride ? handleRevert : undefined}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
