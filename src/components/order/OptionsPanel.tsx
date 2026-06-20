import type { Tables } from "@/integrations/supabase/types";
import { isStructuredValues } from "@/lib/productOptionTypes";
import { humaniseSlug } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

export default function OptionsPanel({
  options,
  selectedOptions,
  onOptionChange,
  familySlug,
  lockedDisplay,
  suppressPriceDeltaFor,
}: OptionsPanelProps) {
  const isMultiSection =
    !!familySlug && MULTI_SECTION_FAMILIES.has(familySlug.toLowerCase());
  const sortedOptions = [...options]
    .filter((o) => (isMultiSection ? !SECTION_CONTROLLED_OPTION_NAMES.has(o.name) : true))
    .sort((a, b) => a.sort_order - b.sort_order);

  const lockedFor = (name: string) => lockedDisplay?.[name];
  const suppressSet = new Set(suppressPriceDeltaFor ?? []);

  // Get current display value for an option
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

  return (
    <div className="space-y-1">
      <Accordion
        type="multiple"
        defaultValue={sortedOptions.map((o) => o.id)}
        className="space-y-0"
      >
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

