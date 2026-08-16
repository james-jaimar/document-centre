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
import {
  useProductCatalogLinks,
  useCatalogSizes,
  useCatalogPrintAttrs,
  useCatalogPapers,
  useCatalogFinishing,
  useTenantCatalogOverrides,
  useSetTenantCatalogOverride,
  type ProductCatalogLink,
} from "@/hooks/useCatalog";
import { useCatalogUnitSystem, twinCodeLookup } from "@/hooks/useCatalogUnitSystem";
import { formatSize } from "@/lib/units";

import { toast } from "sonner";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  productFamilyId: string;
  productFamilyName: string;
}

type CatalogKind = ProductCatalogLink["catalog"];

const attrTitleMap: Record<string, string> = {
  colour_mode: "Print Colour",
  sides: "Print Sides",
  orientation: "Orientation",
};

export default function TenantProductSpecsDialog({
  open,
  onOpenChange,
  tenantId,
  productFamilyId,
  productFamilyName,
}: Props) {
  const { unitSystem } = useCatalogUnitSystem(tenantId);
  const { data: links = [] } = useProductCatalogLinks(productFamilyId);
  const { data: sizes = [] } = useCatalogSizes({ unitSystem });
  const { data: printAttrs = [] } = useCatalogPrintAttrs();
  const { data: papers = [] } = useCatalogPapers({ unitSystem });
  const { data: finishing = [] } = useCatalogFinishing({ unitSystem });
  const { data: overrides = [] } = useTenantCatalogOverrides(tenantId);
  const setOverride = useSetTenantCatalogOverride();

  const overrideMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const o of overrides) {
      m.set(`${o.catalog}::${o.sub_attribute ?? ""}::${o.item_code}`, o.is_enabled);
    }
    return m;
  }, [overrides]);

  // Master links are authored in metric; map them onto the active unit list.
  const sizeByCode = useMemo(() => twinCodeLookup(sizes as any[]), [sizes]);
  const attrByKey = useMemo(
    () => new Map(printAttrs.map((p) => [`${p.attribute}::${p.code}`, p])),
    [printAttrs],
  );
  const paperByCode = useMemo(() => twinCodeLookup(papers as any[]), [papers]);
  const finishByCode = useMemo(() => twinCodeLookup(finishing as any[]), [finishing]);


  const linkedSizes = useMemo(
    () =>
      links
        .filter((l) => l.catalog === "size")
        .map((l) => ({ link: l, master: sizeByCode.get(l.item_code) }))
        .filter((x) => x.master)
        .sort((a, b) => a.link.sort_order - b.link.sort_order),
    [links, sizeByCode],
  );

  const linkedAttrGroups = useMemo(() => {
    const groups: Record<string, { link: ProductCatalogLink; master: any }[]> = {};
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

  const linkedPapers = useMemo(
    () =>
      links
        .filter((l) => l.catalog === "paper")
        .map((l) => ({ link: l, master: paperByCode.get(l.item_code) }))
        .filter((x) => x.master)
        .sort((a, b) => a.link.sort_order - b.link.sort_order),
    [links, paperByCode],
  );

  const linkedFinishing = useMemo(
    () =>
      links
        .filter((l) => l.catalog === "finishing")
        .map((l) => ({ link: l, master: finishByCode.get(l.item_code) }))
        .filter((x) => x.master)
        .sort((a, b) => a.link.sort_order - b.link.sort_order),
    [links, finishByCode],
  );

  const isEnabled = (catalog: CatalogKind, sub: string | null, code: string, masterActive: boolean) => {
    if (!masterActive) return false;
    const v = overrideMap.get(`${catalog}::${sub ?? ""}::${code}`);
    return v === undefined ? true : v;
  };

  const toggle = async (
    catalog: CatalogKind,
    sub: string | null,
    code: string,
    next: boolean,
  ) => {
    try {
      await setOverride.mutateAsync({
        tenant_id: tenantId,
        catalog,
        sub_attribute: sub,
        item_code: code,
        is_enabled: next,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    }
  };

  const nothing =
    linkedSizes.length === 0 &&
    Object.keys(linkedAttrGroups).length === 0 &&
    linkedPapers.length === 0 &&
    linkedFinishing.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{productFamilyName} — Specs available to your tenancy</DialogTitle>
          <DialogDescription>
            Set tenant-wide defaults. Untick anything your tenancy never offers
            (e.g. lustre paper, lamination). Individual branches can still
            override these defaults in their own Branch Specs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {linkedSizes.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Size
                  <Badge variant="outline" className="text-xs">Master Catalogue</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {linkedSizes.map(({ link, master }) => {
                  const active = master!.is_active;
                  const code = master!.code;
                  const enabled = isEnabled("size", null, code, active);
                  return (
                    <Row
                      key={link.id}
                      title={master!.label}
                      meta={`${formatSize(Number(master!.width_mm), Number(master!.height_mm), unitSystem)} · ${code}`}
                      masterActive={active}
                      enabled={enabled}
                      pending={setOverride.isPending}
                      onChange={(c) => toggle("size", null, code, c)}
                    />
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
                  const enabled = isEnabled("print_attr", attribute, link.item_code, master.is_active);
                  return (
                    <Row
                      key={link.id}
                      title={master.label}
                      meta={link.item_code}
                      masterActive={master.is_active}
                      enabled={enabled}
                      pending={setOverride.isPending}
                      onChange={(c) => toggle("print_attr", attribute, link.item_code, c)}
                    />
                  );
                })}
              </CardContent>
            </Card>
          ))}

          {linkedPapers.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Paper
                  <Badge variant="outline" className="text-xs">Master Catalogue</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {linkedPapers.map(({ link, master }) => {
                  const code = master!.code;
                  const weight =
                    unitSystem === "imperial"
                      ? master!.weight_lb != null
                        ? `${master!.weight_lb}lb${master!.lb_basis ? ` ${master!.lb_basis}` : ""}`
                        : "?"
                      : `${master!.weight_gsm ?? "?"}gsm`;
                  const enabled = isEnabled("paper", null, code, master!.is_active);
                  return (
                    <Row
                      key={link.id}
                      title={master!.label}
                      meta={`${weight} · ${master!.finish ?? ""} · ${code}`}
                      masterActive={master!.is_active}
                      enabled={enabled}
                      pending={setOverride.isPending}
                      onChange={(c) => toggle("paper", null, code, c)}
                    />
                  );
                })}

              </CardContent>
            </Card>
          )}

          {linkedFinishing.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Finishing
                  <Badge variant="outline" className="text-xs">Master Catalogue</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {linkedFinishing.map(({ link, master }) => {
                  const code = master!.code;
                  const enabled = isEnabled("finishing", null, code, master!.is_active);
                  return (
                    <Row
                      key={link.id}
                      title={master!.label}
                      meta={`${master!.category ?? ""}${master!.variant ? " · " + master!.variant : ""} · ${code}`}
                      masterActive={master!.is_active}
                      enabled={enabled}
                      pending={setOverride.isPending}
                      onChange={(c) => toggle("finishing", null, code, c)}
                    />
                  );
                })}

              </CardContent>
            </Card>
          )}

          {nothing && (
            <p className="text-sm text-muted-foreground">
              This product has no catalogue-linked specs to toggle yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  title,
  meta,
  masterActive,
  enabled,
  pending,
  onChange,
}: {
  title: string;
  meta: string;
  masterActive: boolean;
  enabled: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">
          {meta}
          {!masterActive && " · disabled by platform"}
        </div>
      </div>
      <Switch
        checked={enabled}
        disabled={!masterActive || pending}
        onCheckedChange={onChange}
      />
    </div>
  );
}
