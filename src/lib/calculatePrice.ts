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

// ============================================================================
// Master Rate Card calculator (new pricing engine)
// ============================================================================

import type {
  RateCardClick,
  RateCardPaper,
  RateCardFinishing,
  RateCardPhotoPrint,
} from "@/hooks/useRateCard";
import type { ProductRecipe } from "@/hooks/useProductRecipe";
import { resolvePhotoPrintPrice } from "@/lib/photoPrints/pricing";

export interface RateCardBundle {
  clicks: RateCardClick[];
  papers: RateCardPaper[];
  finishing: RateCardFinishing[];
  photoPrints?: RateCardPhotoPrint[];
}

/**
 * Spec extension for the rate-card calculator. The classic ItemSpec is reused
 * unchanged; we read additional fields from selected_options without forcing
 * a schema migration of stored carts.
 *
 * Conventions on `spec.selected_options` for the new engine:
 *   - "paper":     paper code (e.g. "80gsm-bond-a4")
 *   - "size":      free-text size token (A4, A3, SRA3, A5, …); falls back to "A4"
 *   - "finishing": comma-separated list of finishing codes the customer chose
 *                  on top of the recipe's `required` items.
 *
 * Photo-prints engine reads:
 *   - "Print Size" / "size_slug"   → matches rate_card_photo_prints.size_slug
 *   - "Finish"     / "finish"      → gloss | matte | lustre
 *   - "Border"     / "border_slug" → border slug from PHOTO_BORDER_OPTIONS
 */
export function calculatePriceFromRateCard(
  spec: ItemSpec,
  recipe: ProductRecipe,
  rc: RateCardBundle,
): PriceBreakdown {
  // ---- Photo Prints branch ------------------------------------------------
  if (recipe.engine === "photo_prints") {
    const opts = spec.selected_options ?? {};
    const sizeSlug = String(opts["Print Size"] ?? opts.size_slug ?? "4x6");
    const finish = String(opts["Finish"] ?? opts.finish ?? "gloss");
    const borderSlug = String(opts["Border"] ?? opts.border_slug ?? "none");
    const borderMm = borderSlug === "white_3mm" ? 3 : 0;

    const unit = resolvePhotoPrintPrice(rc.photoPrints ?? [], {
      size_slug: sizeSlug,
      finish,
      border_mm: borderMm,
    });

    const lines: PriceLineItem[] = [
      {
        label: `Photo print ${sizeSlug} ${finish}${borderMm ? ` +${borderMm}mm border` : ""}`,
        type: "per_unit",
        unit_amount: unit,
        multiplier: 1,
        total: unit,
      },
    ];
    return {
      lines,
      subtotal_per_unit: unit,
      quantity: spec.quantity,
      total: unit * spec.quantity,
    };
  }

  // ---- Click-charges (printed pages) branch -------------------------------
  const lines: PriceLineItem[] = [];

  const size = String(spec.selected_options.size ?? "A4");
  const colour = spec.is_color ? "colour" : "mono";
  const sides = spec.is_duplex ? "duplex" : "simplex";

  // 1) Clicks
  if (recipe.uses_click_charges !== false && spec.page_count > 0) {
    const cell = rc.clicks.find(
      (c) =>
        c.is_active &&
        c.size === size &&
        c.colour === colour &&
        c.sides === sides
    );
    if (cell) {
      lines.push({
        label: `Print ${size} ${colour} ${sides}`,
        type: "per_page",
        unit_amount: Number(cell.sell_price),
        multiplier: spec.page_count,
        total: Number(cell.sell_price) * spec.page_count,
      });
    }
  }

  // 2) Paper
  const paperCode =
    (spec.selected_options.paper as string | undefined) ||
    recipe.default_paper_code ||
    null;
  if (paperCode) {
    const paper = rc.papers.find((p) => p.code === paperCode && p.is_active);
    if (paper) {
      // 1 sheet per page when simplex, 1 sheet per 2 pages when duplex.
      const sheets = spec.is_duplex
        ? Math.ceil(spec.page_count / 2)
        : spec.page_count;
      if (sheets > 0) {
        lines.push({
          label: `Paper: ${paper.label}`,
          type: "per_page",
          unit_amount: Number(paper.sell_price),
          multiplier: sheets,
          total: Number(paper.sell_price) * sheets,
        });
      }
    }
  }

  // 3) Finishing — required + customer-selected
  const customerSelected = new Set(
    String(spec.selected_options.finishing ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const finishingCodes = new Set<string>();
  for (const f of recipe.finishing ?? []) {
    if (f.required || customerSelected.has(f.code)) finishingCodes.add(f.code);
  }
  for (const code of finishingCodes) {
    const fin = rc.finishing.find((x) => x.code === code && x.is_active);
    if (!fin) continue;
    let multiplier = 1;
    switch (fin.pricing_basis) {
      case "per_unit":
        multiplier = 1; // per finished book/piece, multiplied by quantity below
        break;
      case "per_sheet":
        multiplier = spec.is_duplex
          ? Math.ceil(spec.page_count / 2)
          : spec.page_count;
        break;
      case "per_page":
        multiplier = spec.page_count;
        break;
      case "per_document":
      case "per_set":
        multiplier = 1;
        break;
      case "per_cut":
        multiplier = 1;
        break;
    }
    lines.push({
      label: `Finishing: ${fin.label}`,
      type: "option",
      unit_amount: Number(fin.sell_price),
      multiplier,
      total: Number(fin.sell_price) * multiplier,
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
