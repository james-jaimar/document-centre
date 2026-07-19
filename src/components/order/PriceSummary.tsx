import { useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";
import type { ItemSpec, PriceBreakdown, RateCardBundle } from "@/lib/calculatePrice";
import { calculateItemPrice, calculatePriceFromRateCard } from "@/lib/calculatePrice";
import type { ProductPriceOverride } from "@/hooks/useProductPriceOverrides";
import type { ProductRecipe } from "@/lib/productRecipe";
import { type QuantityBlock, blockMatchesField } from "@/hooks/useProductFamilies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { formatPrice } from "@/lib/formatCurrency";
import { usePriceDisplay } from "@/lib/tax/usePriceDisplay";

type ProductOption = Tables<"product_options">;
type PricingRule = Tables<"pricing_rules">;

interface PriceSummaryProps {
  spec: ItemSpec;
  options: ProductOption[];
  rules: PricingRule[];
  overrides?: ProductPriceOverride[];
  /** When both supplied, the new rate-card engine is used instead of legacy rules. */
  recipe?: ProductRecipe | null;
  rateCard?: RateCardBundle | null;
  /** Fixed-quantity block config from the product family.
   *  When mode = "blocks" and blocks is non-empty, the numeric spinner is
   *  replaced by a pack picker and pricing is looked up from the block. */
  quantityMode?: "free" | "blocks";
  quantityBlocks?: QuantityBlock[];
  /** When set, forces the sides used for pack filtering (overrides the
   *  spec's Print Sides / is_duplex). Used by Flyers to lock pricing to the
   *  sidedness inferred from the uploaded page count. */
  allowedSides?: string[];
  onQuantityChange: (qty: number) => void;
  onAddToCart: () => void;
  disabled?: boolean;
  isSubmitting?: boolean;
}

export default function PriceSummary({
  spec,
  options,
  rules,
  overrides = [],
  recipe = null,
  rateCard = null,
  quantityMode = "free",
  quantityBlocks = [],
  allowedSides,
  onQuantityChange,
  onAddToCart,
  disabled,
  isSubmitting,
}: PriceSummaryProps) {
  const { region } = useRegionalPricing();
  const currency = region?.currency_code ?? "ZAR";
  const { toGross, showVatBreakdown, inclSuffix } = usePriceDisplay();

  // Filter the raw block ladder down to entries matching the current spec's
  // size / paper / sides. This makes pack pricing spec-aware — flyers priced
  // as A5 / 170gsm gloss / double-sided pick a different pack row than A4 /
  // 130gsm / single-sided. `'*'` in a block field is a wildcard.
  const specSize = spec.selected_options?.["Document Size"] ?? null;
  const specPaper = spec.selected_options?.["Paper"] ?? null;
  const specSidesSlug = spec.selected_options?.["Print Sides"] ?? null;
  const specSides: "single" | "double" = (() => {
    // Caller-forced sidedness (e.g. Flyers inferring from page count) wins.
    if (allowedSides && allowedSides.length === 1) {
      return allowedSides[0] === "double" ? "double" : "single";
    }
    if (specSidesSlug) {
      const s = specSidesSlug.toLowerCase();
      if (s === "duplex" || s === "double" || s === "double_sided") return "double";
      return "single";
    }
    return spec.is_duplex ? "double" : "single";
  })();

  const sortedBlocks = useMemo(() => {
    const all = (quantityBlocks ?? []).slice();
    const filtered = all.filter(
      (b) =>
        b.sides === specSides &&
        blockMatchesField(b.size, specSize) &&
        blockMatchesField(b.paper, specPaper),
    );
    return filtered.sort((a, b) => a.qty - b.qty);
  }, [quantityBlocks, specSize, specPaper, specSides]);
  const blocksActive = quantityMode === "blocks" && sortedBlocks.length > 0;
  const blocksConfiguredButNoMatch =
    quantityMode === "blocks" && (quantityBlocks?.length ?? 0) > 0 && sortedBlocks.length === 0;

  const activeBlock = useMemo(() => {
    if (!blocksActive) return null;
    return (
      sortedBlocks.find((b) => b.qty === spec.quantity) ??
      sortedBlocks.find((b) => b.qty >= spec.quantity) ??
      sortedBlocks[sortedBlocks.length - 1]
    );
  }, [blocksActive, sortedBlocks, spec.quantity]);

  const engineBreakdown: PriceBreakdown = useMemo(
    () =>
      recipe && rateCard
        ? calculatePriceFromRateCard(spec, recipe, rateCard, options)
        : calculateItemPrice(spec, options, rules, currency, overrides),
    [spec, options, rules, currency, overrides, recipe, rateCard],
  );

  // When blocks are active, the pack price replaces the engine total.
  const breakdown: PriceBreakdown = useMemo(() => {
    if (!blocksActive || !activeBlock) return engineBreakdown;
    const total = activeBlock.price_minor / 100;
    const perUnit = total / Math.max(1, activeBlock.qty);
    return {
      ...engineBreakdown,
      subtotal_per_unit: perUnit,
      total,
      lines: [
        {
          label: `Pack of ${activeBlock.qty} · ${activeBlock.sides === "double" ? "Double-sided" : "Single-sided"}`,
          type: "fixed",
          unit_amount: total,
          multiplier: 1,
          total,
        },
      ],

    };
  }, [blocksActive, activeBlock, engineBreakdown]);

  return (
    <div className="border-t border-border pt-4 space-y-3">
      {/* Quantity */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Quantity</span>
        {blocksActive ? (
          <Select
            value={String(activeBlock?.qty ?? sortedBlocks[0].qty)}
            onValueChange={(v) => onQuantityChange(parseInt(v, 10))}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortedBlocks.map((b) => (
                <SelectItem key={b.qty} value={String(b.qty)} className="text-xs">
                  {b.qty.toLocaleString()} — {formatPrice(toGross(b.price_minor / 100), currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onQuantityChange(Math.max(1, spec.quantity - 1))}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              min={1}
              value={spec.quantity}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v >= 1) onQuantityChange(v);
              }}
              className="w-16 h-8 text-center"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onQuantityChange(spec.quantity + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {blocksActive && activeBlock && (
        <p className="text-[11px] text-muted-foreground -mt-1">
          {formatPrice(toGross(activeBlock.price_minor / activeBlock.qty / 100), currency)} each
        </p>
      )}

      {blocksConfiguredButNoMatch && (
        <p className="text-xs text-destructive -mt-1">
          This size / paper / sides combination isn't offered. Pick a different option to see pack pricing.
        </p>
      )}

      {/* Price */}
      <div className="flex items-center justify-between">
        <Popover>
          <PopoverTrigger asChild>
            <button className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors">
              Price breakdown
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="space-y-1.5">
              {breakdown.lines.map((line, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground truncate pr-2">
                    {line.label}
                    {line.multiplier > 1 && (
                      <span className="opacity-60"> ×{line.multiplier}</span>
                    )}
                  </span>
                  <span className="font-mono text-foreground shrink-0">
                    {formatPrice(line.total, currency)}
                  </span>
                </div>
              ))}
              {breakdown.lines.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No pricing rules configured
                </p>
              )}
              <div className="border-t border-border pt-1.5 mt-1.5 flex justify-between text-xs font-medium">
                <span>Per unit</span>
                <span className="font-mono">
                  {formatPrice(toGross(breakdown.subtotal_per_unit), currency)}
                </span>
              </div>
              {showVatBreakdown && (
                <p className="text-[10px] text-muted-foreground pt-1">
                  Line prices above are ex VAT. Displayed price is {inclSuffix}.
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <div className="text-right leading-tight">
          <span className="text-xl font-bold text-foreground">
            {formatPrice(toGross(breakdown.total), currency)}
          </span>
          {showVatBreakdown && (
            <div className="text-[10px] text-muted-foreground">{inclSuffix}</div>
          )}
        </div>
      </div>

      {/* Add to Cart */}
      <Button
        className="w-full gap-2"
        size="lg"
        disabled={disabled || isSubmitting || blocksConfiguredButNoMatch}
        onClick={onAddToCart}
      >
        <ShoppingCart className="h-4 w-4" />
        {isSubmitting ? "Processing…" : "Add to Cart"}
      </Button>
    </div>
  );
}

