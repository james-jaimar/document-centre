import { useMemo } from "react";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  useUpsertPackPricingOverride,
  useDeletePackPricingOverride,
  usePackPricingOverridesForFamily,
} from "@/hooks/useProductPackPricingOverrides";
import PackPricingMatrixEditor from "@/components/pricing/PackPricingMatrixEditor";
import { normalizeOptions, type PricingOption } from "@/lib/pricing/packOptions";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

interface Props {
  tenantId: string;
}

/** Tenant-wide pack ladders (branch_id = null). Branches inherit these. */
export default function TenantPackPricingEditor({ tenantId }: Props) {
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
          Set your own pack ladders for this tenant. Branches inherit these unless they
          set their own override. Leave a family alone to keep the master prices.
        </p>
        <p className="text-xs text-muted-foreground mt-1">Pack prices are entered <strong>ex VAT</strong>.</p>
      </div>
      <Accordion type="single" collapsible className="space-y-2">
        {blocksFamilies.map((family) => (
          <TenantFamilyRow
            key={family.id}
            tenantId={tenantId}
            familyId={family.id}
            familyName={family.name}
            masterBlocks={((family as any).quantity_blocks ?? []) as QuantityBlock[]}
            allowedSizes={
              Array.isArray(((family as any).printing_rules ?? {}).allowed_finished_sizes)
                ? ((family as any).printing_rules ?? {}).allowed_finished_sizes
                : []
            }
            pricingOptions={normalizeOptions((family as any).pricing_options)}
          />
        ))}
      </Accordion>
    </div>
  );
}

function TenantFamilyRow({
  tenantId,
  familyId,
  familyName,
  masterBlocks,
  allowedSizes,
  pricingOptions,
}: {
  tenantId: string;
  familyId: string;
  familyName: string;
  masterBlocks: QuantityBlock[];
  allowedSizes: string[];
  pricingOptions: PricingOption[];
}) {
  const { data: allOverrides = [] } = usePackPricingOverridesForFamily(familyId, tenantId);
  const tenantOverride = allOverrides.find((o) => o.branch_id === null) ?? null;
  const upsert = useUpsertPackPricingOverride();
  const remove = useDeletePackPricingOverride();

  const initialBlocks = (tenantOverride?.quantity_blocks ?? []) as QuantityBlock[];

  async function handleSave(blocks: QuantityBlock[]) {
    try {
      await upsert.mutateAsync({
        product_family_id: familyId,
        tenant_id: tenantId,
        branch_id: null,
        quantity_blocks: blocks,
      });
      toast({ title: "Tenant pack pricing saved", description: `${familyName} — tenant override active.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function handleRevert() {
    if (!tenantOverride) return;
    try {
      await remove.mutateAsync(tenantOverride.id);
      toast({ title: "Reverted", description: `${familyName} now inherits master pack prices.` });
    } catch (e: any) {
      toast({ title: "Revert failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <AccordionItem value={familyId} className="border rounded-lg">
      <AccordionTrigger className="px-4 hover:no-underline">
        <div className="flex items-center gap-3 flex-1">
          <span className="font-medium">{familyName}</span>
          {tenantOverride ? (
            <Badge variant="secondary" className="text-[10px]">Tenant override</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">Inheriting</Badge>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <PackPricingMatrixEditor
          scope="tenant"
          parentBlocks={masterBlocks}
          initialBlocks={initialBlocks}
          allowedSizeCodes={allowedSizes}
          pricingOptions={pricingOptions}
          saving={upsert.isPending}
          reverting={remove.isPending}
          onSave={handleSave}
          onRevertToParent={tenantOverride ? handleRevert : undefined}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
