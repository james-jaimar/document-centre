import type { StructuredOptionValue } from "./productOptionTypes";
import { isStructuredValues } from "./productOptionTypes";
import type { Tables } from "@/integrations/supabase/types";
import type { ProductPriceOverride } from "@/hooks/useProductPriceOverrides";
import { findMatchingOverride } from "@/hooks/useProductPriceOverrides";

type PricingRule = Tables<"pricing_rules">;
type ProductOption = Tables<"product_options">;

/** The spec object stored on order_items.spec — describes a configured document */
export interface ItemSpecSection {
  /** Section label for the breakdown popover (e.g. "Body", "Cover", "Insert") */
  label?: string;
  page_count: number;
  is_color: boolean;
  is_duplex: boolean;
}

export interface ItemSpec {
  page_count: number;
  quantity: number;
  is_color: boolean;
  is_duplex: boolean;
  paper_stock?: string;
  /** Map of option name → selected value slug */
  selected_options: Record<string, string>;
  /**
   * When present, pricing iterates these sections independently — used for
   * mixed colour/duplex bound documents. Each section is billed at its own
   * click rate and contributes its own sheet count. When absent, the engine
   * falls back to the spec-level is_color/is_duplex/page_count fields
   * (correct for single-section products like flyers or posters).
   */
  sections?: ItemSpecSection[];
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
  // Helper: read a selected_options value by any of several keys (case/space tolerant)
  const readSelected = (...names: string[]): string | undefined => {
    for (const n of names) {
      const v = spec.selected_options?.[n];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return undefined;
  };

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
      case "pack_size": {
        // Business cards: pack size lives in selected_options under "Pack Size"
        // (or "pack_size"). Compare as numeric where possible to tolerate
        // "50" vs 50.
        const selected = readSelected("Pack Size", "pack_size", "Pack");
        if (selected === undefined) return false;
        const a = Number(selected);
        const b = Number(value);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          if (a !== b) return false;
        } else if (selected !== String(value)) {
          return false;
        }
        break;
      }
      case "print_size": {
        // Photo prints: print size lives in selected_options under "Print Size"
        // (or "print_size" / "size_slug").
        const selected = readSelected("Print Size", "print_size", "size_slug", "Size");
        if (selected === undefined) return false;
        if (String(selected).toLowerCase() !== String(value).toLowerCase()) return false;
        break;
      }
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
  RateCardBusinessCard,
} from "@/hooks/useRateCard";
import type { ProductRecipe } from "@/lib/productRecipe";
import { resolvePhotoPrintPrice } from "@/lib/photoPrints/pricing";
import type { RateCardPriceBreak, RateCardTable } from "@/hooks/useRateCardPriceBreaks";
import { resolveTier } from "@/hooks/useRateCardPriceBreaks";

export interface RateCardBundle {
  clicks: RateCardClick[];
  papers: RateCardPaper[];
  finishing: RateCardFinishing[];
  photoPrints?: RateCardPhotoPrint[];
  /** Business-cards matrix: (quantity × sides × paper × finish) → price. */
  businessCards?: RateCardBusinessCard[];
  /**
   * Optional: per-line quantity-tier price breaks (flat list across all
   * rate-card tables in the active scope). When present, the engine picks
   * the matching tier's `sell_price` per line based on that line's total
   * billed quantity; absent / unmatched → fall back to the parent row's
   * static `sell_price` (zero-risk for legacy carts).
   */
  priceBreaks?: RateCardPriceBreak[];
  /**
   * Optional: binding spine specifications used to map a selected
   * binding option (Binding: Twin Loop Wire Black, etc.) onto the
   * correct sized rate_card_finishing row (wire-8mm, comb-10mm, ...).
   * When absent, binding falls back to the option's flat price_impact.
   */
  bindingSpecs?: Array<{
    binding_method: string;
    size_mm: number;
    min_sheets: number;
    max_sheets_80gsm: number;
  }>;
}

/**
 * Resolve a rate-card line's effective unit sell price for a given billed
 * quantity using its tiered price breaks. Falls back to `fallback` (the
 * line's static `sell_price`) when no break exists or matches.
 */
