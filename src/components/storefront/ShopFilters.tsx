import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ShopFilterState {
  types: string[];
  sizes: string[];
  ordering: string[];
  maxPrice: number;
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

interface Props {
  types: FilterOption[];
  sizes: FilterOption[];
  ordering: FilterOption[];
  priceCeiling: number;
  value: ShopFilterState;
  onChange: (next: ShopFilterState) => void;
  formatPriceLabel: (major: number) => string;
}

function toggle(list: string[], item: string) {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

function Group({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!options.length) return null;
  return (
    <div className="border-b py-3.5 first:pt-0 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {options.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <Checkbox
                id={`f-${title}-${opt.value}`}
                checked={selected.includes(opt.value)}
                onCheckedChange={() => onToggle(opt.value)}
              />
              <Label
                htmlFor={`f-${title}-${opt.value}`}
                className="flex flex-1 cursor-pointer items-center justify-between text-[13px] font-normal"
              >
                <span>{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.count}</span>
              </Label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShopFilters({
  types,
  sizes,
  ordering,
  priceCeiling,
  value,
  onChange,
  formatPriceLabel,
}: Props) {
  return (
    <aside className="h-fit rounded-xl border bg-card p-5">
      <h2 className="mb-2 text-sm font-semibold text-foreground">Filters</h2>

      <Group
        title="Product type"
        options={types}
        selected={value.types}
        onToggle={(v) => onChange({ ...value, types: toggle(value.types, v) })}
      />
      <Group
        title="Size"
        options={sizes}
        selected={value.sizes}
        onToggle={(v) => onChange({ ...value, sizes: toggle(value.sizes, v) })}
      />
      <Group
        title="Ordering method"
        options={ordering}
        selected={value.ordering}
        onToggle={(v) => onChange({ ...value, ordering: toggle(value.ordering, v) })}
      />

      {priceCeiling > 0 && (
        <div className="border-t py-3.5">
          <p className="text-[13px] font-semibold text-foreground">Price range</p>
          <div className="mt-3 flex items-center gap-2">
            <Input value={formatPriceLabel(0)} readOnly className="h-8 text-xs" aria-label="Minimum price" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              value={formatPriceLabel(value.maxPrice)}
              readOnly
              className="h-8 text-xs"
              aria-label="Maximum price"
            />
          </div>
          <Slider
            className="mt-4"
            min={0}
            max={priceCeiling}
            step={Math.max(1, Math.round(priceCeiling / 50))}
            value={[value.maxPrice]}
            onValueChange={([v]) => onChange({ ...value, maxPrice: v })}
          />
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="mt-4 w-full"
        onClick={() => onChange({ types: [], sizes: [], ordering: [], maxPrice: priceCeiling })}
      >
        Clear filters
      </Button>
    </aside>
  );
}
