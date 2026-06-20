import { useEffect, useMemo, useRef, useState } from "react";
import { previewMetadataForFinishingCode } from "@/lib/catalog/optionAdapter";
import {
  useProductOptions,
  useCreateProductOption,
  useUpdateProductOption,
  useDeleteProductOption,
} from "@/hooks/useProductOptions";
import type { ProductOption } from "@/hooks/useProductOptions";
import {
  useCatalogSizes,
  useCatalogPapers,
  useCatalogFinishing,
  useCatalogPrintAttrs,
} from "@/hooks/useCatalog";
import { useRateCardBusinessCards } from "@/hooks/useRateCard";

import type { StructuredOptionValue } from "@/lib/productOptionTypes";
import {
  isStructuredValues,
  slugify,
  groupOptionValues,
  isValueActive,
} from "@/lib/productOptionTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, X, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

const OPTION_TYPES = ["select", "radio", "checkbox", "number", "text"];
const PRICE_TYPES = ["fixed", "per_document", "per_page"] as const;

type OptionSource =
  | "manual"
  | "catalog.sizes"
  | "catalog.papers"
  | "catalog.finishing"
  | "catalog.print_attrs"
  | "rate_card.business_cards";

type BusinessCardAxis = "pack_size" | "sides" | "paper" | "finish";

const BC_AXIS_OPTIONS: { value: BusinessCardAxis; label: string; optionName: string }[] = [
  { value: "pack_size", label: "Pack Size (quantity)", optionName: "Pack Size" },
  { value: "sides", label: "Print Sides", optionName: "Print Sides" },
  { value: "paper", label: "Paper Stock", optionName: "Paper Stock" },
  { value: "finish", label: "Lamination / Finish", optionName: "Lamination" },
];

const SOURCE_OPTIONS: { value: OptionSource; label: string; description: string }[] = [
  { value: "manual", label: "Manual (custom)", description: "You type the values by hand" },
  { value: "catalog.sizes", label: "Document Size (Master Catalogue)", description: "Pulled live from Master Catalogue → Sizes" },
  { value: "catalog.papers", label: "Paper Stock (Master Catalogue)", description: "Pulled live from Master Catalogue → Papers" },
  { value: "catalog.finishing", label: "Finishing (Master Catalogue)", description: "Pulled live from Master Catalogue → Finishing (pick a category)" },
  { value: "catalog.print_attrs", label: "Print Attribute (Master Catalogue)", description: "Pulled live from Master Catalogue → Print Attributes (pick an attribute: colour, sides, orientation). Pricing comes from Master Pricing → Click Charges." },
  { value: "rate_card.business_cards", label: "Business Cards Rate Card (Master Pricing)", description: "Pulled live from Master Pricing → Business Cards (pick an axis: Pack Size, Sides, Paper, Lamination). Final price comes from the matching rate card row." },
];

const MASTER_LINKS: Record<OptionSource, string | null> = {
  manual: null,
  "catalog.sizes": "/admin/master-catalogue",
  "catalog.papers": "/admin/master-pricing",
  "catalog.finishing": "/admin/master-pricing",
  "catalog.print_attrs": "/admin/master-pricing",
  "rate_card.business_cards": "/admin/master-pricing",
};


interface Props {
  productFamilyId: string;
}

interface OptionFormData {
  name: string;
  option_type: string;
  is_required: boolean;
  sort_order: number;
  source: OptionSource;
  finishingCategory: string;
  printAttribute: string;
  businessCardAxis: BusinessCardAxis | "";
}

const emptyOptionForm: OptionFormData = {
  name: "",
  option_type: "select",
  is_required: false,
  sort_order: 0,
  source: "manual",
  finishingCategory: "",
  printAttribute: "",
  businessCardAxis: "",
};


const emptyValue: StructuredOptionValue = {
  label: "",
  slug: "",
  group: "Default",
  price_impact: 0,
  price_type: "per_document",
  is_default: false,
  is_active: true,
  metadata: {},
};

function parseOptionValues(values: unknown): StructuredOptionValue[] {
  if (isStructuredValues(values)) return values as StructuredOptionValue[];
  if (Array.isArray(values)) {
    return (values as unknown[]).map((v) => ({
      ...emptyValue,
      label: String(v),
      slug: slugify(String(v)),
    }));
  }
  return [];
}

