import { useMemo } from "react";
import {
  useCatalogSizes,
  useCatalogPrintAttrs,
  useProductCatalogLinks,
  useSetProductCatalogLink,
  useImpositionTemplates,
  useProductImpositionDefaults,
  useSetProductImposition,
  templateMatchesSize,
} from "@/hooks/useCatalog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  productFamilyId: string;
}

/**
 * Links a product family to items in the master catalogue.
 * Toggling here decides which sizes / print attrs the storefront offers
 * for this product. Branches can further disable items via
 * branch_catalog_overrides. Additionally, per-size press strategy
 * (cut-sheet vs imposed N-up on a parent sheet) is configured here.
 */
export default function ProductCatalogueLinksTab({ productFamilyId }: Props) {
  const { data: sizes = [], isLoading: sizesLoading } = useCatalogSizes();
  const { data: attrs = [], isLoading: attrsLoading } = useCatalogPrintAttrs();
  const { data: links = [] } = useProductCatalogLinks(productFamilyId);
  const { data: templates = [] } = useImpositionTemplates();
  const { data: impositionDefaults = [] } = useProductImpositionDefaults(productFamilyId);
  const setLink = useSetProductCatalogLink();
  const setImposition = useSetProductImposition();

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

  /** Map input_size -> imposition template currently selected (if any). */
  const impositionBySize = useMemo(() => {
    const m = new Map<string, string>();
    impositionDefaults.forEach((d) => {
      const t = templates.find((tt) => tt.id === d.imposition_template_id);
      if (t) m.set(t.input_size.toLowerCase(), t.id);
    });
    return m;
  }, [impositionDefaults, templates]);

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

  async function setSizeStrategy(sizeCode: string, templateId: string | null) {
    try {
      await setImposition.mutateAsync({
        product_family_id: productFamilyId,
        imposition_template_id: templateId,
        input_size_code: sizeCode,
        templates,
      });
      toast.success(templateId ? "Imposition set" : "Set to cut sheet");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    }
  }

  const attrGroups = attrs.reduce<Record<string, typeof attrs>>((acc, a) => {
    (acc[a.attribute] ||= []).push(a);
    return acc;
  }, {});

  const enabledSizes = sizes.filter((s) => s.is_active && linkedSizes.has(s.code));

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

      {/* ----------------- Sheet strategy per enabled size ----------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sheet strategy</CardTitle>
          <CardDescription className="text-xs">
            For each enabled size, choose <strong>Cut sheet 1-up</strong> (print on the same
            paper size — A4 docs on A4, A3 docs on A3) or impose multiple copies on a
            parent sheet (e.g. business cards 24-up on SRA3). Click charges and paper are
            billed on the chosen parent sheet, divided by the n-up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enabledSizes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Enable a size above to configure its sheet strategy.
            </p>
          ) : (
            <div className="space-y-2">
              {enabledSizes.map((s) => {
                const matching = templates.filter(
                  (t) => t.input_size.toLowerCase() === s.code.toLowerCase(),
                );
                const current = impositionBySize.get(s.code.toLowerCase()) ?? "__cut__";
                const currentTpl = templates.find((t) => t.id === current);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 border rounded-md px-3 py-2 bg-background"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {currentTpl
                          ? `Imposed: ${currentTpl.n_up}-up on ${currentTpl.output_size} (${currentTpl.work_style.replace("_", " ")})`
                          : "Cut sheet — billed at document size."}
                      </div>
                    </div>
                    <div className="w-64 shrink-0">
                      <Select
                        value={current}
                        onValueChange={(v) =>
                          setSizeStrategy(s.code, v === "__cut__" ? null : v)
                        }
                        disabled={setImposition.isPending}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__cut__">Cut sheet 1-up</SelectItem>
                          {matching.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.n_up}-up on {t.output_size} — {t.name}
                            </SelectItem>
                          ))}
                          {matching.length === 0 && (
                            <SelectItem value="__none__" disabled>
                              No imposition templates for {s.code.toUpperCase()}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground pt-1">
                Add or edit templates in Platform → Imposition Templates.
              </p>
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
