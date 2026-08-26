import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

export interface ShopFilterState {
  types: string[];
  sizes: string[];
  ordering: string[];
  maxPrice: number;
}

interface Props {
  types: string[];
  sizes: string[];
  priceCeiling: number;
  value: ShopFilterState;
  onChange: (next: ShopFilterState) => void;
  formatPriceLabel: (major: number) => string;
}

function toggle(list: string[], item: string) {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

export default function ShopFilters({
  types,
  sizes,
  priceCeiling,
  value,
  onChange,
  formatPriceLabel,
}: Props) {
  const group = (
    title: string,
    options: string[],
    selected: string[],
    key: "types" | "sizes" | "ordering",
  ) =>
    options.length > 0 && (
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {options.map((opt) => (
          <div key={opt} className="flex items-center gap-2">
            <Checkbox
              id={`${key}-${opt}`}
              checked={selected.includes(opt)}
              onCheckedChange={() => onChange({ ...value, [key]: toggle(selected, opt) })}
            />
            <Label htmlFor={`${key}-${opt}`} className="cursor-pointer text-sm font-normal">
              {opt}
            </Label>
          </div>
        ))}
      </div>
    );

  return (
    <aside className="space-y-6 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Filters</h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() =>
            onChange({ types: [], sizes: [], ordering: [], maxPrice: priceCeiling })
          }
        >
          Clear
        </Button>
      </div>

      {group("Product type", types, value.types, "types")}
      {group("Size", sizes, value.sizes, "sizes")}
      {group("Ordering method", ["Customise online", "Upload artwork"], value.ordering, "ordering")}

      {priceCeiling > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Price range
          </p>
          <Slider
            min={0}
            max={priceCeiling}
            step={Math.max(1, Math.round(priceCeiling / 50))}
            value={[value.maxPrice]}
            onValueChange={([v]) => onChange({ ...value, maxPrice: v })}
          />
          <p className="text-xs text-muted-foreground">
            Up to {formatPriceLabel(value.maxPrice)}
          </p>
        </div>
      )}
    </aside>
  );
}
