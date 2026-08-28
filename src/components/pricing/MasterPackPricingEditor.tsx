import { useEffect, useMemo, useState } from "react";
import { useProductFamilies, useUpdateProductFamily } from "@/hooks/useProductFamilies";
import type { ProductFamily, QuantityBlock } from "@/hooks/useProductFamilies";
import PackPricingMatrixEditor from "@/components/pricing/PackPricingMatrixEditor";
import FamilyPricingOptionsEditor from "@/components/pricing/FamilyPricingOptionsEditor";
import { normalizeAddons, normalizeOptions } from "@/lib/pricing/packOptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";

/**
 * Master-scope pack pricing. Edits `product_families.quantity_blocks` directly
 * — this is the canonical ladder every tenant/branch inherits from.
 */
export default function MasterPackPricingEditor() {
  const { data: families = [], isLoading } = useProductFamilies(null, { masterOnly: true });
  const update = useUpdateProductFamily();
  const [savingId, setSavingId] = useState<string | null>(null);

  // Deep-link support: /platform/master-pricing?family=<id>
  const location = useLocation();
  const highlightId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("family");
  }, [location.search]);
  const [openItem, setOpenItem] = useState<string | undefined>();
  useEffect(() => {
    if (highlightId) {
      setOpenItem(highlightId);
      // scroll into view once mounted
      setTimeout(() => {
        const el = document.getElementById(`pack-family-${highlightId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  }, [highlightId]);

  const blocksFamilies = useMemo(
    () => families.filter((f) => (f as any).quantity_mode === "blocks"),
    [families],
  );

  async function handleSave(family: ProductFamily, blocks: QuantityBlock[]) {
    setSavingId(family.id);
    try {
      await update.mutateAsync({ id: family.id, quantity_blocks: blocks });
      toast({ title: "Pack pricing saved", description: `${family.name} — master ladder updated.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  async function handleSaveOptions(
    family: ProductFamily,
    next: { options: unknown; addons: unknown },
  ) {
    setSavingId(family.id);
    try {
      await update.mutateAsync({
        id: family.id,
        pricing_options: next.options,
        pricing_addons: next.addons,
      } as any);
      toast({ title: "Options saved", description: `${family.name} — options & extras updated.` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-6">Loading families…</p>;
  }

  if (blocksFamilies.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No product families use fixed pack pricing yet. Set a family's{" "}
          <strong>Quantity Selling Mode</strong> to "Fixed pack sizes" in{" "}
          <em>Products → Edit Product Family</em> to enable pack pricing here.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Pack Pricing</h2>
        <p className="text-sm text-muted-foreground">
          Fixed-pack sell prices for products that ship in set quantities (Flyers, DL flyers, etc.).
          These are the master defaults — tenants and branches can override them from their own pricing pages.
        </p>
        <p className="text-xs text-muted-foreground mt-1">All pack prices are entered <strong>ex VAT</strong>.</p>
      </div>

      <Accordion type="single" collapsible value={openItem} onValueChange={setOpenItem} className="space-y-2">
        {blocksFamilies.map((family) => {
          const blocks = ((family as any).quantity_blocks ?? []) as QuantityBlock[];
          const printingRules = ((family as any).printing_rules ?? {}) as any;
          const allowedSizes: string[] = Array.isArray(printingRules?.allowed_finished_sizes)
            ? printingRules.allowed_finished_sizes
            : [];
          return (
            <AccordionItem
              key={family.id}
              value={family.id}
              id={`pack-family-${family.id}`}
              className="border rounded-lg data-[state=open]:bg-muted/20"
            >
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1">
                  <span className="font-medium">{family.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {blocks.length} row{blocks.length === 1 ? "" : "s"}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <FamilyPricingOptionsEditor
                  options={normalizeOptions((family as any).pricing_options)}
                  addons={normalizeAddons((family as any).pricing_addons)}
                  saving={savingId === family.id}
                  onSave={(next) => handleSaveOptions(family, next)}
                />
                <PackPricingMatrixEditor
                  scope="master"
                  initialBlocks={blocks}
                  allowedSizeCodes={allowedSizes}
                  pricingOptions={normalizeOptions((family as any).pricing_options)}
                  saving={savingId === family.id}
                  onSave={(b) => handleSave(family, b)}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