function tieredUnit(
  breaks: RateCardPriceBreak[] | undefined,
  table: RateCardTable,
  lineId: string,
  quantity: number,
  fallback: number,
): number {
  if (!breaks || breaks.length === 0) return fallback;
  const forLine = breaks.filter(
    (b) => b.rate_card_table === table && b.rate_card_id === lineId,
  );
  const tier = resolveTier(forLine, quantity);
  if (!tier) return fallback;
  const price = Number(tier.sell_price);
  return Number.isFinite(price) ? price : fallback;
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
  options: ProductOption[] = [],
): PriceBreakdown {
  // ---- Photo Prints branch ------------------------------------------------
  if (recipe.engine === "photo_prints") {
    const opts = spec.selected_options ?? {};
    const sizeSlug = String(opts["Print Size"] ?? opts.size_slug ?? "4x6");
    const finish = String(opts["Finish"] ?? opts.finish ?? "gloss");
    const borderSlug = String(opts["Border"] ?? opts.border_slug ?? "none");
    const borderMm = borderSlug === "white_3mm" ? 3 : 0;

    const unit = resolvePhotoPrintPrice(
      rc.photoPrints ?? [],
      {
        size_slug: sizeSlug,
        finish,
        border_mm: borderMm,
      },
      { breaks: rc.priceBreaks, quantity: spec.quantity },
    );

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

  // ---- Business Cards branch ---------------------------------------------
  if (recipe.engine === "business_cards") {
    const opts = spec.selected_options ?? {};
    // Pack size: prefer explicit metadata.quantity from the selected option,
    // fall back to the spec.quantity field (NewOrder maps Pack Size → qty).
    const packSize = Number(
      (opts["Pack Size"] as any)?.metadata?.quantity ??
        opts["Pack Size"] ??
        spec.quantity ??
        0,
    );
    const sidesRaw = String(
      opts["Print Sides"] ?? opts["sides"] ?? "double",
    ).toLowerCase();
    const sides: "single" | "double" =
      sidesRaw.includes("single") || sidesRaw === "simplex" ? "single" : "double";
    const paper = String(opts["Paper Stock"] ?? opts["paper"] ?? "350gsm Silk");
    const lamination = String(
      opts["Lamination"] ?? opts["finish"] ?? "none",
    ).toLowerCase().trim();

    const matrix = rc.businessCards ?? [];
    // Match by (quantity, sides, paper) only. Lamination is priced
    // separately from the catalogue (per SRA3 sheet, 21-up), so the
    // matrix row should NOT vary by finish — that would double-count or
    // silently drop the lamination charge.
    const exact = matrix.find(
      (r) =>
        r.is_active &&
        r.quantity === packSize &&
        r.sides === sides &&
        r.paper === paper,
    );
    const byQtySides = matrix.find(
      (r) => r.is_active && r.quantity === packSize && r.sides === sides,
    );
    const byQty = matrix.find((r) => r.is_active && r.quantity === packSize);
    const row = exact ?? byQtySides ?? byQty;

    const packPrice = row ? Number(row.sell_price) : 0;
    const billedQty = spec.quantity > 0 ? spec.quantity : 1;

    const lines: PriceLineItem[] = [
      {
        label: row
          ? `Business cards — ${row.label}`
          : `Business cards (pack of ${packSize || "?"}, ${sides}-sided)`,
        type: "per_unit",
        unit_amount: packPrice,
        multiplier: billedQty,
        total: packPrice * billedQty,
      },
    ];

    // ─── Lamination (catalogue-priced, 21-up on SRA3) ───────────────────
    // Business cards are imposed 3×7 = 21-up on a parent SRA3 sheet for
    // lamination accounting. Whole sheets only. The selected slug IS the
    // catalogue code (e.g. matt-lam-ss, lam-gloss-ds) — look it up
    // directly rather than guessing.
    let lamTotal = 0;
    const isNoLam =
      !lamination ||
      lamination === "none" ||
      lamination === "lam-none" ||
      lamination === "no-lamination";
    if (!isNoLam && packSize > 0) {
      const BC_UP = 21;
      const sheets = Math.ceil(packSize / BC_UP) * billedQty;
      const lamRow = (rc.finishing ?? []).find(
        (r) =>
          r.is_active &&
          (r.category ?? "").toLowerCase() === "lamination" &&
          (r.code.toLowerCase() === lamination ||
            r.code.toLowerCase() === `${lamination}-sra3`) &&
          (r.size ?? "").toUpperCase().includes("SRA3"),
      );
      if (lamRow) {
        const unit = Number(lamRow.sell_price);
        lamTotal = unit * sheets;
        lines.push({
          label: `${lamRow.label} — ${sheets} sheet${sheets === 1 ? "" : "s"} (21-up on SRA3)`,
          type: "per_unit",
          unit_amount: unit,
          multiplier: sheets,
          total: lamTotal,
        });
      }
    }


    const total = packPrice * billedQty + lamTotal;
    return {
      lines,
      subtotal_per_unit: packPrice + (billedQty > 0 ? lamTotal / billedQty : 0),
      quantity: billedQty,
      total,
    };
  }


  // ---- Click-charges (printed pages) branch -------------------------------
  //
  // Industry-standard n-up imposition: small finished sizes are imposed on a
  // larger parent sheet (typically A3) and billed as a fraction of that
  // parent's click. Smaller sizes don't have independent click rates — they
  // are derived. Click + paper rows for the small sizes are deactivated in
  // the master rate card so the editor only exposes the two real bases
  // (A4, A3, and optionally SRA3).
  //
  // Convention confirmed with the user: duplex click = price per duplex
  // sheet (two printed faces). So a 20-page duplex document = 10 duplex
  // clicks (at the duplex rate) + 10 sheets of paper.
  const lines: PriceLineItem[] = [];

  // Size key: accept the canonical "size" slot, plus the friendly option
  // names the customer-facing OptionsPanel writes ("Document Size",
  // "Paper Size", "Print Size", "Size"). Normalised to upper-case so
  // catalog codes like "a4" / "sra3" match the rate card's "A4" / "SRA3".
  const rawSize =
    spec.selected_options.size ??
    spec.selected_options["Document Size"] ??
    spec.selected_options["Paper Size"] ??
    spec.selected_options["Print Size"] ??
    spec.selected_options["Size"] ??
    "A4";
  // Strip orientation suffix — "A4-LANDSCAPE" / "A4-PORTRAIT" price the same as "A4".
  const size = String(rawSize).toUpperCase().replace(/-(LANDSCAPE|PORTRAIT)$/, "");

  const SIZE_IMPOSITION: Record<string, { parent: string; nUp: number }> = {
    A4: { parent: "A3", nUp: 2 },
    A5: { parent: "A3", nUp: 4 },
    A6: { parent: "A3", nUp: 8 },
    DL: { parent: "A3", nUp: 6 },
  };

  /**
   * Finishing nUp: when a finishing row is priced per a parent stock
   * (e.g. lamination priced per SRA3) and the finished doc is smaller,
   * one parent sheet covers `nUp` finished sheets. SRA3 is treated as
   * the oversize parent of A3 for bleed/lamination.
   */
  function finishingNUp(rowSize: string | null | undefined): number {
    if (!rowSize) return 1;
    const parent = String(rowSize).toUpperCase();
    const imp = SIZE_IMPOSITION[size];
    if (imp && imp.parent === parent) return imp.nUp;
    // SRA3 parent rolls (lamination) — A3 finished pieces still fit 1-up,
    // but SRA3-priced finishes applied to A4/A5/A6/DL get the A3 imposition.
    if (parent === "SRA3" && imp && imp.parent === "A3") return imp.nUp;
    if (parent === "SRA3" && size === "A3") return 1;
    return 1;
  }

  /** Categories whose per_sheet pricing applies only to the cover, not the body. */
  const COVER_ONLY_CATEGORIES = new Set([
    "lamination",
    "uv",
    "spot_uv",
    "foil",
    "foiling",
    "embossing",
  ]);

  function isCoverOnlyFinishing(category: string | null | undefined, code: string | null | undefined): boolean {
    const cat = String(category ?? "").toLowerCase();
    if (COVER_ONLY_CATEGORIES.has(cat)) return true;
    const c = String(code ?? "").toLowerCase();
    return /^(lam-|matt-lam|gloss-lam|uv-|spot-uv|foil-|emboss)/.test(c);
  }

  /**
   * Resolve the click price for a given finished size + colour + sides.
   * Prefers a direct active row; otherwise derives from the parent sheet.
   * Returns price per **printed sheet at the parent size**.
   */
  function resolveClickRate(
    finishedSize: string,
    cellColour: "mono" | "colour",
    cellSides: "simplex" | "duplex"
  ): { unit: number; sourceSize: string; nUp: number; lineId: string } | null {
    const direct = rc.clicks.find(
      (c) =>
        c.is_active &&
        String(c.size).toUpperCase() === finishedSize &&
        c.colour === cellColour &&
        c.sides === cellSides
    );
    if (direct) return { unit: Number(direct.sell_price), sourceSize: finishedSize, nUp: 1, lineId: direct.id };
    const imp = SIZE_IMPOSITION[finishedSize];
    if (imp) {
      const parent = rc.clicks.find(
        (c) =>
          c.is_active &&
          String(c.size).toUpperCase() === imp.parent &&
          c.colour === cellColour &&
          c.sides === cellSides
      );
      if (parent) return { unit: Number(parent.sell_price), sourceSize: imp.parent, nUp: imp.nUp, lineId: parent.id };
    }
    return null;
  }

  /**
   * Resolve a paper row. The requested code can be either:
   *   - a sized rate-card code (e.g. "80gsm-bond-a4"), or
   *   - a bare catalog_papers.code (e.g. "80gsm-bond") — in which case we
   *     append the finished size before looking up.
   * Falls back to the n-up parent size when no direct row exists.
   */
  function resolvePaper(
    requestedCode: string,
    finishedSize: string
  ): { paper: typeof rc.papers[number]; nUp: number } | null {
    const sizeSuffix = `-${finishedSize.toLowerCase()}`;
    const hasSizeSuffix = /-(a\d|dl|sra3|letter|legal|tabloid)$/i.test(requestedCode);
    const candidate = hasSizeSuffix ? requestedCode : `${requestedCode}${sizeSuffix}`;

    const direct = rc.papers.find((p) => p.code === candidate && p.is_active);
    if (direct) {
      const imp = SIZE_IMPOSITION[finishedSize];
      if (imp && direct.size === imp.parent) return { paper: direct, nUp: imp.nUp };
      return { paper: direct, nUp: 1 };
    }
    const imp = SIZE_IMPOSITION[finishedSize];
    if (imp) {
      const baseCode = hasSizeSuffix
        ? requestedCode.replace(/-(a\d|dl|sra3|letter|legal|tabloid)$/i, "")
        : requestedCode;
      const parentCode = `${baseCode}-${imp.parent.toLowerCase()}`;
      const parent = rc.papers.find((p) => p.code === parentCode && p.is_active);
      if (parent) return { paper: parent, nUp: imp.nUp };
    }
    return null;
  }

  // ---- Build the section list -------------------------------------------
  // Use spec.sections when provided (mixed-colour bound docs). Otherwise
  // fall back to a single virtual section from the spec-level flags
  // (flyers, posters, single-doc products).
  const printableSections: ItemSpecSection[] =
    spec.sections && spec.sections.length > 0
      ? spec.sections.filter((s) => s.page_count > 0)
      : spec.page_count > 0
      ? [
          {
            label: undefined,
            page_count: spec.page_count,
            is_color: spec.is_color,
            is_duplex: spec.is_duplex,
          },
        ]
      : [];

  // 1) Clicks — per section
  let totalSheets = 0;
  if (recipe.uses_click_charges !== false) {
    for (const section of printableSections) {
      const sectionColour = section.is_color ? "colour" : "mono";
      const sectionSides = section.is_duplex ? "duplex" : "simplex";
      // Clicks per section: duplex bills one click per sheet (2 faces);
      // simplex bills one click per face.
      const clicks = section.is_duplex
        ? Math.ceil(section.page_count / 2)
        : section.page_count;
      totalSheets += clicks; // 1 sheet per click regardless of sides
      const rate = resolveClickRate(size, sectionColour, sectionSides);
      if (!rate || clicks === 0) continue;
      // Tiered pricing — total billed parent clicks across the whole run for
      // this line: clicks per piece × finished quantity ÷ nUp (a single
      // parent click prints `nUp` finished pieces).
      const totalParentClicks = Math.max(
        1,
        Math.ceil((clicks * spec.quantity) / rate.nUp),
      );
      const tieredParentUnit = tieredUnit(
        rc.priceBreaks,
        "clicks",
        rate.lineId,
        totalParentClicks,
        rate.unit,
      );
      // n-up: parent rate divided across the imposed pieces.
      const unit = tieredParentUnit / rate.nUp;
      const sectionLabel = section.label ? `${section.label}: ` : "";
      lines.push({
        label: `${sectionLabel}Print ${size} ${sectionColour} ${sectionSides}`,
        type: "per_page",
        unit_amount: unit,
        multiplier: clicks,
        total: unit * clicks,
      });
    }
  }

  // 2) Paper — sum sheets across sections, bill once. Accept both the
  // canonical "paper" slot and the friendly option names the customer UI
  // writes ("Paper Stock", "Paper", "Body Paper"). The customer's
  // Paper Stock picker now emits catalog_papers.code (e.g. "80gsm-bond"),
  // and resolvePaper() appends the current size before the rate-card lookup.
  const paperCode =
    (spec.selected_options.paper as string | undefined) ||
    (spec.selected_options["Paper Stock"] as string | undefined) ||
    (spec.selected_options["Paper"] as string | undefined) ||
    (spec.selected_options["Body Paper"] as string | undefined) ||
    recipe.default_paper_code ||
    null;
  if (paperCode && totalSheets > 0) {
    const resolved = resolvePaper(paperCode, size);
    if (resolved) {
      // Tiered pricing — total parent sheets billed for the entire run.
      const totalParentSheets = Math.max(
        1,
        Math.ceil((totalSheets * spec.quantity) / resolved.nUp),
      );
      const tieredParentUnit = tieredUnit(
        rc.priceBreaks,
        "papers",
        resolved.paper.id,
        totalParentSheets,
        Number(resolved.paper.sell_price),
      );
      const unit = tieredParentUnit / resolved.nUp;
      lines.push({
        label: `Paper: ${resolved.paper.label}`,
        type: "per_page",
        unit_amount: unit,
        multiplier: totalSheets,
        total: unit * totalSheets,
      });
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
  // Cover-only finishes (lamination, UV, foil) are scoped to cover sheets
  // when the spec carries explicit cover sections; otherwise fall back to
  // the whole-book sheet count.
  const coverSections = printableSections.filter((s) => {
    const l = (s.label ?? "").toLowerCase();
    return l.includes("cover") || l === "outside" || l === "inside";
  });
  const coverSheets = coverSections.reduce(
    (acc, s) => acc + (s.is_duplex ? Math.ceil(s.page_count / 2) : s.page_count),
    0,
  );
  for (const code of finishingCodes) {
    const fin = rc.finishing.find((x) => x.code === code && x.is_active);
    if (!fin) continue;
    let multiplier = 1;
    let perSheetParentNUp = 1; // 1 = no imposition saving
    let perSheetScope: "book" | "cover" = "book";
    switch (fin.pricing_basis) {
      case "per_unit":
        multiplier = 1; // per finished book/piece, multiplied by quantity below
        break;
      case "per_sheet": {
        // Decide cover-scope first (lamination etc. is applied only to the cover).
        const coverScoped = isCoverOnlyFinishing(fin.category, fin.code) && coverSheets > 0;
        perSheetScope = coverScoped ? "cover" : "book";
        const sheetsPerPiece = coverScoped ? coverSheets : totalSheets;
        // Convert finished-size sheets to parent (e.g. SRA3) sheets when the
        // rate-card row is priced per oversize parent. Lamination rolls are
        // SRA3 — 1 SRA3 sheet laminates `nUp` finished pieces.
        perSheetParentNUp = finishingNUp(fin.size);
        multiplier = sheetsPerPiece; // per-piece sheets (display only)
        // Run-level parent sheets, with a 1-sheet minimum (you cannot
        // laminate a fraction of a sheet — and the press won't run less).
        const parentSheetsRun = Math.max(
          1,
          Math.ceil((sheetsPerPiece * spec.quantity) / perSheetParentNUp),
        );
        const finUnitParent = tieredUnit(
          rc.priceBreaks,
          "finishing",
          fin.id,
          parentSheetsRun,
          Number(fin.sell_price),
        );
        const runTotal = finUnitParent * parentSheetsRun;
        const perBook = spec.quantity > 0 ? runTotal / spec.quantity : runTotal;
        lines.push({
          label: `Finishing: ${fin.label}${perSheetParentNUp > 1 ? ` (${parentSheetsRun}× ${String(fin.size ?? "").toUpperCase()})` : ""}`,
          type: "option",
          unit_amount: finUnitParent,
          multiplier: parentSheetsRun,
          total: perBook,
        });
        continue;
      }
      case "per_page":
        multiplier = printableSections.reduce((s, x) => s + x.page_count, 0);
        break;
      case "per_document":
      case "per_set":
      case "per_cut":
        multiplier = 1;
        break;
    }
    // Tiered pricing — total billed units for this finishing line across the
    // whole run (multiplier already accounts for per-piece quantity; we then
    // scale by finished quantity for the tier lookup).
    const totalFinishingUnits = Math.max(1, multiplier * spec.quantity);
    const finUnit = tieredUnit(
      rc.priceBreaks,
      "finishing",
      fin.id,
      totalFinishingUnits,
      Number(fin.sell_price),
    );
    lines.push({
      label: `Finishing: ${fin.label}`,
      type: "option",
      unit_amount: finUnit,
      multiplier,
      total: finUnit * multiplier,
    });
    void perSheetParentNUp; void perSheetScope;
  }


  // 4) Product option price impacts (binding, cover, lamination, paper stock
  //    upgrades, etc.). The rate-card engine had previously ignored these,
  //    silently dropping binding / cover / lamination charges. We now mirror
  //    the legacy `calculateItemPrice` behaviour, with one upgrade:
  //
  //    When a selected option value declares `metadata.binding_method`, we
  //    prefer the live `rate_card_finishing` row sized to the document's
  //    sheet count (e.g. `wire-8mm`) over the option's flat `price_impact`.
  //    Mapping: comb→comb, spiral→spiral, twin_loop→wire (rate card stores
  //    twin loop wire under the `wire-` prefix), wire→wire, saddle_stitch→
  //    `saddle-stitch`. If no matching row is found we fall back to the
  //    option's `price_impact` so the charge never silently disappears.
  const methodToCodePrefix: Record<string, string> = {
    comb: "comb",
    spiral: "spiral",
    twin_loop: "wire",
    wire: "wire",
  };
  // Option metadata uses friendly names (twin_loop, spiral, wire) while the
  // `binding_specifications` table uses pitch-specific keys. Map between them.
  const methodToSpecMethod: Record<string, string> = {
    comb: "comb",
    spiral: "spiral_coil",
    twin_loop: "wire_3_1",
    wire: "wire_3_1",
  };

  for (const option of options) {
    const selectedSlug = spec.selected_options[option.name];
    if (!selectedSlug) continue;
    const values = option.values;
    if (!isStructuredValues(values)) continue;
    const selectedValue = values.find((v) => v.slug === selectedSlug);
    if (!selectedValue) continue;

    const metadata = (selectedValue.metadata ?? {}) as Record<string, unknown>;
    const bindingMethod = typeof metadata.binding_method === "string"
      ? (metadata.binding_method as string)
      : null;

    // --- Binding: prefer the rate-card finishing row for the spine size
    //
    // Conservative sizing: we reduce each spec's stated capacity by 15% to
    // leave headroom for covers, light over-stuffing, and paper-stock
    // upgrades — exact binding is often too tight. Tab dividers add bulk
    // far in excess of a plain sheet, so each tab section counts as
    // 2 sheets toward the spine selection (but NOT toward click/paper
    // billing, which already excludes zero-page sections).
    const tabCount = (spec.sections ?? []).filter(
      (s) => (s.label ?? "").toLowerCase() === "tab"
    ).length;
    const bindingSheets = totalSheets + tabCount * 2;
    const CAPACITY_HEADROOM = 0.85;
    if (bindingMethod && bindingSheets > 0) {
      if (bindingMethod === "saddle_stitch" || bindingMethod === "perfect_bind") {
        const code = bindingMethod === "saddle_stitch" ? "saddle-stitch" : "perfect-bind";
        const fin = rc.finishing.find((x) => x.code === code && x.is_active);
        if (fin) {
          const bindUnit = tieredUnit(
            rc.priceBreaks,
            "finishing",
            fin.id,
            Math.max(1, spec.quantity),
            Number(fin.sell_price),
          );
          lines.push({
            label: `Binding: ${fin.label}`,
            type: "option",
            unit_amount: bindUnit,
            multiplier: 1,
            total: bindUnit,
          });
          continue;
        }
      } else {
        const prefix = methodToCodePrefix[bindingMethod];
        const specMethod = methodToSpecMethod[bindingMethod] ?? bindingMethod;
        // Smallest spec that fits the conservative sheet count. If nothing
        // fits (job exceeds every spine), fall back to the largest spec so
        // we still emit a binding charge instead of silently dropping it.
        const ascending = (rc.bindingSpecs ?? [])
          .filter((s) => s.binding_method === specMethod)
          .sort((a, b) => a.size_mm - b.size_mm);
        const matchedSpec =
          ascending.find(
            (s) =>
              bindingSheets >= s.min_sheets &&
              bindingSheets <= Math.floor(s.max_sheets_80gsm * CAPACITY_HEADROOM)
          ) ?? ascending[ascending.length - 1] ?? null;
        if (prefix && matchedSpec) {
          // Rate-card codes use integer mm. Round the spec size, then if
          // that exact code is missing, jump to the next-larger active row.
          const targetMm = Math.round(matchedSpec.size_mm);
          const candidates = rc.finishing
            .filter((x) => x.is_active && x.code.startsWith(`${prefix}-`) && x.code.endsWith("mm"))
            .map((x) => {
              const m = /-(\d+)mm$/.exec(x.code);
              return m ? { row: x, mm: Number(m[1]) } : null;
            })
            .filter((x): x is { row: typeof rc.finishing[number]; mm: number } => !!x)
            .sort((a, b) => a.mm - b.mm);
          const fin =
            candidates.find((c) => c.mm === targetMm)?.row ??
            candidates.find((c) => c.mm >= targetMm)?.row ??
            candidates[candidates.length - 1]?.row ??
            null;
          if (fin) {
            const bindUnit = tieredUnit(
              rc.priceBreaks,
              "finishing",
              fin.id,
              Math.max(1, spec.quantity),
              Number(fin.sell_price),
            );
            lines.push({
              label: `Binding: ${fin.label}`,
              type: "option",
              unit_amount: bindUnit,
              multiplier: 1,
              total: bindUnit,
            });
            // Colour uplift: when the customer-visible binding option
            // declares a non-zero `color_uplift_minor` (e.g. Spiral Clear,
            // Twin Loop Silver), add it on top of the size-resolved base.
            const upliftMinor = Number(
              (metadata as any).color_uplift_minor ?? 0,
            );
            if (Number.isFinite(upliftMinor) && upliftMinor > 0) {
              const uplift = upliftMinor / 100;
              const colour = String((metadata as any).color ?? "").trim();
              lines.push({
                label: colour ? `Binding colour: ${colour}` : "Binding colour upgrade",
                type: "option",
                unit_amount: uplift,
                multiplier: 1,
                total: uplift,
              });
            }
            continue;
          }
        }
      }
      // Fall through to price_impact fallback below if no rate-card match
    }



    // Resolve a size-aware price from `metadata.prices_by_size` (injected by
    // the catalog overlay from `catalog_finishing_prices`). Falls back to the
    // option value's flat `price_impact` when no size-specific row exists.
    const pricesBySize = (metadata.prices_by_size ?? null) as
      | Record<string, number>
      | null;
    const sizeKey = String(size ?? "").toLowerCase();
    // Parent-sheet detection for per_sheet basis: an explicit
    // `metadata.parent_size` wins; otherwise we infer the parent from
    // `prices_by_size` (presence of an SRA3 or A3-parent price row means
    // this finish runs on the parent stock — e.g. lamination on SRA3).
    const optionNameLc = option.name.toLowerCase();
    const looksCoverOnly =
      /lamin|^uv\b|spot.?uv|foil|emboss/.test(optionNameLc) ||
      metadata.scope === "cover";
    const explicitParent = typeof metadata.parent_size === "string"
      ? String(metadata.parent_size).toLowerCase()
      : null;
    const impInfo = SIZE_IMPOSITION[size] ?? null;
    const inferredParent = pricesBySize && impInfo && typeof pricesBySize[impInfo.parent.toLowerCase()] === "number"
      ? impInfo.parent.toLowerCase()
      : pricesBySize && typeof pricesBySize["sra3"] === "number" && (size === "A3" || impInfo?.parent === "A3")
        ? "sra3"
        : null;
    const parentSizeKey = explicitParent ?? inferredParent;
    const sizedPrice =
      pricesBySize && parentSizeKey && typeof pricesBySize[parentSizeKey] === "number"
        ? pricesBySize[parentSizeKey]
        : pricesBySize && typeof pricesBySize[sizeKey] === "number"
          ? pricesBySize[sizeKey]
          : pricesBySize && typeof pricesBySize.any === "number"
            ? pricesBySize.any
            : null;
    const unitAmount = sizedPrice ?? selectedValue.price_impact ?? 0;
    if (!unitAmount) continue;

    // `metadata.pricing_basis` mirrors `catalog_finishing.pricing_basis` and
    // tells us how to scale the unit price for this configuration.
    const basis = String(metadata.pricing_basis ?? "").toLowerCase();
    let multiplier = 1;
    if (basis === "per_sheet") {
      const coverScoped = looksCoverOnly && coverSheets > 0;
      const sheetsPerPiece = (coverScoped ? coverSheets : totalSheets) || 1;
      const nUp = parentSizeKey ? finishingNUp(parentSizeKey) : 1;
      const parentSheetsRun = Math.max(
        1,
        Math.ceil((sheetsPerPiece * spec.quantity) / nUp),
      );
      const runTotal = unitAmount * parentSheetsRun;
      const perBook = spec.quantity > 0 ? runTotal / spec.quantity : runTotal;
      lines.push({
        label: `${option.name}: ${selectedValue.label}${nUp > 1 ? ` (${parentSheetsRun}× ${parentSizeKey?.toUpperCase()})` : ""}`,
        type: "option",
        unit_amount: unitAmount,
        multiplier: parentSheetsRun,
        total: perBook,
      });
      continue;
    }
    switch (basis) {
      case "per_page":
        multiplier =
          printableSections.reduce((s, x) => s + x.page_count, 0) ||
          spec.page_count ||
          1;
        break;
      case "per_set":
      case "per_cut":
      case "per_document":
      case "per_unit":
      case "":
      default:
        // Legacy price_type fallback for options that don't carry pricing_basis.
        if (!basis) {
          switch (selectedValue.price_type) {
            case "per_page":
              multiplier =
                printableSections.reduce((s, x) => s + x.page_count, 0) ||
                spec.page_count ||
                1;
              break;
            default:
              multiplier = 1;
          }
        } else {
          multiplier = 1;
        }
        break;
    }
    lines.push({
      label: `${option.name}: ${selectedValue.label}`,
      type: "option",
      unit_amount: unitAmount,
      multiplier,
      total: unitAmount * multiplier,
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
