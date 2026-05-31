import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import {
  DEFAULT_BREAK_BOUNDARIES,
  useRateCardPriceBreaks,
  useReplaceRateCardPriceBreaks,
  type RateCardTable,
} from "@/hooks/useRateCardPriceBreaks";
import { toast } from "@/hooks/use-toast";

interface LineRef {
  table: RateCardTable;
  id: string;
  /** human-readable e.g. "A3 · Colour · Duplex" */
  label: string;
  scope_type: "master" | "tenant" | "branch";
  tenant_id: string | null;
  branch_id: string | null;
  /** Used to seed a 4-tier ladder if no rows exist yet */
  fallback_sell: number;
  fallback_cost: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: LineRef | null;
}

interface TierRow {
  min_quantity: string;
  max_quantity: string; // "" = open-ended
  sell_price: string;
  cost_price: string;
}

function emptyRow(prevMax: number | null): TierRow {
  return {
    min_quantity: prevMax != null ? String(prevMax + 1) : "1",
    max_quantity: "",
    sell_price: "0",
    cost_price: "0",
  };
}

export default function PriceBreaksModal({ open, onOpenChange, line }: Props) {
  const { data: existing, isLoading } = useRateCardPriceBreaks(
    line?.table ?? null,
    line?.id ?? null,
  );
  const replace = useReplaceRateCardPriceBreaks();
  const [rows, setRows] = useState<TierRow[]>([]);

  useEffect(() => {
    if (!open) return;
    if (existing && existing.length > 0) {
      setRows(
        existing.map((t) => ({
          min_quantity: String(t.min_quantity),
          max_quantity: t.max_quantity == null ? "" : String(t.max_quantity),
          sell_price: String(t.sell_price),
          cost_price: String(t.cost_price),
        })),
      );
    } else if (line) {
      setRows(
        DEFAULT_BREAK_BOUNDARIES.map((b) => ({
          min_quantity: String(b.min),
          max_quantity: b.max == null ? "" : String(b.max),
          sell_price: String(line.fallback_sell ?? 0),
          cost_price: String(line.fallback_cost ?? 0),
        })),
      );
    }
  }, [open, existing, line]);

  if (!line) return null;

  function resetDefaults() {
    if (!line) return;
    setRows(
      DEFAULT_BREAK_BOUNDARIES.map((b) => ({
        min_quantity: String(b.min),
        max_quantity: b.max == null ? "" : String(b.max),
        sell_price: String(line.fallback_sell ?? 0),
        cost_price: String(line.fallback_cost ?? 0),
      })),
    );
  }

  function addRow() {
    setRows((r) => {
      const lastMax = r.length > 0 ? r[r.length - 1].max_quantity : "0";
      const lastMaxNum = lastMax === "" ? null : parseInt(lastMax, 10);
      return [...r, emptyRow(lastMaxNum)];
    });
  }

  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  function update(idx: number, key: keyof TierRow, value: string) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  }

  function validate(): string | null {
    if (rows.length === 0) return "At least one tier required.";
    const parsed = rows.map((r) => ({
      min: parseInt(r.min_quantity, 10),
      max: r.max_quantity === "" ? null : parseInt(r.max_quantity, 10),
      sell: parseFloat(r.sell_price),
      cost: parseFloat(r.cost_price),
    }));
    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      if (!Number.isFinite(p.min) || p.min < 1) return `Row ${i + 1}: min must be ≥ 1.`;
      if (p.max != null && p.max < p.min) return `Row ${i + 1}: max must be ≥ min.`;
      if (!Number.isFinite(p.sell) || p.sell < 0) return `Row ${i + 1}: sell price invalid.`;
      if (!Number.isFinite(p.cost) || p.cost < 0) return `Row ${i + 1}: cost price invalid.`;
    }
    const sorted = parsed.slice().sort((a, b) => a.min - b.min);
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (next) {
        if (cur.max == null) return `Tier starting at ${cur.min} is open-ended but is not the last.`;
        if (next.min !== cur.max + 1)
          return `Tier gap/overlap between ${cur.min}–${cur.max} and ${next.min}–${next.max ?? "∞"}.`;
      }
    }
    if (sorted[0].min !== 1) return "First tier must start at 1.";
    return null;
  }

  async function save() {
    if (!line) return;
    const err = validate();
    if (err) {
      toast({ title: "Invalid tiers", description: err, variant: "destructive" });
      return;
    }
    try {
      await replace.mutateAsync({
        table: line.table,
        lineId: line.id,
        scope_type: line.scope_type,
        tenant_id: line.tenant_id,
        branch_id: line.branch_id,
        tiers: rows.map((r) => ({
          min_quantity: parseInt(r.min_quantity, 10),
          max_quantity: r.max_quantity === "" ? null : parseInt(r.max_quantity, 10),
          sell_price: parseFloat(r.sell_price),
          cost_price: parseFloat(r.cost_price),
        })),
      });
      toast({ title: "Price breaks saved" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Price breaks · {line.label}</DialogTitle>
          <DialogDescription>
            Charge a different unit price depending on the total quantity ordered. Tiers must be
            contiguous and start at 1. Leave the last tier's max blank for "and up".
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Min qty</TableHead>
                  <TableHead className="w-24">Max qty</TableHead>
                  <TableHead className="w-32">Sell (R)</TableHead>
                  <TableHead className="w-32">Cost (R)</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={row.min_quantity}
                        onChange={(e) => update(i, "min_quantity", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        placeholder="∞"
                        value={row.max_quantity}
                        onChange={(e) => update(i, "max_quantity", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.sell_price}
                        onChange={(e) => update(i, "sell_price", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.cost_price}
                        onChange={(e) => update(i, "cost_price", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => removeRow(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add tier
          </Button>
          <Button variant="ghost" size="sm" onClick={resetDefaults}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset to defaults
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={replace.isPending}>
            {replace.isPending ? "Saving…" : "Save tiers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
