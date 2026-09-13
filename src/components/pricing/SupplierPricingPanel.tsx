/**
 * Banner shown above a pack ladder when the product is printed by a trade
 * partner. The supplier's trade price (including their VAT) is the buy price;
 * the shop owner only sets the selling price.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  useOutsourcedPricing,
  buildLadderFromSupplier,
  type OutsourcedPricing,
} from "@/hooks/useOutsourcedPricing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { DownloadCloud, AlertTriangle, Truck } from "lucide-react";

interface Props {
  outsourced: OutsourcedPricing;
  tenantId: string;
  familyId: string;
  familyName: string;
  currentBlocks: QuantityBlock[];
  onApply: (blocks: QuantityBlock[]) => Promise<void>;
  /** Branches can see the cost but not pull a new ladder. */
  readOnly?: boolean;
}

export default function SupplierPricingPanel({
  outsourced,
  tenantId,
  familyId,
  familyName,
  currentBlocks,
  onApply,
  readOnly = false,
}: Props) {
  const qc = useQueryClient();
  const [markup, setMarkup] = useState<string>(
    outsourced.assignment?.markup_percent != null
      ? String(outsourced.assignment.markup_percent)
      : "40",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!outsourced.isOutsourced) return null;

  const preview = buildLadderFromSupplier({
    supplierBlocks: outsourced.supplierBlocks,
    costByKey: outsourced.costByKey,
    existing: currentBlocks,
    markupPercent: parseFloat(markup) || 0,
  });

  async function handlePull() {
    setBusy(true);
    try {
      await onApply(preview.blocks);
      await supabase
        .from("product_supplier_assignments")
        .update({
          markup_percent: parseFloat(markup) || 0,
          last_synced_at: new Date().toISOString(),
          cost_fingerprint: outsourced.fingerprint,
        })
        .eq("tenant_id", tenantId)
        .eq("product_family_id", familyId);
      qc.invalidateQueries({ queryKey: ["product_supplier_assignments"] });
      toast({
        title: "Supplier pricing pulled",
        description: `${familyName} — ${preview.blocks.length} pack rows now match ${outsourced.supplierName ?? "your supplier"}.`,
      });
      setConfirmOpen(false);
    } catch (e: any) {
      toast({ title: "Could not pull pricing", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const vatNote = outsourced.tax.enabled && !outsourced.tax.inclusive
    ? `their trade price + ${outsourced.tax.rate}% ${outsourced.tax.label}`
    : `their trade price (already includes ${outsourced.tax.label})`;

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Truck className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          Printed by {outsourced.supplierName ?? "a trade partner"}
        </span>
        <Badge variant="secondary" className="text-[10px]">Outsourced</Badge>
        {outsourced.leadTimeDays != null && (
          <Badge variant="outline" className="text-[10px]">
            {outsourced.leadTimeDays} day lead time
          </Badge>
        )}
        {outsourced.minQuantity != null && (
          <Badge variant="outline" className="text-[10px]">Min {outsourced.minQuantity}</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Your buy price is {vatNote}, so the Cost column is locked and can't be typed over.
        Set your own selling price in the Consumer column.
      </p>

      {outsourced.costChanged && (
        <p className="flex items-start gap-1.5 text-xs text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Your supplier has changed their prices since you last pulled. Pull again to refresh your
          costs — your selling prices stay as they are.
        </p>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Markup % for new rows</Label>
            <Input
              className="h-8 w-24 text-xs"
              type="number"
              min={0}
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={outsourced.supplierBlocks.length === 0}
            onClick={() => setConfirmOpen(true)}
          >
            <DownloadCloud className="h-3.5 w-3.5 mr-1" />
            Pull supplier pricing
          </Button>
          {outsourced.supplierBlocks.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Your supplier hasn't published a price ladder for this product yet.
            </span>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your pack prices for {familyName}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Your ladder will be rebuilt to match exactly what{" "}
                  {outsourced.supplierName ?? "your supplier"} can print:
                </p>
                <ul className="list-disc pl-5">
                  <li>{preview.kept} row{preview.kept === 1 ? "" : "s"} kept, with your selling prices intact</li>
                  <li>{preview.added} new row{preview.added === 1 ? "" : "s"} priced at cost + {parseFloat(markup) || 0}%</li>
                  <li>{preview.dropped} row{preview.dropped === 1 ? "" : "s"} removed — no longer supplied</li>
                </ul>
                <p className="text-muted-foreground">
                  Buy prices come in including your supplier's VAT.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                handlePull();
              }}
            >
              {busy ? "Pulling…" : "Replace prices"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Convenience wrapper for callers that only have ids. */
export function SupplierPricingPanelFor(props: Omit<Props, "outsourced">) {
  const outsourced = useOutsourcedPricing(props.tenantId, props.familyId);
  return <SupplierPricingPanel {...props} outsourced={outsourced} />;
}
