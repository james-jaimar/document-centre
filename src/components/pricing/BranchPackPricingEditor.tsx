import { useMemo } from "react";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  useUpsertPackPricingOverride,
  useDeletePackPricingOverride,
  usePackPricingOverridesForFamily,
} from "@/hooks/useProductPackPricingOverrides";
import PackPricingMatrixEditor from "@/components/pricing/PackPricingMatrixEditor";
import FamilyPricingOptionsEditor from "@/components/pricing/FamilyPricingOptionsEditor";
import { normalizeAddons, normalizeOptions, type PricingAddon, type PricingOption } from "@/lib/pricing/packOptions";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { mergePackBlockScope } from "@/lib/storefront/catalogue";

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
        <p className="text-xs text-muted-foreground mt-1">Pack prices are entered <strong>ex VAT</strong>.</p>
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
            pricingOptions={normalizeOptions((family as any).pricing_options)}
            masterAddons={normalizeAddons((family as any).pricing_addons)}
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
  pricingOptions,
  masterAddons,
}: {
  tenantId: string;
  branchId: string;
  familyId: string;
  familyName: string;
  masterBlocks: QuantityBlock[];
  allowedSizes: string[];
  pricingOptions: PricingOption[];
  masterAddons: PricingAddon[];
}) {
  const { data: allOverrides = [] } = usePackPricingOverridesForFamily(familyId, tenantId);
  const tenantOverride = allOverrides.find((o) => o.branch_id === null) ?? null;
  const branchOverride = allOverrides.find((o) => o.branch_id === branchId) ?? null;
  const upsert = useUpsertPackPricingOverride();
  const remove = useDeletePackPricingOverride();

  const parentBlocks = mergePackBlockScope(masterBlocks, tenantOverride?.quantity_blocks);

  const initialBlocks = (branchOverride?.quantity_blocks ?? []) as QuantityBlock[];

  const branchAddons = Array.isArray(branchOverride?.pricing_addons)
    ? normalizeAddons(branchOverride!.pricing_addons)
    : null;
  const tenantAddons = Array.isArray(tenantOverride?.pricing_addons)
    ? normalizeAddons(tenantOverride!.pricing_addons)
    : null;
  const addons = branchAddons ?? tenantAddons ?? masterAddons;

  async function handleSaveAddons(next: PricingAddon[]) {
    try {
      await upsert.mutateAsync({
        product_family_id: familyId,
        tenant_id: tenantId,
        branch_id: branchId,
        pricing_addons: next,
      });
      toast({ title: "Extras saved", description: `${familyName} — branch extras updated.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function handleRevertAddons() {
    try {
      await upsert.mutateAsync({
        product_family_id: familyId,
        tenant_id: tenantId,
        branch_id: branchId,
        pricing_addons: null,
      });
      toast({ title: "Reverted", description: `${familyName} now inherits tenant / master extras.` });
    } catch (e: any) {
      toast({ title: "Revert failed", description: e.message, variant: "destructive" });
    }
  }

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
      <AccordionContent className="px-4 pb-4 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Paid extras</span>
            {branchAddons ? (
              <Badge variant="secondary" className="text-[10px]">Branch extras</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                {tenantAddons ? "Inheriting tenant extras" : "Inheriting master extras"}
              </Badge>
            )}
          </div>
          <FamilyPricingOptionsEditor
            options={pricingOptions}
            addons={addons}
            allowOptionEditing={false}
            saving={upsert.isPending}
            onSave={(next) => handleSaveAddons(next.addons)}
            onRevert={branchAddons ? handleRevertAddons : undefined}
            revertLabel="Revert to inherited extras"
          />
        </div>
        <PackPricingMatrixEditor
          scope="branch"
          parentBlocks={parentBlocks}
          initialBlocks={initialBlocks}
          allowedSizeCodes={allowedSizes}
          pricingOptions={pricingOptions}
          saving={upsert.isPending}
          reverting={remove.isPending}
          onSave={handleSave}
          onRevertToParent={branchOverride ? handleRevert : undefined}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
