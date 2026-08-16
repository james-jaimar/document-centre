import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProductOptions } from "@/hooks/useProductOptions";
import {
  useBranchProductOptionOverrides,
  useSetBranchProductOptionOverride,
} from "@/hooks/useBranchProductOptionOverrides";
import {
  useProductCatalogLinks,
  useCatalogSizes,
  useCatalogPrintAttrs,
  useBranchCatalogOverrides,
  useSetBranchCatalogOverride,
} from "@/hooks/useCatalog";
import {
  isStructuredValues,
  type StructuredOptionValue,
} from "@/lib/productOptionTypes";
import { useCatalogUnitSystem, twinCodeLookup } from "@/hooks/useCatalogUnitSystem";
import { formatSize } from "@/lib/units";
import { toast } from "sonner";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  productFamilyId: string;
  productFamilyName: string;
}

export default function BranchProductSpecsDialog({
  open,
  onOpenChange,
  branchId,
  productFamilyId,
  productFamilyName,
}: Props) {
  // -------- New master-catalogue model --------
  const { unitSystem } = useCatalogUnitSystem(null, branchId);
  const { data: links = [] } = useProductCatalogLinks(productFamilyId);
  const { data: sizes = [] } = useCatalogSizes({ unitSystem });
  const { data: printAttrs = [] } = useCatalogPrintAttrs();
  const { data: catalogOverrides = [] } = useBranchCatalogOverrides(branchId);
  const setCatalogOverride = useSetBranchCatalogOverride();

  const overrideMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const o of catalogOverrides) {
      m.set(`${o.catalog}::${o.sub_attribute ?? ""}::${o.item_code}`, o.is_enabled);
    }
    return m;
  }, [catalogOverrides]);

  // Master links are authored in metric; map them onto the branch's unit list.
  const sizeByCode = useMemo(() => twinCodeLookup(sizes as any[]), [sizes]);

  const attrByKey = useMemo(
    () => new Map(printAttrs.map((p) => [`${p.attribute}::${p.code}`, p])),
    [printAttrs],
  );

  const linkedSizes = useMemo(
    () =>
      links
        .filter((l) => l.catalog === "size")
        .map((l) => ({ link: l, master: sizeByCode.get(l.item_code) }))
        .filter((x) => x.master)
        .sort((a, b) => (a.link.sort_order - b.link.sort_order) || (a.master!.sort_order - b.master!.sort_order)),
    [links, sizeByCode],
  );

  const linkedAttrGroups = useMemo(() => {
    const groups: Record<string, { link: typeof links[number]; master: NonNullable<ReturnType<typeof attrByKey.get>> }[]> = {};
    for (const l of links) {
      if (l.catalog !== "print_attr" || !l.sub_attribute) continue;
      const master = attrByKey.get(`${l.sub_attribute}::${l.item_code}`);
      if (!master) continue;
      (groups[l.sub_attribute] ||= []).push({ link: l, master });
    }
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => a.master.sort_order - b.master.sort_order);
    }
    return groups;
  }, [links, attrByKey]);

  const isCatalogEnabled = (catalog: string, sub: string | null, code: string, masterActive: boolean) => {
    if (!masterActive) return false;
    const v = overrideMap.get(`${catalog}::${sub ?? ""}::${code}`);
    return v === undefined ? true : v;
  };

  const toggleCatalog = async (
    catalog: "size" | "print_attr",
    sub: string | null,
    code: string,
    next: boolean,
  ) => {
    try {
      await setCatalogOverride.mutateAsync({
        branch_id: branchId,
        catalog,
        sub_attribute: sub,
        item_code: code,
        is_enabled: next,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    }
  };

  // -------- Legacy product_options fallback (for options not yet migrated) --------
  const { data: options = [], isLoading } = useProductOptions(productFamilyId);
  const { data: overrides = [] } = useBranchProductOptionOverrides(branchId);
  const setOverride = useSetBranchProductOptionOverride();

  const legacyDisabledMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const o of overrides) m.set(`${o.product_option_id}::${o.value_slug}`, o.is_enabled);
    return m;
  }, [overrides]);

  const isLegacyEnabled = (oid: string, slug: string) => {
    const v = legacyDisabledMap.get(`${oid}::${slug}`);
    return v === undefined ? true : v;
  };

  const toggleLegacy = async (optionId: string, slug: string, next: boolean) => {
    try {
      await setOverride.mutateAsync({
        branch_id: branchId,
        product_option_id: optionId,
        value_slug: slug,
        is_enabled: next,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    }
  };

  // Hide legacy options whose category is now covered by the catalogue.
  const catalogCoversSize = linkedSizes.length > 0;
  const catalogCoversColour = !!linkedAttrGroups["colour_mode"];
  const catalogCoversSides = !!linkedAttrGroups["sides"];
  const catalogCoversOrientation = !!linkedAttrGroups["orientation"];

  const legacyStructured = options.filter((o) => {
    if (!isStructuredValues(o.values)) return false;
    const n = (o.name ?? "").toLowerCase();
    if (catalogCoversSize && (n === "document size" || n === "paper size" || n === "size")) return false;
    if (catalogCoversColour && (n === "print colour" || n === "print color" || n === "colour" || n === "color" || n === "colour mode")) return false;
    if (catalogCoversSides && (n === "print sides" || n === "sides" || n === "duplex")) return false;
    if (catalogCoversOrientation && n === "orientation") return false;
    return true;
  });

  const attrTitleMap: Record<string, string> = {
    colour_mode: "Print Colour",
    sides: "Print Sides",
    orientation: "Orientation",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{productFamilyName} — Specs available at this branch</DialogTitle>
          <DialogDescription>
            Untick anything this branch doesn't offer. Customers ordering from this
            storefront won't see disabled specs. Sizes and print attributes come from
            the platform's Master Catalogue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {linkedSizes.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Document Size
                  <Badge variant="outline" className="text-xs">Master Catalogue</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {linkedSizes.map(({ link, master }) => {
                  const masterActive = master!.is_active;
                  const code = master!.code;
                  const enabled = isCatalogEnabled("size", null, code, masterActive);
                  return (
                    <div key={link.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                          {master!.label}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {formatSize(Number(master!.width_mm), Number(master!.height_mm), unitSystem)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {code}
                          {!masterActive && " · disabled by platform"}
                        </div>
                      </div>
                      <Switch
                        checked={enabled}
                        disabled={!masterActive || setCatalogOverride.isPending}
                        onCheckedChange={(c) => toggleCatalog("size", null, code, c)}
                      />

                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {Object.entries(linkedAttrGroups).map(([attribute, rows]) => (
            <Card key={attribute}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {attrTitleMap[attribute] ?? attribute}
                  <Badge variant="outline" className="text-xs">Master Catalogue</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {rows.map(({ link, master }) => {
                  const enabled = isCatalogEnabled("print_attr", attribute, link.item_code, master.is_active);
                  return (
                    <div key={link.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{master.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {link.item_code}
                          {!master.is_active && " · disabled by platform"}
                        </div>
                      </div>
                      <Switch
                        checked={enabled}
                        disabled={!master.is_active || setCatalogOverride.isPending}
                        onCheckedChange={(c) => toggleCatalog("print_attr", attribute, link.item_code, c)}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading specs…</p>
          ) : legacyStructured.length === 0 && linkedSizes.length === 0 && Object.keys(linkedAttrGroups).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This product has no per-spec values to toggle. To restrict paper or
              finishing items (e.g. binding types, lamination), use the Branch Rate
              Card.
            </p>
          ) : (
            legacyStructured.map((opt) => {
              const values = opt.values as unknown as StructuredOptionValue[];
              return (
                <Card key={opt.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      {opt.name}
                      {opt.is_required && <Badge variant="secondary" className="text-xs">Required</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {values.map((v) => {
                      const masterActive = v.is_active !== false;
                      const enabled = masterActive && isLegacyEnabled(opt.id, v.slug);
                      return (
                        <div key={v.slug} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{v.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {v.slug}
                              {!masterActive && " · disabled by tenant"}
                            </div>
                          </div>
                          <Switch
                            checked={enabled}
                            disabled={!masterActive || setOverride.isPending}
                            onCheckedChange={(c) => toggleLegacy(opt.id, v.slug, c)}
                          />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