function looksLikeCatalogMirror(values: StructuredOptionValue[]): boolean {
  return values.length > 0 && values.every((v) => Boolean((v.metadata as any)?.catalog_code));
}

/* ─── Manual value row (legacy editor) ────────────────────────────── */
function ManualValueRow({
  value,
  onUpdate,
  onRemove,
}: {
  value: StructuredOptionValue;
  onUpdate: (v: StructuredOptionValue) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = isValueActive(value);
  return (
    <div className={`border rounded-md p-2 space-y-2 bg-background ${active ? "" : "opacity-60"}`}>
      <div className="grid grid-cols-12 gap-2 items-center min-w-0">
        <div className="col-span-12 md:col-span-4">
          <Input
            className="h-8 text-sm"
            value={value.label}
            onChange={(e) => onUpdate({ ...value, label: e.target.value, slug: slugify(e.target.value) })}
            placeholder="Label"
          />
        </div>
        <div className="col-span-6 md:col-span-2">
          <Input
            className="h-8 text-xs font-mono"
            value={value.group}
            onChange={(e) => onUpdate({ ...value, group: e.target.value })}
            placeholder="Group"
          />
        </div>
        <div className="col-span-6 md:col-span-3 grid grid-cols-5 gap-1">
          <Input
            className="h-8 text-sm col-span-2"
            type="number"
            step="0.01"
            value={value.price_impact}
            onChange={(e) => onUpdate({ ...value, price_impact: parseFloat(e.target.value) || 0 })}
            placeholder="Price"
          />
          <div className="col-span-3">
            <Select value={value.price_type} onValueChange={(v) => onUpdate({ ...value, price_type: v as StructuredOptionValue["price_type"] })}>
              <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", "/")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="col-span-8 md:col-span-2 flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Switch checked={active} onCheckedChange={(v) => onUpdate({ ...value, is_active: v })} />
            <span className="text-xs text-muted-foreground">On</span>
          </div>
          <div className="flex items-center gap-1">
            <Switch checked={value.is_default} onCheckedChange={(v) => onUpdate({ ...value, is_default: v })} />
            <span className="text-xs text-muted-foreground">Def</span>
          </div>
        </div>
        <div className="col-span-4 md:col-span-1 flex items-center justify-end">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onRemove}>
            <X className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Catalog mirror row (read-only label + 3 controls) ───────────── */
function CatalogValueRow({
  catalogLabel,
  catalogCode,
  catalogSub,
  value,
  onUpdate,
}: {
  catalogLabel: string;
  catalogCode: string;
  catalogSub?: string;
  value: StructuredOptionValue;
  onUpdate: (v: StructuredOptionValue) => void;
}) {
  const active = isValueActive(value);
  return (
    <div className={`border rounded-md p-2 grid grid-cols-12 gap-2 items-center bg-background ${active ? "" : "opacity-60"}`}>
      <div className="col-span-12 md:col-span-5 min-w-0">
        <p className="text-sm font-medium truncate">{catalogLabel}</p>
        <p className="text-xs text-muted-foreground font-mono truncate">
          {catalogCode}{catalogSub ? ` · ${catalogSub}` : ""}
        </p>
      </div>
      <div className="col-span-6 md:col-span-3">
        <div className="flex items-center gap-1">
          <Input
            className="h-8 text-xs"
            type="number"
            step="0.01"
            value={value.price_impact ?? 0}
            onChange={(e) => onUpdate({ ...value, price_impact: parseFloat(e.target.value) || 0 })}
            placeholder="Override price"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Override (blank/0 = use Master Pricing)</p>
      </div>
      <div className="col-span-6 md:col-span-4 flex items-center justify-end gap-3">
        <div className="flex items-center gap-1">
          <Switch checked={active} onCheckedChange={(v) => onUpdate({ ...value, is_active: v })} />
          <span className="text-xs text-muted-foreground">Enabled</span>
        </div>
        <div className="flex items-center gap-1">
          <Switch checked={value.is_default} onCheckedChange={(v) => onUpdate({ ...value, is_default: v })} />
          <span className="text-xs text-muted-foreground">Default</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Grouped values preview for the list table ───────────────────── */
function GroupedValuesPreview({ values }: { values: StructuredOptionValue[] }) {
  if (values.length === 0) return <span className="text-muted-foreground text-xs">No values</span>;
  const groups = groupOptionValues(values);
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(groups).map(([group, items]) => {
        const activeCount = items.filter(isValueActive).length;
        return (
          <div key={group} className="flex items-center gap-0.5">
            <Badge variant="outline" className="text-xs font-semibold">{group}</Badge>
            <span className="text-xs text-muted-foreground">({activeCount}/{items.length})</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────── */
export default function ProductOptionsEditor({ productFamilyId }: Props) {
  const { data: options = [], isLoading } = useProductOptions(productFamilyId);
  const createOption = useCreateProductOption();
  const updateOption = useUpdateProductOption();
  const deleteOption = useDeleteProductOption();

  // Live catalog data (used when source ≠ manual)
  const { data: catSizes = [] } = useCatalogSizes();
  const { data: catPapers = [] } = useCatalogPapers();
  const { data: catFinishing = [] } = useCatalogFinishing();
  const { data: catPrintAttrs = [] } = useCatalogPrintAttrs();
  const { data: rcBusinessCards = [] } = useRateCardBusinessCards({ scope: "master" });


  const finishingCategories = useMemo(
    () => Array.from(new Set(catFinishing.map((f: any) => f.category))).sort(),
    [catFinishing],
  );

  const printAttributes = useMemo(
    () => Array.from(new Set(catPrintAttrs.map((p: any) => p.attribute))).sort(),
    [catPrintAttrs],
  );

  const [optionDialogOpen, setOptionDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<ProductOption | null>(null);
  const [optionForm, setOptionForm] = useState<OptionFormData>(emptyOptionForm);
  const [editValues, setEditValues] = useState<StructuredOptionValue[]>([]);
  // Remembers the last manual value list while admin toggles source
  // between manual and a catalogue, so flipping back to manual doesn't
  // clobber the manual list with the catalogue mirror.
  const manualValuesRef = useRef<StructuredOptionValue[]>([]);
  const prevSourceRef = useRef<OptionSource>("manual");

  /**
   * Build the catalog mirror list whenever source/category changes.
   *
   * Modes:
   *   - `seed`: replace the list with ALL active master rows (for new options or
   *     when the admin changes source/category — they want a fresh list).
   *   - `refresh`: keep the existing saved entries verbatim; only refresh
   *     metadata (label / preview hints / binding spec) from master. Master
   *     rows not already in the saved list are NOT added — the admin's
   *     curated set is the source of truth for what customers see.
   */
  function refreshCatalogMirror(
    form: OptionFormData,
    existing: StructuredOptionValue[],
    mode: "seed" | "refresh" = "seed",
  ) {
    if (form.source === "manual") return existing;
    const byCode = new Map(existing.map((v) => [String(v.metadata?.catalog_code ?? v.slug), v]));

    const make = (
      code: string,
      label: string,
      group: string,
      priceType: StructuredOptionValue["price_type"],
      extraMeta: Record<string, any> = {},
    ): StructuredOptionValue => {
      const prev = byCode.get(code);
      return {
        label,
        slug: code,
        group,
        price_impact: prev?.price_impact ?? 0,
        price_type: prev?.price_type ?? priceType,
        is_default: prev?.is_default ?? false,
        is_active: prev?.is_active ?? true,
        metadata: { ...(prev?.metadata ?? {}), ...extraMeta, catalog_code: code },
      };
    };

    if (form.source === "catalog.sizes") {
      const rows = (catSizes as any[])
        .filter((s) => s.is_active)
        .filter((s) => mode === "seed" || byCode.has(s.code))
        .map((s) =>
          make(s.code, s.label ?? s.code, s.region ?? "Default", "per_document", {
            iso: s.iso,
            width_mm: s.width_mm,
            height_mm: s.height_mm,
          }),
        );
      // Always keep existing entries whose master row is missing (legacy),
      // so the admin can see and clean them up rather than losing them.
      return mode === "refresh" ? mergeKeepUnknown(rows, existing) : rows;
    }
    if (form.source === "catalog.papers") {
      const rows = (catPapers as any[])
        .filter((p) => p.is_active)
        .filter((p) => mode === "seed" || byCode.has(p.code))
        .map((p) =>
          make(p.code, p.label ?? p.code, p.weight_gsm ? `${p.weight_gsm}gsm` : "Default", "per_page", {
            weight_gsm: p.weight_gsm,
            finish: p.finish,
            is_cover_stock: p.is_cover_stock,
          }),
        );
      return mode === "refresh" ? mergeKeepUnknown(rows, existing) : rows;
    }
    if (form.source === "catalog.finishing") {
      const cat = form.finishingCategory;
      if (!cat) return existing;
      const rows = (catFinishing as any[])
        .filter((f) => f.is_active)
        .filter((f) => f.category === cat)
        .filter((f) => mode === "seed" || byCode.has(f.code))
        .map((f) => {
          // Bake preview-engine metadata (front/back/binding_method/etc.)
          // straight into the saved value so the customer preview wires up
          // even when the option is sourced from the catalogue.
          const extra: Record<string, any> = {
            category: cat,
            ...previewMetadataForFinishingCode(f),
          };
          if (f.binding_method) extra.binding_method = f.binding_method;
          if (f.color) extra.color = f.color;
          if (f.size_mm != null) extra.size_mm = f.size_mm;
          if (f.max_sheets != null) extra.max_sheets = f.max_sheets;
          return make(f.code, f.label ?? f.code, cat, "per_document", extra);
        });
      return mode === "refresh" ? mergeKeepUnknown(rows, existing) : rows;
    }
    if (form.source === "catalog.print_attrs") {
      const attr = form.printAttribute;
      if (!attr) return existing;
      const rows = (catPrintAttrs as any[])
        .filter((p) => p.is_active)
        .filter((p) => (p.attribute ?? "") === attr)
        .filter((p) => mode === "seed" || byCode.has(p.code))
        .map((p) =>
          make(p.code, p.label ?? p.code, attr, "per_document", {
            attribute: attr,
            ...(p.metadata ?? {}),
          }),
        );
      return mode === "refresh" ? mergeKeepUnknown(rows, existing) : rows;
    }
    if (form.source === "rate_card.business_cards") {
      const axis = form.businessCardAxis;
      if (!axis) return existing;
      const activeRows = (rcBusinessCards as any[]).filter((r) => r.is_active);
      // Build distinct values per axis. Each value carries metadata so the
      // pricing engine (calculatePrice.ts → business_cards branch) can
      // resolve the right rate card row.
      const distinct = new Map<string, { code: string; label: string; meta: Record<string, any> }>();
      for (const r of activeRows) {
        if (axis === "pack_size") {
          const code = String(r.quantity);
          distinct.set(code, {
            code,
            label: `${r.quantity}`,
            meta: { quantity: Number(r.quantity), axis },
          });
        } else if (axis === "sides") {
          const code = String(r.sides);
          const label = code === "single" ? "Single-sided" : "Double-sided";
          distinct.set(code, { code, label, meta: { sides: code, axis } });
        } else if (axis === "paper") {
          const code = String(r.paper);
          if (code) distinct.set(code, { code, label: code, meta: { paper: code, axis } });
        } else if (axis === "finish") {
          const code = String(r.finish);
          const label =
            code === "none"
              ? "None"
              : code === "gloss-lam"
              ? "Gloss Lamination"
              : code === "matt-lam"
              ? "Matt Lamination"
              : code === "soft-touch"
              ? "Soft Touch"
              : code;
          if (code) distinct.set(code, { code, label, meta: { finish: code, axis } });
        }
      }
      const rows = Array.from(distinct.values())
        .filter((d) => mode === "seed" || byCode.has(d.code))
        .map((d) => make(d.code, d.label, axis, "per_document", d.meta));
      return mode === "refresh" ? mergeKeepUnknown(rows, existing) : rows;
    }
    return existing;
  }


  /**
   * Merge refreshed master rows with any existing saved entries whose code no
   * longer matches a master row. We keep the unknowns at the bottom so the
   * admin can see and clean them up — losing them silently is what caused
   * customer dropdowns to drift from the admin's curated list.
   */
  function mergeKeepUnknown(
    refreshed: StructuredOptionValue[],
    existing: StructuredOptionValue[],
  ): StructuredOptionValue[] {
    const refreshedCodes = new Set(refreshed.map((v) => String(v.metadata?.catalog_code ?? v.slug)));
    const orphans = existing.filter(
      (v) => !refreshedCodes.has(String(v.metadata?.catalog_code ?? v.slug)),
    );
    return [...refreshed, ...orphans];
  }

  // Keep mirror in sync when admin changes source/category mid-dialog.
  // - source change (manual ↔ catalog, or catalog→catalog): full seed
  // - same source, category/master refreshed:
  //     * new option (no saved values yet): seed from master
  //     * editing existing option: refresh metadata only, never auto-add
  //       master rows the admin didn't already enable
  useEffect(() => {
    if (!optionDialogOpen) return;
    const prevSource = prevSourceRef.current;
    const nextSource = optionForm.source;

    if (prevSource !== nextSource) {
      if (prevSource === "manual" && nextSource !== "manual") {
        // Leaving manual — remember the manual values so we can restore them.
        if (!looksLikeCatalogMirror(editValues)) {
          manualValuesRef.current = editValues;
        }
        setEditValues(refreshCatalogMirror(optionForm, [], "seed"));
      } else if (prevSource !== "manual" && nextSource === "manual") {
        // Back to manual — restore.
        setEditValues(manualValuesRef.current);
      } else {
        // catalog → catalog with different kind/category
        setEditValues(refreshCatalogMirror(optionForm, [], "seed"));
      }
      prevSourceRef.current = nextSource;
      return;
    }

    // Same source, but category/axis/master catalogue changed
    if (
      nextSource === "catalog.finishing" ||
      nextSource === "catalog.papers" ||
      nextSource === "catalog.sizes" ||
      nextSource === "catalog.print_attrs" ||
      nextSource === "rate_card.business_cards"
    ) {
      setEditValues((prev) => {
        const isEditingExisting = !!editingOption && prev.length > 0;
        return refreshCatalogMirror(
          optionForm,
          prev,
          isEditingExisting ? "refresh" : "seed",
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionForm.source, optionForm.finishingCategory, optionForm.printAttribute, optionForm.businessCardAxis, catSizes.length, catPapers.length, catFinishing.length, catPrintAttrs.length, rcBusinessCards.length, optionDialogOpen]);




  function openCreateOption() {
    setEditingOption(null);
    setOptionForm(emptyOptionForm);
    setEditValues([]);
    manualValuesRef.current = [];
    prevSourceRef.current = "manual";
    setOptionDialogOpen(true);
  }

  function openEditOption(opt: ProductOption) {
    setEditingOption(opt);
    const src = ((opt as any).source ?? "manual") as OptionSource;
    const cat = (opt as any).source_filter?.category ?? "";
    const attr = (opt as any).source_filter?.attribute ?? "";
    const axis = ((opt as any).source_filter?.axis ?? "") as BusinessCardAxis | "";
    setOptionForm({
      name: opt.name,
      option_type: opt.option_type,
      is_required: opt.is_required,
      sort_order: opt.sort_order,
      source: src,
      finishingCategory: cat,
      printAttribute: attr,
      businessCardAxis: axis,
    });

    const parsed = parseOptionValues(opt.values);
    const manualParsed = parseOptionValues((opt as any).manual_values);
    const manualSnapshot = manualParsed.length > 0
      ? manualParsed
      : src === "manual" && !looksLikeCatalogMirror(parsed)
      ? parsed
      : [];

    setEditValues(src === "manual" && parsed.length === 0 ? manualSnapshot : parsed);
    // Seed the manual snapshot from the persistent backup. If an older row has
    // no backup yet, only trust the current values when the option is manual
    // and they do not look like a catalogue mirror.
    manualValuesRef.current = manualSnapshot;
    prevSourceRef.current = src;
    setOptionDialogOpen(true);
  }

  function addValue() {
    setEditValues([
      ...editValues,
      { ...emptyValue, group: editValues.at(-1)?.group ?? "Default" },
    ]);
  }

  function updateValue(index: number, val: StructuredOptionValue) {
    const next = [...editValues];
    next[index] = val;
    setEditValues(next);
  }

  function removeValue(index: number) {
    setEditValues(editValues.filter((_, i) => i !== index));
  }

  async function handleOptionSubmit() {
    if (!optionForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (optionForm.source === "catalog.finishing" && !optionForm.finishingCategory) {
      toast({ title: "Pick a finishing category", variant: "destructive" });
      return;
    }
    if (optionForm.source === "catalog.print_attrs" && !optionForm.printAttribute) {
      toast({ title: "Pick a print attribute", variant: "destructive" });
      return;
    }
    if (optionForm.source === "rate_card.business_cards" && !optionForm.businessCardAxis) {
      toast({ title: "Pick a Business Cards axis", variant: "destructive" });
      return;
    }
    try {
      const nextManualValues = optionForm.source === "manual"
        ? editValues
        : manualValuesRef.current;
      const safeManualValues = looksLikeCatalogMirror(nextManualValues)
        ? []
        : nextManualValues;
      const payload: any = {
        name: optionForm.name,
        option_type: optionForm.option_type,
        values: editValues as unknown as Json,
        manual_values: safeManualValues as unknown as Json,
        is_required: optionForm.is_required,
        sort_order: optionForm.sort_order,
        source: optionForm.source,
        source_filter:
          optionForm.source === "catalog.finishing"
            ? { category: optionForm.finishingCategory }
            : optionForm.source === "catalog.print_attrs"
            ? { attribute: optionForm.printAttribute }
            : optionForm.source === "rate_card.business_cards"
            ? { axis: optionForm.businessCardAxis }
            : null,
      };

      if (editingOption) {
        await updateOption.mutateAsync({ id: editingOption.id, ...payload });
        toast({ title: "Option updated" });
      } else {
        await createOption.mutateAsync({ product_family_id: productFamilyId, ...payload });
        toast({ title: "Option created" });
      }
      setOptionDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleDeleteOption(id: string) {
    try {
      await deleteOption.mutateAsync(id);
      toast({ title: "Option deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading options…</p>;

  const isCatalog = optionForm.source !== "manual";
  const masterLink = MASTER_LINKS[optionForm.source];

  // Document Sizes are now managed exclusively in the Catalogue tab
  // (product_catalog_links). Hide any catalog.sizes rows from the Options
  // editor so admins have a single source of truth.
  const visibleOptions = options.filter(
    (o) => ((o as any).source ?? "manual") !== "catalog.sizes",
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Product Options</h4>
          <p className="text-xs text-muted-foreground">
            Values come from Master Catalogue / Master Pricing when an option's <em>Source</em> is set to a catalog —
            no hand-typed lists needed.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Document sizes are managed in the <strong>Catalogue</strong> tab.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={openCreateOption}>
          <Plus className="h-3 w-3 mr-1" /> Add Option
        </Button>
      </div>

      {visibleOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No options configured yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Values</TableHead>
              <TableHead>Required</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleOptions.map((opt) => {
              const vals = opt.values;
              const structured = isStructuredValues(vals);
              const count = Array.isArray(vals) ? vals.length : 0;
              const src = ((opt as any).source ?? "manual") as OptionSource;
              const cat = (opt as any).source_filter?.category;
              const attr = (opt as any).source_filter?.attribute;
              const sub = cat ?? attr;
              return (
                <TableRow key={opt.id}>
                  <TableCell className="font-medium">{opt.name}</TableCell>
                  <TableCell>
                    {src === "manual" ? (
                      <Badge variant="outline" className="text-xs">manual</Badge>
                    ) : (
                      <Badge variant="default" className="text-xs">
                        {src.replace("catalog.", "")}{sub ? ` · ${sub}` : ""}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{opt.option_type}</Badge>
                  </TableCell>
                  <TableCell>
                    {structured ? (
                      <GroupedValuesPreview values={vals as StructuredOptionValue[]} />
                    ) : (
                      <Badge variant="outline" className="text-xs">{count} value{count !== 1 ? "s" : ""}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{opt.is_required ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditOption(opt)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteOption(opt.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={optionDialogOpen} onOpenChange={setOptionDialogOpen}>
        <DialogContent className="max-w-[min(1100px,95vw)] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingOption ? "Edit Option" : "New Option"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Source */}
            <div className="space-y-1">
              <Label>Source</Label>
              <Select
                value={optionForm.source}
                onValueChange={(v) => setOptionForm({ ...optionForm, source: v as OptionSource })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {SOURCE_OPTIONS.find((s) => s.value === optionForm.source)?.description}
              </p>
              {masterLink && (
                <Link
                  to={masterLink}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Edit in Master Catalogue <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            {optionForm.source === "catalog.finishing" && (
              <div className="space-y-1">
                <Label>Finishing category</Label>
                <Select
                  value={optionForm.finishingCategory}
                  onValueChange={(v) => setOptionForm({ ...optionForm, finishingCategory: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick a category…" /></SelectTrigger>
                  <SelectContent>
                    {finishingCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {optionForm.source === "catalog.print_attrs" && (
              <div className="space-y-1">
                <Label>Print attribute</Label>
                <Select
                  value={optionForm.printAttribute}
                  onValueChange={(v) => setOptionForm({ ...optionForm, printAttribute: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick an attribute…" /></SelectTrigger>
                  <SelectContent>
                    {printAttributes.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pricing for colour mode and sides comes from Master Pricing → Click Charges.
                </p>
              </div>
            )}

            {/* Option meta */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={optionForm.name}
                  onChange={(e) => setOptionForm({ ...optionForm, name: e.target.value })}
                  placeholder="e.g. Binding"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={optionForm.option_type}
                  onValueChange={(v) => setOptionForm({ ...optionForm, option_type: v })}
                  disabled={isCatalog}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={optionForm.sort_order}
                  onChange={(e) => setOptionForm({ ...optionForm, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Label>Required</Label>
                <Switch
                  checked={optionForm.is_required}
                  onCheckedChange={(v) => setOptionForm({ ...optionForm, is_required: v })}
                />
              </div>
            </div>

            {/* Values */}
            {isCatalog ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Catalog values ({editValues.length})</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Read-only mirror. Toggle enabled/default or set per-family overrides.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditValues(refreshCatalogMirror(optionForm, editValues, "seed"))}
                      title="Replace this list with every active Master Catalogue row for this category"
                    >
                      Reset from Master
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {editValues.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No matching catalog items {optionForm.source === "catalog.finishing" ? "for this category " : ""}yet.
                    </p>
                  ) : (
                    editValues.map((val, idx) => {
                      const code = String(val.metadata?.catalog_code ?? val.slug ?? "");
                      const masterMatch =
                        optionForm.source === "catalog.finishing"
                          ? (catFinishing as any[]).some(
                              (f) => f.code === code && f.category === optionForm.finishingCategory,
                            )
                          : optionForm.source === "catalog.papers"
                            ? (catPapers as any[]).some((p) => p.code === code)
                            : optionForm.source === "catalog.sizes"
                              ? (catSizes as any[]).some((s) => s.code === code)
                              : optionForm.source === "catalog.print_attrs"
                                ? (catPrintAttrs as any[]).some(
                                    (p) => p.code === code && p.attribute === optionForm.printAttribute,
                                  )
                                : true;
                      return (
                        <div key={val.slug || idx} className="space-y-1">
                          {!masterMatch && (
                            <p className="text-[11px] text-amber-600">
                              ⚠ <span className="font-mono">{code || "(no code)"}</span> isn't in the Master Catalogue for this category —
                              customers see the price below, not Master Pricing. Disable it or rename to a master code.
                            </p>
                          )}
                          <CatalogValueRow
                            catalogLabel={val.label}
                            catalogCode={val.slug}
                            catalogSub={
                              (val.metadata?.weight_gsm && `${val.metadata.weight_gsm}gsm`) ||
                              (val.metadata?.iso as string | undefined) ||
                              undefined
                            }
                            value={val}
                            onUpdate={(v) => updateValue(idx, v)}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            ) : (
              ["select", "radio", "checkbox"].includes(optionForm.option_type) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Values ({editValues.length})</Label>
                    <Button size="sm" variant="outline" onClick={addValue}>
                      <Plus className="h-3 w-3 mr-1" /> Add Value
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                    {editValues.map((val, idx) => (
                      <ManualValueRow
                        key={idx}
                        value={val}
                        onUpdate={(v) => updateValue(idx, v)}
                        onRemove={() => removeValue(idx)}
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOptionDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleOptionSubmit}
              disabled={createOption.isPending || updateOption.isPending}
            >
              {editingOption ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
