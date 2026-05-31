import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Layers } from "lucide-react";
import PriceBreaksModal from "./PriceBreaksModal";
import type { RateCardTable } from "@/hooks/useRateCardPriceBreaks";

interface Props {
  table: RateCardTable;
  lineId: string;
  label: string;
  scope: "master" | "tenant" | "branch";
  tenantId: string | null;
  branchId: string | null;
  fallbackSell: number;
  fallbackCost: number;
}

/**
 * Small icon button rendered on every rate-card row that pops a modal where
 * the user can edit the quantity-tier price breaks for that line.
 */
export default function TiersButton({
  table,
  lineId,
  label,
  scope,
  tenantId,
  branchId,
  fallbackSell,
  fallbackCost,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        title="Edit quantity price breaks"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      <PriceBreaksModal
        open={open}
        onOpenChange={setOpen}
        line={{
          table,
          id: lineId,
          label,
          scope_type: scope,
          tenant_id: tenantId,
          branch_id: branchId,
          fallback_sell: fallbackSell,
          fallback_cost: fallbackCost,
        }}
      />
    </>
  );
}
