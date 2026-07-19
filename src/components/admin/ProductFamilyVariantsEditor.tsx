import { useEffect, useMemo, useState } from "react";
import {
  useCatalogVariants,
  useProductVariantLinks,
  useSetProductVariantLinks,
} from "@/hooks/useCatalogVariants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Props {
  productFamilyId: string;
}

/**
 * Per-product-family variant picker. Admin selects which variants apply to
 * this family and picks one as the default. Customers see a "Variant"
 * selector on the configurator and click-charge pricing filters by the
 * chosen variant.
 */
export default function ProductFamilyVariantsEditor({ productFamilyId }: Props) {
  const { data: variants = [] } = useCatalogVariants({ activeOnly: true });
  const { data: links = [] } = useProductVariantLinks(productFamilyId);
  const setLinks = useSetProductVariantLinks();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [defaultId, setDefaultId] = useState<string | null>(null);

  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const l of links) map[l.variant_id] = true;
    setSelected(map);
    setDefaultId(links.find((l) => l.is_default)?.variant_id ?? null);
  }, [links]);

  const dirty = useMemo(() => {
    const original = new Set(links.map((l) => l.variant_id));
    const now = new Set(Object.entries(selected).filter(([, v]) => v).map(([k]) => k));
    if (original.size !== now.size) return true;
    for (const id of now) if (!original.has(id)) return true;
    const origDefault = links.find((l) => l.is_default)?.variant_id ?? null;
    if (origDefault !== defaultId) return true;
    return false;
  }, [links, selected, defaultId]);

  async function save() {
    const rows = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([variant_id], idx) => ({
        variant_id,
        is_default: variant_id === defaultId,
        sort_order: idx * 10,
      }));
    // Guarantee exactly one default when rows exist.
    if (rows.length > 0 && !rows.some((r) => r.is_default)) {
      rows[0].is_default = true;
    }
    try {
      await setLinks.mutateAsync({ productFamilyId, links: rows });
      toast({ title: rows.length === 0 ? "Variants cleared" : "Variants saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Variants</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Tick each variant this product supports and mark one as the default. Once linked, price
          each variant separately on the click-charges tab. Manage the master variant list under
          Platform → Master Pricing → Variants.
        </p>
      </div>

      {variants.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No active variants defined yet. Create them under Platform → Master Pricing → Variants.
        </p>
      ) : (
        <RadioGroup
          value={defaultId ?? ""}
          onValueChange={(v) => setDefaultId(v || null)}
          className="space-y-2"
        >
          {variants.map((v) => {
            const isSelected = !!selected[v.id];
            return (
              <div
                key={v.id}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(c) => {
                    const next = { ...selected, [v.id]: !!c };
                    setSelected(next);
                    // Clear default if the checked-out variant was default.
                    if (!c && defaultId === v.id) setDefaultId(null);
                    // Auto-default the first ticked variant.
                    if (c && !defaultId) setDefaultId(v.id);
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{v.label}</div>
                  {v.description && (
                    <div className="text-[11px] text-muted-foreground truncate">{v.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={v.id} id={`default-${v.id}`} disabled={!isSelected} />
                  <Label htmlFor={`default-${v.id}`} className="text-xs">Default</Label>
                </div>
              </div>
            );
          })}
        </RadioGroup>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={!dirty || setLinks.isPending}>
          Save variants
        </Button>
      </div>
    </Card>
  );
}
