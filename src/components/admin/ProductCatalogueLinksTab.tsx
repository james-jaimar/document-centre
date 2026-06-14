import { useMemo } from "react";
import {
  useCatalogSizes,
  useCatalogPrintAttrs,
  useProductCatalogLinks,
  useSetProductCatalogLink,
} from "@/hooks/useCatalog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

interface Props {
  productFamilyId: string;
}

/**
 * Links a product family to items in the master catalogue.
 * Toggling here decides which sizes / print attrs the storefront offers
 * for this product. Branches can further disable items via
 * branch_catalog_overrides.
 */
export default function ProductCatalogueLinksTab({ productFamilyId }: Props) {
  const { data: sizes = [], isLoading: sizesLoading } = useCatalogSizes();
  const { data: attrs = [], isLoading: attrsLoading } = useCatalogPrintAttrs();
  const { data: links = [] } = useProductCatalogLinks(productFamilyId);
  const setLink = useSetProductCatalogLink();

  const linkedSizes = useMemo(
    () => new Set(links.filter((l) => l.catalog === "size").map((l) => l.item_code)),
    [links],
  );
  const linkedAttrs = useMemo(() => {
    const m = new Map<string, Set<string>>();
    links
      .filter((l) => l.catalog === "print_attr")
      .forEach((l) => {
        const k = l.sub_attribute ?? "";
        if (!m.has(k)) m.set(k, new Set());
        m.get(k)!.add(l.item_code);
      });
    return m;
  }, [links]);

  async function toggleSize(code: string, enabled: boolean) {
    try {
      await setLink.mutateAsync({
        product_family_id: productFamilyId,
        catalog: "size",
        sub_attribute: null,
        item_code: code,
        enabled,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    }
  }

  async function toggleAttr(attribute: string, code: string, enabled: boolean) {
    try {
      await setLink.mutateAsync({
        product_family_id: productFamilyId,
        catalog: "print_attr",
        sub_attribute: attribute,
        item_code: code,
        enabled,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    }
  }

  const attrGroups = attrs.reduce<Record<string, typeof attrs>>((acc, a) => {
    (acc[a.attribute] ||= []).push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Sizes</CardTitle>
          <CardDescription className="text-xs">
            Pick which master sizes this product supports. Branches can disable
            individual sizes for their location.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sizesLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {sizes
                .filter((s) => s.is_active)
                .map((s) => {
                  const on = linkedSizes.has(s.code);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center justify-between gap-2 border rounded-md px-2 py-1.5 bg-background"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Switch
                          checked={on}
                          onCheckedChange={(v) => toggleSize(s.code, v)}
                        />
                        <span className="text-sm truncate">{s.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {Math.round(Number(s.width_mm))}×{Math.round(Number(s.height_mm))}
                      </span>
                    </label>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Print Attributes</CardTitle>
          <CardDescription className="text-xs">
            Colour mode, sides, orientation — pick the values offered for this product.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {attrsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            Object.entries(attrGroups).map(([attribute, rows]) => (
              <div key={attribute}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-sm capitalize">
                    {attribute.replace(/_/g, " ")}
                  </h3>
                  <Badge variant="outline" className="text-xs">{rows.length}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {rows
                    .filter((r) => r.is_active)
                    .map((r) => {
                      const on = linkedAttrs.get(attribute)?.has(r.code) ?? false;
                      return (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 border rounded-md px-2 py-1.5 bg-background"
                        >
                          <Switch
                            checked={on}
                            onCheckedChange={(v) => toggleAttr(attribute, r.code, v)}
                          />
                          <span className="text-sm">{r.label}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
