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
}

// Multi-section bound families control Print Colour / Print Sides per
// section in the upload stage, so we hide them from this global panel.
// Single-section families (flyers, posters, business cards, photo prints,
// brochures, booklets, loose sheets) MUST show them here.
const MULTI_SECTION_FAMILIES = new Set([
  "bound-documents",
  "bound_documents",
  "presentations",
  "ring-binders",
  "ring_binders",
]);

export default function OptionsPanel({
  options,
  selectedOptions,
  onOptionChange,
  familySlug,
}: OptionsPanelProps) {
  const isMultiSection =
    !!familySlug && MULTI_SECTION_FAMILIES.has(familySlug.toLowerCase());
  const SECTION_CONTROLLED = new Set(["Print Colour", "Print Sides"]);
  const sortedOptions = [...options]
    .filter((o) => (isMultiSection ? !SECTION_CONTROLLED.has(o.name) : true))
    .sort((a, b) => a.sort_order - b.sort_order);

  // Get current display value for an option
  const getDisplayValue = (option: ProductOption) => {
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
        {sortedOptions.map((option) => (
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
              <OptionSelector
                option={option}
                value={selectedOptions[option.name] ?? ""}
                onChange={(slug) => onOptionChange(option.name, slug)}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
