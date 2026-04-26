import { useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";
import type { ItemSpec, PriceBreakdown } from "@/lib/calculatePrice";
import { calculateItemPrice } from "@/lib/calculatePrice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { formatPrice } from "@/lib/formatCurrency";

type ProductOption = Tables<"product_options">;
type PricingRule = Tables<"pricing_rules">;

interface PriceSummaryProps {
  spec: ItemSpec;
  options: ProductOption[];
  rules: PricingRule[];
  onQuantityChange: (qty: number) => void;
  onAddToCart: () => void;
  disabled?: boolean;
  isSubmitting?: boolean;
}

export default function PriceSummary({
  spec,
  options,
  rules,
  onQuantityChange,
  onAddToCart,
  disabled,
  isSubmitting,
}: PriceSummaryProps) {
  const { region } = useRegionalPricing();
  const currency = region?.currency_code ?? "ZAR";
  const breakdown = useMemo(
    () => calculateItemPrice(spec, options, rules, currency),
    [spec, options, rules, currency]
  );

  return (
    <div className="border-t border-border pt-4 space-y-3">
      {/* Quantity */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Quantity</span>
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
      </div>

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
                  {formatPrice(breakdown.subtotal_per_unit, currency)}
                </span>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <span className="text-xl font-bold text-foreground">
          {formatPrice(breakdown.total, currency)}
        </span>
      </div>

      {/* Add to Cart */}
      <Button
        className="w-full gap-2"
        size="lg"
        disabled={disabled || isSubmitting}
        onClick={onAddToCart}
      >
        <ShoppingCart className="h-4 w-4" />
        {isSubmitting ? "Processing…" : "Add to Cart"}
      </Button>
    </div>
  );
}
