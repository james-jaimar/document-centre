import { useState, useMemo } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useProductOptions } from "@/hooks/useProductOptions";
import { usePricingRules } from "@/hooks/usePricingRules";
import {
  useProductPriceOverrides,
  useCreatePriceOverride,
  useDeletePriceOverride,
} from "@/hooks/useProductPriceOverrides";
import type { ProductPriceOverride } from "@/hooks/useProductPriceOverrides";
import { isStructuredValues } from "@/lib/productOptionTypes";
import type { StructuredOptionValue } from "@/lib/productOptionTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { formatPrice } from "@/lib/formatCurrency";

interface Props {
  productFamilyId: string;
  productFamilyName: string;
  /** When provided, overrides are scoped to this branch instead of the tenant. */
  branchId?: string | null;
}

const RULE_TYPE_LABELS: Record<string, string> = {
  per_page: "Per Page",
  per_document: "Per Document",
  per_unit: "Per Unit",
  surcharge: "Surcharge",
  setup_fee: "Setup Fee",
};

export default function ProductPricingTab({
  productFamilyId,
  productFamilyName,
  branchId = null,
}: Props) {
  const { tenantId } = useTenantContext();
  const { data: options = [] } = useProductOptions(productFamilyId);
  const { data: allRules = [] } = usePricingRules(tenantId);
  const { data: overrides = [] } = useProductPriceOverrides(
    tenantId,
    productFamilyId,
    "ZAR",
    branchId,
  );
  const createOverride = useCreatePriceOverride();
  const deleteOverride = useDeletePriceOverride();

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [newConditions, setNewConditions] = useState<Record<string, string>>({});
  const [newQtyMin, setNewQtyMin] = useState(1);
  const [newQtyMax, setNewQtyMax] = useState<number | "">("");
  const [newSellPrice, setNewSellPrice] = useState(0);
  const [newCostPrice, setNewCostPrice] = useState(0);
  const [newWeightGrams, setNewWeightGrams] = useState(0);

  // Filter rules for this product family
  const familyRules = useMemo(
    () =>
      allRules.filter(
        (r) =>
          r.product_family_id === productFamilyId ||
          !r.product_family_id
      ),
    [allRules, productFamilyId]
  );

  // Build option price summary
  const optionPriceSummary = useMemo(() => {
    const items: {
      optionName: string;
      label: string;
      group: string;
      priceImpact: number;
      priceType: string;
    }[] = [];
    for (const opt of options) {
      const vals = opt.values;
      if (!isStructuredValues(vals)) continue;
      for (const v of vals as unknown as StructuredOptionValue[]) {
        if (v.price_impact !== 0) {
          items.push({
            optionName: opt.name,
            label: v.label,
            group: v.group,
            priceImpact: v.price_impact,
            priceType: v.price_type,
          });
        }
      }
    }
    return items;
  }, [options]);

  // Selectable options for override conditions
  const selectableOptions = useMemo(() => {
    return options
      .filter((o) => isStructuredValues(o.values))
      .map((o) => ({
        name: o.name,
        values: (o.values as unknown as StructuredOptionValue[]).map((v) => ({
          slug: v.slug,
          label: v.label,
        })),
      }));
  }, [options]);

  function openOverrideDialog() {
    setNewConditions({});
    setNewQtyMin(1);
    setNewQtyMax("");
    setNewSellPrice(0);
    setNewCostPrice(0);
    setNewWeightGrams(0);
    setOverrideDialogOpen(true);
  }

  async function handleCreateOverride() {
    if (!tenantId) return;
    try {
      await createOverride.mutateAsync({
        tenant_id: tenantId,
        branch_id: null,
        product_family_id: productFamilyId,
        conditions: newConditions,
        quantity_min: newQtyMin,
        quantity_max: newQtyMax === "" ? null : Number(newQtyMax),
        sell_price: newSellPrice,
        cost_price: newCostPrice,
        weight_grams: newWeightGrams,
        currency_code: "ZAR",
      });
      toast({ title: "Price override created" });
      setOverrideDialogOpen(false);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  }

  async function handleDeleteOverride(id: string) {
    try {
      await deleteOverride.mutateAsync(id);
      toast({ title: "Override deleted" });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Applicable Pricing Rules */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">
          Base Pricing Rules
        </h4>
        <p className="text-xs text-muted-foreground mb-2">
          Rules from the global Pricing page that apply to{" "}
          <strong>{productFamilyName}</strong>.
        </p>
        {familyRules.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No pricing rules configured for this product family.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Conditions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {familyRules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-medium">
                    {r.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {RULE_TYPE_LABELS[r.rule_type] || r.rule_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatPrice(Number(r.price_value), "ZAR")}
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground max-w-[160px] truncate">
                    {r.conditions &&
                    Object.keys(r.conditions as object).length > 0
                      ? Object.entries(r.conditions as Record<string, unknown>)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Section 2: Option Price Impacts */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2">
          Option Surcharges
        </h4>
        <p className="text-xs text-muted-foreground mb-2">
          Price impacts from product option values. Edit these in the Options
          tab.
        </p>
        {optionPriceSummary.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No option values have price impacts.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Option</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Impact</TableHead>
                <TableHead>Per</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {optionPriceSummary.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-xs">{item.optionName}</TableCell>
                  <TableCell className="text-xs font-medium">
                    {item.label}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.priceImpact > 0 ? "+" : ""}
                    {formatPrice(item.priceImpact, "ZAR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {item.priceType.replace("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Section 3: Combination Overrides */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              Combination Overrides
            </h4>
            <p className="text-xs text-muted-foreground">
              Fixed prices for specific option + quantity combinations. These
              bypass the calculated price.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openOverrideDialog}>
            <Plus className="h-3 w-3 mr-1" /> Add Override
          </Button>
        </div>

        {overrides.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No price overrides. The standard calculated price applies.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conditions</TableHead>
                <TableHead>Qty Range</TableHead>
                <TableHead>Sell</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((o: ProductPriceOverride) => (
                <TableRow key={o.id}>
                  <TableCell className="text-[10px] font-mono max-w-[200px]">
                    {Object.entries(o.conditions)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {o.quantity_min}
                    {o.quantity_max ? `–${o.quantity_max}` : "+"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatPrice(o.sell_price, "ZAR")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatPrice(o.cost_price, "ZAR")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {o.weight_grams ? `${o.weight_grams}g` : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => handleDeleteOverride(o.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Override Creation Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Price Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Set a fixed sell/cost price for a specific combination of options
              and quantity range.
            </p>

            {/* Option conditions */}
            {selectableOptions.map((opt) => (
              <div key={opt.name}>
                <Label className="text-xs">{opt.name}</Label>
                <Select
                  value={newConditions[opt.name] || ""}
                  onValueChange={(v) =>
                    setNewConditions((prev) => ({
                      ...prev,
                      [opt.name]: v,
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    {opt.values.map((v) => (
                      <SelectItem key={v.slug} value={v.slug}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            {/* Quantity range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Qty Min</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-8 text-xs"
                  value={newQtyMin}
                  onChange={(e) =>
                    setNewQtyMin(parseInt(e.target.value) || 1)
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Qty Max (empty = unlimited)</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-8 text-xs"
                  value={newQtyMax}
                  onChange={(e) =>
                    setNewQtyMax(
                      e.target.value === "" ? "" : parseInt(e.target.value) || 1
                    )
                  }
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Sell Price (ZAR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="h-8 text-xs"
                  value={newSellPrice}
                  onChange={(e) =>
                    setNewSellPrice(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Cost Price (ZAR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="h-8 text-xs"
                  value={newCostPrice}
                  onChange={(e) =>
                    setNewCostPrice(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Weight (g)</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  value={newWeightGrams}
                  onChange={(e) =>
                    setNewWeightGrams(parseInt(e.target.value) || 0)
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOverrideDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateOverride}
              disabled={createOverride.isPending}
            >
              Create Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
