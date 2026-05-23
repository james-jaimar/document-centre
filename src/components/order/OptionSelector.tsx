import type { Tables } from "@/integrations/supabase/types";
import {
  isStructuredValues,
  groupOptionValues,
  isValueActive,
  type StructuredOptionValue,
} from "@/lib/productOptionTypes";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { formatPriceDelta } from "@/lib/formatCurrency";

type ProductOption = Tables<"product_options">;

interface OptionSelectorProps {
  option: ProductOption;
  value: string;
  onChange: (slug: string) => void;
}

export default function OptionSelector({
  option,
  value,
  onChange,
}: OptionSelectorProps) {
  const { region } = useRegionalPricing();
  const currency = region?.currency_code ?? "ZAR";
  const values = option.values;

  if (!isStructuredValues(values)) {
    // Fallback for flat string arrays
    const flatValues = Array.isArray(values) ? (values as string[]) : [];
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={`Select ${option.name}`} />
        </SelectTrigger>
        <SelectContent>
          {flatValues.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Structured values — hide inactive ones but keep the currently-selected value visible
  // so previously-saved orders still display their label.
  const visibleValues = values.filter((v) => isValueActive(v) || v.slug === value);
  const groups = groupOptionValues(visibleValues);
  const groupNames = Object.keys(groups);
  const selectedValue = values.find((v) => v.slug === value);

  // Format price delta for an option value
  const formatPrice = (val: StructuredOptionValue) => {
    if (val.price_impact === 0) return "";
    const suffix =
      val.price_type === "per_page"
        ? "/pg"
        : val.price_type === "per_document"
        ? "/doc"
        : "";
    return ` (${formatPriceDelta(val.price_impact, currency)}${suffix})`;
  };

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={`Select ${option.name}`}>
          {selectedValue?.label ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {groupNames.length === 1 && groupNames[0] === "General" ? (
          // No grouping needed
          groups["General"].map((v) => (
            <SelectItem key={v.slug} value={v.slug}>
              {v.label}
              {formatPrice(v) && (
                <span className="text-muted-foreground text-xs ml-1">
                  {formatPrice(v)}
                </span>
              )}
            </SelectItem>
          ))
        ) : (
          groupNames.map((groupName) => (
            <SelectGroup key={groupName}>
              <SelectLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {groupName}
              </SelectLabel>
              {groups[groupName].map((v) => (
                <SelectItem key={v.slug} value={v.slug}>
                  {v.label}
                  {formatPrice(v) && (
                    <span className="text-muted-foreground text-xs ml-1">
                      {formatPrice(v)}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectGroup>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
