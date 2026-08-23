import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FAMILY_KIND_OPTIONS, type FamilyKind } from "@/lib/products/familyKind";
import { HeroImageUpload } from "./ProductFamilyForm";
import { useCreateProductFamily } from "@/hooks/useProductFamilies";
import { useCatalogSizes, useCatalogPapers, useUpsertCatalogSize, useSetProductCatalogLink } from "@/hooks/useCatalog";
import { toast } from "sonner";
import { Plus, ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (familyId: string) => void;
}

type PricingEngine = "click_charges" | "photo_prints" | "business_cards";

const KIND_DEFAULTS: Record<FamilyKind, { pricing: PricingEngine; suggestSizes: string[] }> = {
  flat_sheet:      { pricing: "click_charges", suggestSizes: ["a6", "a5", "a4", "a3", "dl"] },
  folded_leaflet:  { pricing: "click_charges", suggestSizes: ["a4", "a3", "dl"] },
  saddle_stitched: { pricing: "click_charges", suggestSizes: ["a5", "a4"] },
  bound_document:  { pricing: "click_charges", suggestSizes: ["a5", "a4"] },
  business_card:   { pricing: "business_cards", suggestSizes: [] },
  large_format:    { pricing: "click_charges", suggestSizes: [] },
  photo_print:     { pricing: "photo_prints", suggestSizes: [] },
  canvas_wrap:     { pricing: "click_charges", suggestSizes: [] },
  custom:          { pricing: "click_charges", suggestSizes: [] },
};

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function NewProductWizard({ open, onOpenChange, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<FamilyKind>("flat_sheet");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [selectedPapers, setSelectedPapers] = useState<Set<string>>(new Set());
  const [pricingEngine, setPricingEngine] = useState<PricingEngine>("click_charges");
  const [submitting, setSubmitting] = useState(false);

  const createFamily = useCreateProductFamily();
  const setLink = useSetProductCatalogLink();
  // New families are authored against the metric catalogue; imperial branches
  // get their own per-unit size links in the Catalogue tab, and papers twin-
  // translate at runtime. Listing only metric rows here keeps the two
  // measurement systems from being mixed into one product.
  const { data: sizes = [] } = useCatalogSizes({ unitSystem: "metric" });
  const { data: papers = [] } = useCatalogPapers({ unitSystem: "metric" });
  const upsertSize = useUpsertCatalogSize();

  const activeSizes = useMemo(() => sizes.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order), [sizes]);
  const activePapers = useMemo(() => papers.filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order), [papers]);

  function reset() {
    setStep(0); setName(""); setSlug(""); setDescription("");
    setKind("flat_sheet"); setImageUrl("");
    setSelectedSizes(new Set()); setSelectedPapers(new Set());
    setPricingEngine("click_charges");
  }

  function handleKindChange(k: FamilyKind) {
    setKind(k);
    setPricingEngine(KIND_DEFAULTS[k].pricing);
    // Pre-check suggested sizes
    const suggested = new Set(KIND_DEFAULTS[k].suggestSizes.map((c) => c.toLowerCase()));
    if (suggested.size > 0) {
      setSelectedSizes(new Set(activeSizes.filter((s) => suggested.has(s.code.toLowerCase())).map((s) => s.code)));
    }
  }

  function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, code: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  async function handleFinish() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSubmitting(true);
    try {
      const finalSlug = slug.trim() || slugify(name);
      const created = await createFamily.mutateAsync({
        name: name.trim(),
        slug: finalSlug,
        description: description.trim() || null,
        icon: "FileText",
        image_url: imageUrl || null,
        kind,
        is_active: true,
        sort_order: 0,
        color_output: "cmyk",
        cmyk_profile: "fogra39",
        render_intent: "relative_colorimetric",
        pricing_engine: pricingEngine,
        printing_rules: { allowed_finished_sizes: Array.from(selectedSizes), default_finished_size: Array.from(selectedSizes)[0] ?? null },
        quantity_mode: kind === "flat_sheet" ? "blocks" : "free",
      } as any);

      // Link selected sizes and papers
      const linkPromises: Promise<any>[] = [];
      for (const code of selectedSizes) {
        linkPromises.push(setLink.mutateAsync({
          product_family_id: created.id, catalog: "size", sub_attribute: null, item_code: code, is_default: false, sort_order: 0, enabled: true, unit_system: "metric",
        }));
      }
      for (const code of selectedPapers) {
        linkPromises.push(setLink.mutateAsync({
          product_family_id: created.id, catalog: "paper", sub_attribute: null, item_code: code, is_default: false, sort_order: 0, enabled: true,
        }));
      }
      await Promise.all(linkPromises);

      toast.success(`Created "${name}" with ${selectedSizes.size} sizes, ${selectedPapers.size} papers.`);
      onCreated?.(created.id);
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  }

  const steps = ["Basics", "Template", "Hero image", "Sizes", "Paper", "Pricing & review"];
  const canNext = (() => {
    if (step === 0) return name.trim().length > 0;
    return true;
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="w-[92vw] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Product</DialogTitle>
          <div className="flex gap-1.5 pt-2">
            {steps.map((s, i) => (
              <div key={s} className={`flex-1 h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} title={s} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            Step {step + 1} of {steps.length} — <strong>{steps[step]}</strong>
          </p>
        </DialogHeader>

        <div className="min-h-[280px] py-2">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>Product name</Label>
                <Input
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }}
                  placeholder="e.g. Vinyl Stickers"
                  autoFocus
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="vinyl-stickers" />
                <p className="text-xs text-muted-foreground mt-1">Used in URLs. Lowercase, dashes only.</p>
              </div>
              <div>
                <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Short marketing description shown on the storefront card." />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Pick the template that best matches this product. It drives the configurator, preview, and pricing defaults.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FAMILY_KIND_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleKindChange(opt.value)}
                    className={`text-left border rounded-lg p-3 transition ${kind === opt.value ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{opt.label}</span>
                      {kind === opt.value && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Upload a hero image shown on the storefront product card. You can skip and add it later.</p>
              <HeroImageUpload value={imageUrl} onChange={setImageUrl} slug={slug || "product"} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Select the finished sizes this product can be ordered in.</p>
                <InlineCustomSizePopover onCreated={(code) => {
                  setSelectedSizes((prev) => new Set(prev).add(code));
                }} createSize={async (row) => { await upsertSize.mutateAsync(row as any); }} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto border rounded-md p-2">
                {activeSizes.map((s) => {
                  const checked = selectedSizes.has(s.code);
                  return (
                    <label key={s.code} className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer ${checked ? "bg-primary/10" : "hover:bg-muted"}`}>
                      <Checkbox checked={checked} onCheckedChange={() => toggleSet(setSelectedSizes, s.code)} />
                      <span className="font-medium uppercase">{s.code}</span>
                      <span className="text-xs text-muted-foreground">{s.width_mm}×{s.height_mm}mm</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{selectedSizes.size} size(s) selected.</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Select the paper stocks available for this product. You can add more later from the catalogue tab.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto border rounded-md p-2">
                {activePapers.map((p) => {
                  const checked = selectedPapers.has(p.code);
                  return (
                    <label key={p.code} className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer ${checked ? "bg-primary/10" : "hover:bg-muted"}`}>
                      <Checkbox checked={checked} onCheckedChange={() => toggleSet(setSelectedPapers, p.code)} />
                      <span className="font-medium flex-1 truncate">{p.label}</span>
                      {p.weight_gsm && <Badge variant="outline" className="text-xs">{p.weight_gsm}gsm</Badge>}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{selectedPapers.size} paper(s) selected.</p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div>
                <Label>Pricing engine</Label>
                <Select value={pricingEngine} onValueChange={(v) => setPricingEngine(v as PricingEngine)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="click_charges">Click Charges (most products)</SelectItem>
                    <SelectItem value="photo_prints">Photo Prints rate card</SelectItem>
                    <SelectItem value="business_cards">Business Cards rate card</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Which Master Pricing tab supplies the per-unit price.</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div><strong>Name:</strong> {name}</div>
                <div><strong>Template:</strong> {FAMILY_KIND_OPTIONS.find((o) => o.value === kind)?.label}</div>
                <div><strong>Sizes:</strong> {selectedSizes.size > 0 ? Array.from(selectedSizes).map((c) => c.toUpperCase()).join(", ") : <em className="text-muted-foreground">none — you can add later</em>}</div>
                <div><strong>Papers:</strong> {selectedPapers.size > 0 ? `${selectedPapers.size} selected` : <em className="text-muted-foreground">none</em>}</div>
                <div><strong>Pricing:</strong> {pricingEngine.replace("_", " ")}</div>
                <div><strong>Hero image:</strong> {imageUrl ? "✓ uploaded" : <em className="text-muted-foreground">none</em>}</div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Create product
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline custom size popover ────────────────────────────────────────────
function InlineCustomSizePopover({
  onCreated,
  createSize,
}: { onCreated: (code: string) => void; createSize: (row: { code: string; label: string; width_mm: number; height_mm: number; is_active: boolean; sort_order: number }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [w, setW] = useState<number | "">("");
  const [h, setH] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!code.trim() || !label.trim() || !w || !h) { toast.error("Fill all fields"); return; }
    setSaving(true);
    try {
      const finalCode = code.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
      await createSize({ code: finalCode, label: label.trim(), width_mm: Number(w), height_mm: Number(h), is_active: true, sort_order: 999 });
      onCreated(finalCode);
      toast.success(`Added size "${label}"`);
      setOpen(false); setCode(""); setLabel(""); setW(""); setH("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add size");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Custom size</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2">
        <p className="text-sm font-medium">Add custom size</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => { setLabel(e.target.value); if (!code) setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")); }} placeholder="e.g. Square 100mm" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="sq-100" />
          </div>
          <div>
            <Label className="text-xs">Width (mm)</Label>
            <Input type="number" value={w} onChange={(e) => setW(e.target.value ? Number(e.target.value) : "")} />
          </div>
          <div>
            <Label className="text-xs">Height (mm)</Label>
            <Input type="number" value={h} onChange={(e) => setH(e.target.value ? Number(e.target.value) : "")} />
          </div>
        </div>
        <Button size="sm" className="w-full" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add size"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
