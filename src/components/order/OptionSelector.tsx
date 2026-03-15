import type { Tables } from "@/integrations/supabase/types";
import {
  isStructuredValues,
  groupOptionValues,
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

  // Structured values — group them
  const groups = groupOptionValues(values);
  const groupNames = Object.keys(groups);
  const selectedValue = values.find((v) => v.slug === value);

  // Format price display
  const formatPrice = (val: StructuredOptionValue) => {
    if (val.price_impact === 0) return "";
    const sign = val.price_impact > 0 ? "+" : "";
    const suffix =
      val.price_type === "per_page"
        ? "/pg"
        : val.price_type === "per_document"
        ? "/doc"
        : "";
    return ` (${sign}R${val.price_impact.toFixed(2)}${suffix})`;
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
