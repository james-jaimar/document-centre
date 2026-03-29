import type { Tables } from "@/integrations/supabase/types";
import { isStructuredValues } from "@/lib/productOptionTypes";
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
}

export default function OptionsPanel({
  options,
  selectedOptions,
  onOptionChange,
}: OptionsPanelProps) {
  const sortedOptions = [...options].sort((a, b) => a.sort_order - b.sort_order);

  // Get current display value for an option
  const getDisplayValue = (option: ProductOption) => {
    const selected = selectedOptions[option.name];
    if (!selected) return "Not selected";
    if (isStructuredValues(option.values)) {
      const match = option.values.find((v) => v.slug === selected);
      return match?.label ?? selected;
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
