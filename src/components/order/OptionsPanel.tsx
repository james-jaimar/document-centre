import { useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { isStructuredValues, type StructuredOptionValue } from "@/lib/productOptionTypes";
import { humaniseSlug } from "@/lib/utils";
import { useMeasurementUnit } from "@/hooks/useMeasurementUnit";

import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import OptionSelector from "./OptionSelector";

type ProductOption = Tables<"product_options">;

interface OptionsPanelProps {
  options: ProductOption[];
  selectedOptions: Record<string, string>;
  onOptionChange: (optionName: string, slug: string) => void;
  /** Product family slug — drives whether Print Colour/Sides are hidden
   *  here (they're hidden only for multi-section bound families that
   *  control them per-section in the upload stage). */
  familySlug?: string;
  /** Option names that should render as read-only display rows instead of
   *  editable selectors. Keyed by option name (case-sensitive match to
   *  `product_options.name`). Used e.g. for Business Cards Document Size,
   *  which is locked to the PDF trim box and not user-changeable. */
  lockedDisplay?: Record<string, { label: string; helper?: string }>;
  /** Option names whose dropdown values should NOT show the seeded
   *  `+R x /doc` price-impact suffix. Used for Business Cards where the
   *  real prices come from the BC matrix + finishing catalogue. */
  suppressPriceDeltaFor?: string[];
  /** When the family is in `blocks` quantity mode, pass the fully-resolved
   *  (branch > tenant > master) pack ladder here. Document Size, Paper and
   *  Print Sides selectors are then derived from the ladder instead of from
   *  `product_options`, so what the customer sees always matches what's
   *  actually priced. */
  packBlocks?: QuantityBlock[];
  blocksActive?: boolean;
  /** When set, restricts the Print Sides selector to just these slug(s).
   *  Used by Flyers to hide the wrong side once the upload's page count
   *  makes it unambiguous. */
  allowedSides?: string[];
  /** Product variants (e.g. Economy / Executive pull-up banner). When
   *  provided and non-empty, a "Variant" selector renders at the top of
   *  the panel and its value is written to `selected_options["Variant"]`. */
  variants?: Array<{ code: string; label: string; description?: string | null }>;
}


// Multi-section bound families control Print Colour / Print Sides per
// section in the upload stage, so we hide them from this global panel.
// Single-section families (flyers, posters, business cards, photo prints,
// brochures, booklets, loose sheets) MUST show them here.
export const MULTI_SECTION_FAMILIES = new Set([
  "bound-documents",
  "bound_documents",
  "presentations",
  "ring-binders",
  "ring_binders",
]);

/** Option names whose pricing inputs (is_color / is_duplex) live on each
 *  document section. For multi-section families they are controlled per
 *  section in the upload UI; for single-section families they sit on the
 *  global OptionsPanel and must mirror down onto the body section. */
export const SECTION_CONTROLLED_OPTION_NAMES = new Set([
  "Print Colour",
  "Print Sides",
]);

/** Option names that are managed by the pack-pricing ladder when a family
 *  is in `blocks` quantity mode. These are hidden from the standard option
 *  list and replaced by pack-derived selectors. Matched case-insensitively. */
const PACK_MANAGED_OPTION_NAMES = new Set([
  "document size",
  "paper",
  "paper stock",
  "print sides",
  "sides",
]);

/** Spec keys the rest of the app already reads for pack-priced items. */
const PACK_SPEC_KEYS = {
  size: "Document Size",
  paper: "Paper",
  sides: "Print Sides",
} as const;

/** Finishing categories where "None" is a valid customer choice. Values
 *  matched against option name (case-insensitive) and against structured
 *  values' `metadata.category` / `group` fields. */
const NONE_ELIGIBLE_CATEGORIES: Array<{
  match: RegExp;
  slug: string;
  label: string;
  group: string;
}> = [
  { match: /staplin?g/i,      slug: "staple-none",     label: "None",         group: "Stapling" },
  { match: /hole[\s_-]?punch/i, slug: "hole-punch-none", label: "None",       group: "Hole Punching" },
  { match: /fold/i,           slug: "fold-none",       label: "None (flat)",  group: "Folding" },
  { match: /bind/i,           slug: "bind-none",       label: "None (loose)", group: "Binding" },
  { match: /collat/i,         slug: "collate-none",    label: "None",         group: "Collating" },
  { match: /packag|packing/i, slug: "pack-none",       label: "None",         group: "Packaging" },
  { match: /trim/i,           slug: "trim-none",       label: "None",         group: "Trimming" },
];

function isNoneLikeValue(v: StructuredOptionValue): boolean {
  const meta = (v.metadata ?? {}) as Record<string, unknown>;
  if (meta.none === true) return true;
  const slug = (v.slug ?? "").toLowerCase();
  if (/(^|[-_])(none|no)([-_]|$)/.test(slug)) return true;
  const label = (v.label ?? "").toLowerCase().trim();
  return label === "none" || label.startsWith("no ") || label.startsWith("none ");
}

/** Return the eligibility descriptor for an option, or null if the option
 *  isn't one of the optional finishing groups that should offer "None". */
function noneCategoryFor(option: ProductOption): (typeof NONE_ELIGIBLE_CATEGORIES)[number] | null {
  const name = option.name ?? "";
  for (const c of NONE_ELIGIBLE_CATEGORIES) {
    if (c.match.test(name)) return c;
  }
  if (isStructuredValues(option.values)) {
    for (const v of option.values) {
      const meta = (v.metadata ?? {}) as Record<string, unknown>;
      const cat = String(meta.category ?? v.group ?? "");
      for (const c of NONE_ELIGIBLE_CATEGORIES) {
        if (c.match.test(cat)) return c;
      }
    }
  }
  return null;
}

/** Return the option, augmented with a leading "None" value when the group
 *  is optional and doesn't already contain a none-like row. Idempotent. */
function withNoneInjected(option: ProductOption): ProductOption {
  if (option.is_required) return option;
  const eligible = noneCategoryFor(option);
  if (!eligible) return option;
  if (!isStructuredValues(option.values)) return option;
  const values = option.values as StructuredOptionValue[];
  const activeValues = values.filter((v) => v.is_active !== false);
  if (activeValues.some(isNoneLikeValue)) return option;

  const anyExistingDefault = values.some((v) => v.is_default);
  const noneValue: StructuredOptionValue = {
    label: eligible.label,
    slug: eligible.slug,
    group: eligible.group,
    price_impact: 0,
    price_type: "per_document",
    is_default: !anyExistingDefault,
    is_active: true,
    metadata: { none: true, category: eligible.group.toLowerCase() },
  };
  return { ...option, values: [noneValue, ...values] as any };
}



export default function OptionsPanel({
  options,
  selectedOptions,
  onOptionChange,
  familySlug,
  lockedDisplay,
  suppressPriceDeltaFor,
  packBlocks,
  blocksActive,
  allowedSides,
  variants,
}: OptionsPanelProps) {
  const isMultiSection =
    !!familySlug && MULTI_SECTION_FAMILIES.has(familySlug.toLowerCase());
  const sortedOptions = [...options]
    .filter((o) => (isMultiSection ? !SECTION_CONTROLLED_OPTION_NAMES.has(o.name) : true))
    .filter((o) =>
      blocksActive ? !PACK_MANAGED_OPTION_NAMES.has(o.name.trim().toLowerCase()) : true,
    )
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(withNoneInjected);


  const lockedFor = (name: string) => lockedDisplay?.[name];
  const suppressSet = new Set(suppressPriceDeltaFor ?? []);

  // Build a helper that resolves a slug to a human label by first looking in
  // the original `options` array (so an admin-defined "A4 (210 × 297mm)"
  // label wins), then falling back to `humaniseSlug`.
  const resolveLabel = useMemo(() => {
    const byNameSlug = new Map<string, string>();
    for (const opt of options) {
      const nameKey = opt.name.trim().toLowerCase();
      if (isStructuredValues(opt.values)) {
        for (const v of opt.values) {
          byNameSlug.set(`${nameKey}::${v.slug}`, v.label);
        }
      }
    }
    return (nameCandidates: string[], slug: string) => {
      for (const n of nameCandidates) {
        const hit = byNameSlug.get(`${n.trim().toLowerCase()}::${slug}`);
        if (hit) return hit;
      }
      return humaniseSlug(slug);
    };
  }, [options]);

  // Derive Size / Paper / Sides value lists from the current pack ladder,
  // cascading each selection so downstream selectors only show combos that
  // actually have a matching pack row.
  const packRows = blocksActive ? (packBlocks ?? []) : [];
  const selectedSize = selectedOptions[PACK_SPEC_KEYS.size] ?? null;
  const selectedPaper = selectedOptions[PACK_SPEC_KEYS.paper] ?? null;
  const selectedSides = selectedOptions[PACK_SPEC_KEYS.sides] ?? null;

  const uniq = (arr: string[]) => Array.from(new Set(arr));

  const sizeValues = useMemo(() => {
    return uniq(packRows.map((b) => b.size).filter((s) => s && s !== "*"));
  }, [packRows]);

  const paperValues = useMemo(() => {
    const filtered = packRows.filter(
      (b) => !selectedSize || b.size === "*" || b.size === selectedSize,
    );
    return uniq(filtered.map((b) => b.paper).filter((p) => p && p !== "*"));
  }, [packRows, selectedSize]);

  const sidesValues = useMemo(() => {
    const filtered = packRows.filter(
      (b) =>
        (!selectedSize || b.size === "*" || b.size === selectedSize) &&
        (!selectedPaper || b.paper === "*" || b.paper === selectedPaper),
    );
    const all = uniq(filtered.map((b) => b.sides));
    if (allowedSides && allowedSides.length > 0) {
      const allow = new Set(allowedSides);
      const restricted = all.filter((s) => allow.has(s));
      return restricted.length > 0 ? restricted : all;
    }
    return all;
  }, [packRows, selectedSize, selectedPaper, allowedSides]);

  type PackRow = {
    key: string;
    specName: string;
    label: string;
    values: string[];
    valueLabelCandidates: string[]; // option names to search for value labels
    sidesLabels?: Record<string, string>;
    current: string | null;
  };

  const packManagedRows: PackRow[] = useMemo(() => {
    if (!blocksActive) return [];
    const rows: PackRow[] = [];
    if (sizeValues.length > 0) {
      rows.push({
        key: "size",
        specName: PACK_SPEC_KEYS.size,
        label: "Document Size",
        values: sizeValues,
        valueLabelCandidates: ["Document Size", "Size"],
        current: selectedSize,
      });
    }
    if (paperValues.length > 0) {
      rows.push({
        key: "paper",
        specName: PACK_SPEC_KEYS.paper,
        label: "Paper Stock",
        values: paperValues,
        valueLabelCandidates: ["Paper Stock", "Paper"],
        current: selectedPaper,
      });
    }
    if (sidesValues.length > 1) {
      rows.push({
        key: "sides",
        specName: PACK_SPEC_KEYS.sides,
        label: "Print Sides",
        values: sidesValues,
        valueLabelCandidates: ["Print Sides", "Sides"],
        sidesLabels: { single: "Single-sided", double: "Double-sided" },
        current: selectedSides,
      });
    }
    return rows;
  }, [blocksActive, sizeValues, paperValues, sidesValues, selectedSize, selectedPaper, selectedSides]);

  const labelForPackValue = (row: PackRow, slug: string) => {
    if (row.sidesLabels && row.sidesLabels[slug]) return fmtLabel(row.sidesLabels[slug]);
    return fmtLabel(resolveLabel(row.valueLabelCandidates, slug));
  };

  // Get current display value for a standard product option
  const getDisplayValue = (option: ProductOption) => {
    const locked = lockedFor(option.name);
    if (locked) return locked.label;
    const selected = selectedOptions[option.name];
    if (!selected) return "Not selected";
    if (isStructuredValues(option.values)) {
      const match = option.values.find((v) => v.slug === selected);
      return match?.label ?? humaniseSlug(selected);
    }
    return selected;
  };

  const packAccordionValues = packManagedRows.map((r) => `pack::${r.key}`);
  const standardAccordionValues = sortedOptions.map((o) => o.id);

  const hasVariants = (variants?.length ?? 0) > 0;
  const selectedVariant = selectedOptions["Variant"] ?? "";
  const variantAccordionValues = hasVariants ? ["variant::selector"] : [];

  return (
    <div className="space-y-1">
      <Accordion
        type="multiple"
        defaultValue={[...variantAccordionValues, ...packAccordionValues, ...standardAccordionValues]}
        className="space-y-0"
      >
        {hasVariants && (
          <AccordionItem
            value="variant::selector"
            className="border-b border-border"
          >
            <AccordionTrigger className="py-2 hover:no-underline">
              <div className="flex items-center justify-between w-full pr-2">
                <span className="text-xs font-medium text-foreground">Variant</span>
                <span className="text-[11px] text-muted-foreground ml-2 truncate max-w-[140px]">
                  {variants!.find((v) => v.code === selectedVariant)?.label ?? "Not selected"}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              <Select
                value={selectedVariant}
                onValueChange={(v) => onOptionChange("Variant", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a variant" />
                </SelectTrigger>
                <SelectContent>
                  {variants!.map((v) => (
                    <SelectItem key={v.code} value={v.code}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {variants!.find((v) => v.code === selectedVariant)?.description && (
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  {variants!.find((v) => v.code === selectedVariant)?.description}
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        )}
        {packManagedRows.map((row) => {
          const current = row.current ?? "";
          const displayLabel = current ? labelForPackValue(row, current) : "Not selected";
          return (
            <AccordionItem
              key={`pack::${row.key}`}
              value={`pack::${row.key}`}
              className="border-b border-border"
            >
              <AccordionTrigger className="py-2 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-2">
                  <span className="text-xs font-medium text-foreground">{row.label}</span>
                  <span className="text-[11px] text-muted-foreground ml-2 truncate max-w-[140px]">
                    {displayLabel}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                <Select
                  value={current}
                  onValueChange={(slug) => onOptionChange(row.specName, slug)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={`Select ${row.label}`}>
                      {current ? labelForPackValue(row, current) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {row.values.map((v) => (
                      <SelectItem key={v} value={v}>
                        {labelForPackValue(row, v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AccordionContent>
            </AccordionItem>
          );
        })}
        {sortedOptions.map((option) => {
          const locked = lockedFor(option.name);
          return (
            <AccordionItem
              key={option.id}
              value={option.id}
              className="border-b border-border"
            >
              <AccordionTrigger className="py-2 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-2">
                  <span className="text-xs font-medium text-foreground">
                    {option.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground ml-2 truncate max-w-[140px]">
                    {getDisplayValue(option)}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                {locked ? (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                    <div className="text-sm font-medium text-foreground">
                      {locked.label}
                    </div>
                    {locked.helper && (
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        {locked.helper}
                      </p>
                    )}
                  </div>
                ) : (
                  <OptionSelector
                    option={option}
                    value={selectedOptions[option.name] ?? ""}
                    onChange={(slug) => onOptionChange(option.name, slug)}
                    suppressPriceDelta={suppressSet.has(option.name)}
                  />

                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
