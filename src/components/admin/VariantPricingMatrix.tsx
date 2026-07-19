import { useMemo, useState } from "react";
import {
  useRateCardClicks,
  useUpdateRateCardClick,
  useInsertRateCardClick,
  useDeleteRateCardClick,
  type RateCardClick,
} from "@/hooks/useRateCard";
import { useCatalogSizes, useProductCatalogLinks } from "@/hooks/useCatalog";
import type { ProductVariantLink } from "@/hooks/useCatalogVariants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import TiersButton from "@/components/pricing/TiersButton";

interface Props {
  productFamilyId: string;
  variantLinks: ProductVariantLink[];
  scope?: "master" | "branch";
  tenantId?: string | null;
  branchId?: string | null;
}

/**
 * Inline per-variant pricing matrix. Reads and writes `rate_card_clicks` rows
 * at the requested scope (master by default, or branch when tenant/branch ids
 * are supplied), pre-filtered to this family's linked sizes × linked variants.
 */
export default function VariantPricingMatrix({
  productFamilyId,
  variantLinks,
  scope = "master",
  tenantId = null,
  branchId = null,
}: Props) {
  const { data: allClicks = [] } = useRateCardClicks({ scope, tenantId, branchId });
  const { data: sizes = [] } = useCatalogSizes();
  const { data: catalogLinks = [] } = useProductCatalogLinks(productFamilyId);
  const update = useUpdateRateCardClick();
  const insert = useInsertRateCardClick();
  const del = useDeleteRateCardClick();

  const [drafts, setDrafts] = useState<Record<string, { sell?: string; cost?: string }>>({});
  const [adding, setAdding] = useState<{
    sizeCode: string;
    variantCode: string;
    colour: "mono" | "colour";
    sides: "simplex" | "duplex";
    sell_price: number;
    cost_price: number;
  } | null>(null);

  // Sizes linked to this family (as catalog code strings, lowercased).
  const familySizeCodes = useMemo(
    () =>
      catalogLinks
        .filter((l) => l.catalog === "size")
        .map((l) => l.item_code.toLowerCase()),
    [catalogLinks],
  );

  const familySizes = useMemo(
    () => sizes.filter((s) => familySizeCodes.includes(s.code.toLowerCase())),
    [sizes, familySizeCodes],
  );

  const variantCodes = useMemo(
    () => variantLinks.map((l) => l.variant?.code).filter(Boolean) as string[],
    [variantLinks],
  );

  // Filter click rows to (this family's sizes) × (linked variants only).
  const rowsForCell = (sizeCode: string, variantCode: string): RateCardClick[] =>
    allClicks.filter((c) => {
      const cSize = ((c as any).catalog_size_code ?? c.size ?? "").toString().toLowerCase();
      const cVar = ((c as any).variant_code ?? "") as string | null;
      return cSize === sizeCode.toLowerCase() && (cVar ?? "") === variantCode;
    });

  function setDraft(id: string, field: "sell" | "cost", value: string) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }

  async function commit(row: RateCardClick, field: "sell_price" | "cost_price", value: string) {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num < 0) return;
    if (num === (row as any)[field]) return;
    try {
      await update.mutateAsync({ id: row.id, [field]: num } as any);
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  }

  async function toggleActive(row: RateCardClick, value: boolean) {
    try {
      await update.mutateAsync({ id: row.id, is_active: value });
    } catch (e: any) {
      toast({ title: "Toggle failed", description: e.message, variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this price row?")) return;
    try {
      await del.mutateAsync(id);
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  function openAdd(sizeCode: string, variantCode: string) {
    setAdding({
      sizeCode,
      variantCode,
      colour: "colour",
      sides: "simplex",
      sell_price: 0,
      cost_price: 0,
    });
  }

  async function saveAdd() {
    if (!adding) return;
    const size = sizes.find((s) => s.code.toLowerCase() === adding.sizeCode.toLowerCase());
    try {
      await insert.mutateAsync({
        scope_type: scope,
        tenant_id: scope === "master" ? null : tenantId,
        branch_id: scope === "branch" ? branchId : null,
        size: size?.label ?? adding.sizeCode,
        catalog_size_code: size?.code ?? adding.sizeCode.toLowerCase(),
        colour: adding.colour,
        sides: adding.sides,
        variant_code: adding.variantCode,
        sell_price: adding.sell_price,
        cost_price: adding.cost_price,
        is_active: true,
      } as any);
      toast({ title: "Price row added" });
      setAdding(null);
    } catch (e: any) {
      toast({ title: "Add failed", description: e.message, variant: "destructive" });
    }
  }

  if (variantLinks.length === 0) {
    return null;
  }

  if (familySizes.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">Variant pricing</h3>
        <p className="text-xs text-muted-foreground">
          Link at least one size to this product on the Catalogue tab before setting variant prices.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Variant pricing (Master)</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Set the master sell/cost price per variant, per size. These rows are the same
          click-charges used across the platform — branches inherit them and can override under
          Branch → Pricing → Click Charges. All prices are entered ex&nbsp;VAT.
        </p>
      </div>

      {familySizes.map((size) => (
        <div key={size.id} className="border border-border rounded-md overflow-hidden">
          <div className="bg-muted/40 px-3 py-2 text-sm font-medium uppercase">
            {size.label}
          </div>
          <div className="divide-y divide-border">
            {variantLinks.map((link) => {
              const vCode = link.variant?.code ?? "";
              const vLabel = link.variant?.label ?? vCode;
              const rows = rowsForCell(size.code, vCode);
              return (
                <div key={link.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{vLabel}</div>
                    <Button size="sm" variant="outline" onClick={() => openAdd(size.code, vCode)}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add price
                    </Button>
                  </div>
                  {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No price yet — click "Add price" to set one.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Colour</TableHead>
                          <TableHead>Sides</TableHead>
                          <TableHead className="w-32">Sell (ex VAT)</TableHead>
                          <TableHead className="w-32">Cost (ex VAT)</TableHead>
                          <TableHead className="w-20">Active</TableHead>
                          <TableHead className="w-16">Tiers</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row) => {
                          const sell = drafts[row.id]?.sell ?? String(row.sell_price);
                          const cost = drafts[row.id]?.cost ?? String(row.cost_price);
                          return (
                            <TableRow key={row.id}>
                              <TableCell className="capitalize">{row.colour}</TableCell>
                              <TableCell className="capitalize">{row.sides}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="h-8 w-24 text-sm"
                                  value={sell}
                                  onChange={(e) => setDraft(row.id, "sell", e.target.value)}
                                  onBlur={(e) => commit(row, "sell_price", e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="h-8 w-24 text-sm"
                                  value={cost}
                                  onChange={(e) => setDraft(row.id, "cost", e.target.value)}
                                  onBlur={(e) => commit(row, "cost_price", e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <Switch
                                  checked={row.is_active}
                                  onCheckedChange={(v) => toggleActive(row, v)}
                                />
                              </TableCell>
                              <TableCell>
                                <TiersButton
                                  table="clicks"
                                  lineId={row.id}
                                  label={`${size.label} · ${row.colour} · ${row.sides} · ${vLabel}`}
                                  scope="master"
                                  tenantId={null}
                                  branchId={null}
                                  fallbackSell={row.sell_price}
                                  fallbackCost={row.cost_price}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => remove(row.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add variant price</DialogTitle>
          </DialogHeader>
          {adding && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 text-xs text-muted-foreground">
                {sizes.find((s) => s.code.toLowerCase() === adding.sizeCode.toLowerCase())?.label ??
                  adding.sizeCode}
                {" · "}
                {variantLinks.find((l) => l.variant?.code === adding.variantCode)?.variant?.label ??
                  adding.variantCode}
              </div>
              <div>
                <Label className="text-xs">Colour</Label>
                <Select
                  value={adding.colour}
                  onValueChange={(v) => setAdding({ ...adding, colour: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="colour">Full Colour</SelectItem>
                    <SelectItem value="mono">Mono</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sides</Label>
                <Select
                  value={adding.sides}
                  onValueChange={(v) => setAdding({ ...adding, sides: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simplex">Single-sided</SelectItem>
                    <SelectItem value="duplex">Double-sided</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sell price (ex VAT)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adding.sell_price}
                  onChange={(e) =>
                    setAdding({ ...adding, sell_price: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Cost price (ex VAT)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adding.cost_price}
                  onChange={(e) =>
                    setAdding({ ...adding, cost_price: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
            <Button onClick={saveAdd} disabled={insert.isPending}>
              Add price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
