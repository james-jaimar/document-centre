import type { StructuredOptionValue } from "./productOptionTypes";
import { isStructuredValues } from "./productOptionTypes";
import type { Tables } from "@/integrations/supabase/types";
import type { ProductPriceOverride } from "@/hooks/useProductPriceOverrides";
import { findMatchingOverride } from "@/hooks/useProductPriceOverrides";

type PricingRule = Tables<"pricing_rules">;
type ProductOption = Tables<"product_options">;

/** The spec object stored on order_items.spec — describes a configured document */
export interface ItemSpec {
  page_count: number;
  quantity: number;
  is_color: boolean;
  is_duplex: boolean;
  paper_stock?: string;
  /** Map of option name → selected value slug */
  selected_options: Record<string, string>;
  /**
   * Optional opt-in to bind a landscape document on its LONG edge (top)
   * rather than the default short edge. Only meaningful when the selected
   * Document Size is landscape and the binding method has spine artwork
   * (spiral/comb/twin_loop). `null` / undefined = use the size's default.
   */
  binding_edge_override?: "long" | null;
  /** How the uploaded PDF is scaled to fit the selected canvas size (posters, flyers, business cards) */
  scale_mode?: "fit" | "fill";
}

export interface PriceLineItem {
  label: string;
  type: "per_page" | "per_document" | "per_unit" | "surcharge" | "setup_fee" | "fixed" | "option";
  unit_amount: number;
  multiplier: number;
  total: number;
}

export interface PriceBreakdown {
  lines: PriceLineItem[];
  subtotal_per_unit: number;
  quantity: number;
  total: number;
}

/**
 * Evaluate whether a pricing rule's conditions match the given spec.
 */
function conditionsMatch(conditions: Record<string, unknown>, spec: ItemSpec): boolean {
  for (const [key, value] of Object.entries(conditions)) {
    switch (key) {
      case "is_color":
        if (spec.is_color !== value) return false;
        break;
      case "is_duplex":
        if (spec.is_duplex !== value) return false;
        break;
      case "min_pages":
        if (spec.page_count < (value as number)) return false;
        break;
      case "max_pages":
        if (spec.page_count > (value as number)) return false;
        break;
      case "min_quantity":
        if (spec.quantity < (value as number)) return false;
        break;
      case "max_quantity":
        if (spec.quantity > (value as number)) return false;
        break;
      case "paper_stock":
        if (spec.paper_stock !== value) return false;
        break;
    }
  }
  return true;
}

/**
 * Calculate the full price for an order item.
 *
 * @param spec - The item specification (page count, colour mode, selected options, etc.)
 * @param options - The product_options rows for the product family
 * @param rules - The pricing_rules rows for the product family (sorted by sort_order)
 * @returns A detailed price breakdown
 */
export function calculateItemPrice(
  spec: ItemSpec,
  options: ProductOption[],
  rules: PricingRule[],
  /**
   * Active region currency. Rules are filtered to this currency before
   * evaluation; if no rules match, falls back to ZAR (the source of truth)
   * so prices never silently disappear.
   */
  currencyCode: string = "ZAR",
  /**
   * Optional Layer 3: tenant-specific price overrides. When a matching
   * override exists for the selected option combination + quantity, it
   * replaces the calculated price entirely.
   */
  overrides: ProductPriceOverride[] = []
): PriceBreakdown {
  // Layer 3: Check for an exact-match price override first
  const override = findMatchingOverride(
    overrides,
    spec.selected_options,
    spec.quantity
  );
  if (override) {
    return {
      lines: [
        {
          label: "Fixed Price (override)",
          type: "fixed",
          unit_amount: override.sell_price,
          multiplier: 1,
          total: override.sell_price,
        },
      ],
      subtotal_per_unit: override.sell_price,
      quantity: spec.quantity,
      total: override.sell_price * spec.quantity,
    };
  }
  const lines: PriceLineItem[] = [];
  const targetCurrency = (currencyCode || "ZAR").toUpperCase();

  // Layer 1: Evaluate pricing rules — filter to the active currency, falling
  // back to ZAR if the target has no rules (defensive — should not happen
  // post-seed but keeps the demo functional during partial migrations).
  const ruleHasCurrency = (r: PricingRule, curr: string) =>
    (((r as unknown as { currency_code?: string }).currency_code) ?? "ZAR").toUpperCase() === curr;
  let currencyRules = rules.filter((r) => r.is_active && ruleHasCurrency(r, targetCurrency));
  if (currencyRules.length === 0 && targetCurrency !== "ZAR") {
    currencyRules = rules.filter((r) => r.is_active && ruleHasCurrency(r, "ZAR"));
  }
  const sortedRules = [...currencyRules].sort((a, b) => a.sort_order - b.sort_order);

  for (const rule of sortedRules) {
    const conditions = (rule.conditions || {}) as Record<string, unknown>;
    if (!conditionsMatch(conditions, spec)) continue;

    let multiplier = 1;
    const ruleType = rule.rule_type as PriceLineItem["type"];

    switch (rule.rule_type) {
      case "per_page":
        multiplier = spec.page_count;
        break;
      case "per_document":
        multiplier = 1;
        break;
      case "per_unit":
        multiplier = spec.quantity;
        break;
      case "surcharge":
        multiplier = rule.rule_type === "surcharge" && conditions.is_duplex ? spec.page_count : 1;
        // For per-page surcharges, multiply by pages; for flat surcharges, 1
        if ("is_duplex" in conditions || "is_color" in conditions) {
          multiplier = spec.page_count;
        }
        break;
      case "setup_fee":
        multiplier = 1;
        break;
    }

    lines.push({
      label: rule.name,
      type: ruleType,
      unit_amount: Number(rule.price_value),
      multiplier,
      total: Number(rule.price_value) * multiplier,
    });
  }

  // Layer 2: Option value price impacts
  for (const option of options) {
    const selectedSlug = spec.selected_options[option.name];
    if (!selectedSlug) continue;

    const values = option.values;
    if (!isStructuredValues(values)) continue;

    const selectedValue = values.find((v) => v.slug === selectedSlug);
    if (!selectedValue || selectedValue.price_impact === 0) continue;

    let multiplier = 1;
    switch (selectedValue.price_type) {
      case "per_page":
        multiplier = spec.page_count;
        break;
      case "per_document":
        multiplier = 1;
        break;
      case "fixed":
        multiplier = 1;
        break;
    }

    lines.push({
      label: `${option.name}: ${selectedValue.label}`,
      type: "option",
      unit_amount: selectedValue.price_impact,
      multiplier,
      total: selectedValue.price_impact * multiplier,
    });
  }

  const subtotal_per_unit = lines.reduce((sum, l) => sum + l.total, 0);

  return {
    lines,
    subtotal_per_unit,
    quantity: spec.quantity,
    total: subtotal_per_unit * spec.quantity,
  };
}
