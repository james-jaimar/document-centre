import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  normalizeAddons,
  normalizeOptions,
  slugify,
  type AddonKind,
  type PricingAddon,
  type PricingOption,
} from "@/lib/pricing/packOptions";

interface Props {
  options: PricingOption[];
  addons: PricingAddon[];
  saving?: boolean;
  /** When false, only the extras editor is shown (tenant/branch overrides). */
  allowOptionEditing?: boolean;
  onSave: (next: { options: PricingOption[]; addons: PricingAddon[] }) => Promise<void> | void;
}

const KIND_LABELS: Record<AddonKind, string> = {
  percent: "% of job price",
  fixed: "Fixed per job",
  per_unit: "Per unit",
};

export default function FamilyPricingOptionsEditor({
  options,
  addons,
  saving = false,
  allowOptionEditing = true,
  onSave,
}: Props) {
  const [opts, setOpts] = useState<PricingOption[]>(normalizeOptions(options));
  const [adds, setAdds] = useState<PricingAddon[]>(normalizeAddons(addons));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setOpts(normalizeOptions(options));
    setAdds(normalizeAddons(addons));
    setDirty(false);
  }, [options, addons]);

  const patchOption = (i: number, patch: Partial<PricingOption>) => {
    setOpts((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
    setDirty(true);
  };
  const patchAddon = (i: number, patch: Partial<PricingAddon>) => {
    setAdds((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
    setDirty(true);
  };

  return (
    <div className="space-y-5 rounded-lg border bg-card p-4">
      {allowOptionEditing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold">Pricing options</h4>
              <p className="text-[11px] text-muted-foreground">
                A finishing axis for this product (e.g. "Untrimmed flat sheet" vs "Complete
                deskpad"). Each option gets its own quantity ladder below. Leave empty for
                products that don't need it.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setOpts((p) => [...p, { slug: `option_${p.length + 1}`, label: "", sort: p.length }]);
                setDirty(true);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Option
            </Button>
          </div>
          {opts.length === 0 ? (
            <p className="text-[11px] italic text-muted-foreground">No pricing options.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_180px_90px_auto] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>Label</span>
                <span>Slug</span>
                <span className="text-center">Trade only</span>
                <span />
              </div>
              {opts.map((o, i) => (
                <div key={i} className="grid grid-cols-[1fr_180px_90px_auto] items-center gap-2">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Label shown to the customer"
                    value={o.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      const autoSlug = !o.label || o.slug === slugify(o.label);
                      patchOption(i, autoSlug ? { label, slug: slugify(label) || o.slug } : { label });
                    }}
                  />
                  <Input
                    className="h-8 font-mono text-[11px]"
                    placeholder="slug"
                    value={o.slug}
                    onChange={(e) => patchOption(i, { slug: slugify(e.target.value) })}
                  />
                  <div className="flex justify-center">
                    <Checkbox
                      checked={!!o.trade_only}
                      onCheckedChange={(v) => patchOption(i, { trade_only: v === true })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setOpts((p) => p.filter((_, idx) => idx !== i));
                      setDirty(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">
                Changing a slug detaches existing pack rows priced against the old slug. Trade-only
                options (and their price ladders) are hidden from customers who aren't marked as
                trade.
              </p>
            </div>
          )}

        </div>
      )}

      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">Paid extras</h4>
            <p className="text-[11px] text-muted-foreground">
              Optional add-ons the customer can switch on — watermark printing, printed proof, and
              so on. All amounts are ex VAT.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAdds((p) => [
                ...p,
                { slug: `extra_${p.length + 1}`, label: "", kind: "fixed", amount: 0, default_on: false, sort: p.length },
              ]);
              setDirty(true);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Extra
          </Button>
        </div>
        {adds.length === 0 ? (
          <p className="text-[11px] italic text-muted-foreground">No extras.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_150px_110px_90px_auto] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>Label</span>
              <span>Charge type</span>
              <span>Amount</span>
              <span>Default on</span>
              <span />
            </div>
            {adds.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_150px_110px_90px_auto] items-center gap-2">
                <Input
                  className="h-8 text-xs"
                  placeholder="Watermark printing"
                  value={a.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    const autoSlug = !a.label || a.slug === slugify(a.label);
                    patchAddon(i, autoSlug ? { label, slug: slugify(label) || a.slug } : { label });
                  }}
                />
                <Select value={a.kind} onValueChange={(v) => patchAddon(i, { kind: v as AddonKind })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABELS) as AddonKind[]).map((k) => (
                      <SelectItem key={k} value={k} className="text-xs">{KIND_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  className="h-8 text-xs"
                  value={String(a.amount)}
                  onChange={(e) => patchAddon(i, { amount: parseFloat(e.target.value || "0") || 0 })}
                />
                <div className="flex justify-center">
                  <Checkbox
                    checked={!!a.default_on}
                    onCheckedChange={(v) => patchAddon(i, { default_on: v === true })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setAdds((p) => p.filter((_, idx) => idx !== i));
                    setDirty(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-3">
        {onRevert && (
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => onRevert()}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            {revertLabel ?? "Revert to inherited"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={() =>
            onSave({ options: normalizeOptions(opts), addons: normalizeAddons(adds) })
          }
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving…" : allowOptionEditing ? "Save options & extras" : "Save extras"}
        </Button>
      </div>
      <Label className="sr-only">pricing options</Label>
    </div>
  );
}
