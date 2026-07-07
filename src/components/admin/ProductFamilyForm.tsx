import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductFamily } from "@/hooks/useProductFamilies";
import { useCatalogSizes, useCatalogPapers } from "@/hooks/useCatalog";

const ICON_OPTIONS = [
  "FileText", "File", "BookOpen", "Book", "Layers", "Printer",
  "Image", "Scissors", "Paperclip", "Package", "Grid", "Layout",
];

const CMYK_PROFILE_OPTIONS = [
  { value: "fogra39", label: "Fogra 39 (ISO Coated v2)" },
  { value: "fogra51", label: "Fogra 51 (PSO Coated v3)" },
];

const RENDER_INTENT_OPTIONS = [
  { value: "relative_colorimetric", label: "Relative Colorimetric (text & docs)" },
  { value: "perceptual", label: "Perceptual (photos)" },
  { value: "absolute_colorimetric", label: "Absolute Colorimetric" },
  { value: "saturation", label: "Saturation" },
];

const ALL_FINISHED_SIZES = [
  "A3L", "A3P", "A4L", "A4P", "A5L", "A5P", "A6P", "DL", "BC",
] as const;

interface PrintingRules {
  allowed_finished_sizes: string[];
  default_finished_size: string;
  cover_is_heavy_stock: boolean;
  force_sra3_when_edge_to_edge: boolean;
  binding_size_inherits_from: string | null;
  min_quantity: number;
}

const DEFAULT_PRINTING_RULES: PrintingRules = {
  allowed_finished_sizes: ["A4P"],
  default_finished_size: "A4P",
  cover_is_heavy_stock: false,
  force_sra3_when_edge_to_edge: true,
  binding_size_inherits_from: null,
  min_quantity: 1,
};

interface QuantityBlock {
  size: string;   // e.g. "a5", "dl", or "*" for any
  paper: string;  // e.g. "gloss_170", or "*" for any
  sides: "single" | "double";
  qty: number;
  price_minor: number;
  cost_minor?: number;
}

interface FormValues {
  name: string;
  slug: string;
  description: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
  color_output: "cmyk" | "rgb";
  cmyk_profile: string;
  render_intent: "relative_colorimetric" | "perceptual" | "absolute_colorimetric" | "saturation";
  pricing_engine: "click_charges" | "photo_prints" | "business_cards";
  printing_rules: PrintingRules;
  quantity_mode: "free" | "blocks";
  quantity_blocks: QuantityBlock[];
}



interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: ProductFamily | null;
  onSubmit: (values: FormValues) => void;
  isPending: boolean;
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function ProductFamilyForm({ open, onOpenChange, family, onSubmit, isPending }: Props) {
  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      icon: "FileText",
      is_active: true,
      sort_order: 0,
      color_output: "cmyk",
      cmyk_profile: "fogra39",
      render_intent: "relative_colorimetric",
      pricing_engine: "click_charges",
      printing_rules: DEFAULT_PRINTING_RULES,
      quantity_mode: "free",
      quantity_blocks: [],
    },
  });

  useEffect(() => {
    const fam = family as (ProductFamily & { printing_rules?: Partial<PrintingRules>; pricing_engine?: FormValues["pricing_engine"]; quantity_mode?: FormValues["quantity_mode"]; quantity_blocks?: QuantityBlock[] }) | null;
    if (fam) {
      form.reset({
        name: fam.name,
        slug: fam.slug,
        description: fam.description || "",
        icon: fam.icon || "FileText",
        is_active: fam.is_active,
        sort_order: fam.sort_order,
        color_output: (fam.color_output as "cmyk" | "rgb") ?? "cmyk",
        cmyk_profile: fam.cmyk_profile ?? "fogra39",
        render_intent: (fam.render_intent as FormValues["render_intent"]) ?? "relative_colorimetric",
        pricing_engine: (fam.pricing_engine as FormValues["pricing_engine"]) ?? "click_charges",
        printing_rules: { ...DEFAULT_PRINTING_RULES, ...((fam.printing_rules as Partial<PrintingRules>) ?? {}) },
        quantity_mode: fam.quantity_mode ?? "free",
        quantity_blocks: Array.isArray(fam.quantity_blocks) ? fam.quantity_blocks : [],
      });
    } else {
      form.reset({
        name: "",
        slug: "",
        description: "",
        icon: "FileText",
        is_active: true,
        sort_order: 0,
        color_output: "cmyk",
        cmyk_profile: "fogra39",
        render_intent: "relative_colorimetric",
        pricing_engine: "click_charges",
        printing_rules: DEFAULT_PRINTING_RULES,
        quantity_mode: "free",
        quantity_blocks: [],
      });
    }
  }, [family, open]);




  const watchName = form.watch("name");
  useEffect(() => {
    if (!family) {
      form.setValue("slug", slugify(watchName));
    }
  }, [watchName, family]);

  const watchColorOutput = form.watch("color_output");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] sm:w-[80vw] max-w-[90vw] sm:max-w-[80vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{family ? "Edit Product Family" : "New Product Family"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: "Name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Wire Bound Documents" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              rules={{ required: "Slug is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl><Input {...field} placeholder="wire-bound" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea {...field} rows={2} placeholder="Brief description…" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icon</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ICON_OPTIONS.map((icon) => (
                        <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-4">
              <FormField
                control={form.control}
                name="sort_order"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 pt-6">
                    <FormLabel>Active</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="pricing_engine"
              rules={{ required: "Pricing engine is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pricing Engine</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select pricing engine" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="click_charges">Click Charges (booklets, flyers, posters, brochures…)</SelectItem>
                      <SelectItem value="photo_prints">Photo Prints (uses Photo Prints rate card)</SelectItem>
                      <SelectItem value="business_cards">Business Cards (uses Business Cards rate card)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Determines which Master Pricing tab supplies the per-unit price for this product.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <QuantityBlocksSection form={form} />



            <div className="space-y-3 rounded-md border bg-muted/30 p-3">

              <div>
                <h4 className="text-sm font-semibold">Print Output</h4>
                <p className="text-xs text-muted-foreground">
                  How files for this product family are prepared for printing.
                </p>
              </div>
              <FormField
                control={form.control}
                name="color_output"
                rules={{ required: "Colour space is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Colour Space</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select colour space" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cmyk">CMYK (laser / inkjet — default)</SelectItem>
                        <SelectItem value="rgb">RGB (dye-sub photo printers only)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {watchColorOutput === "cmyk" && (
                <>
                  <FormField
                    control={form.control}
                    name="cmyk_profile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CMYK Profile</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CMYK_PROFILE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="render_intent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Render Intent</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {RENDER_INTENT_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>

            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div>
                <h4 className="text-sm font-semibold">Printing Rules</h4>
                <p className="text-xs text-muted-foreground">
                  Which finished sizes this product is sold in, and how covers /
                  bleed pick the parent sheet at quote time.
                </p>
              </div>
              <FormField
                control={form.control}
                name="printing_rules.allowed_finished_sizes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Allowed finished sizes</FormLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_FINISHED_SIZES.map((s) => {
                        const checked = (field.value ?? []).includes(s);
                        return (
                          <button
                            type="button"
                            key={s}
                            onClick={() => {
                              const set = new Set(field.value ?? []);
                              if (checked) set.delete(s); else set.add(s);
                              field.onChange(Array.from(set));
                            }}
                            className={`px-2 py-1 rounded text-xs border transition ${
                              checked
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:border-primary/50"
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="printing_rules.default_finished_size"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Default size</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl><SelectTrigger className="h-8"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {ALL_FINISHED_SIZES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="printing_rules.min_quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Min quantity</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} className="h-8" {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="printing_rules.cover_is_heavy_stock"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-2">
                    <FormLabel className="text-xs font-normal">Covers use heavy stock (force SRA3)</FormLabel>
                    <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="printing_rules.force_sra3_when_edge_to_edge"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-2">
                    <FormLabel className="text-xs font-normal">Edge-to-edge selection forces SRA3</FormLabel>
                    <FormControl><Switch checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="printing_rules.binding_size_inherits_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Binding price inherits from</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                      value={field.value ?? "__none__"}
                    >
                      <FormControl><SelectTrigger className="h-8"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">— None —</SelectItem>
                        <SelectItem value="A4">A4 (A5 binding uses A4 price)</SelectItem>
                        <SelectItem value="A3">A3</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : family ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quantity Blocks editor ─────────────────────────────────

import type { UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

function QuantityBlocksSection({ form }: { form: UseFormReturn<FormValues> }) {
  const mode = form.watch("quantity_mode");
  const blocks = form.watch("quantity_blocks") ?? [];
  const allowedSizeCodes = form.watch("printing_rules.allowed_finished_sizes") ?? [];

  const { data: allSizes = [] } = useCatalogSizes({ scope: "master", isActive: true });
  const { data: allPapers = [] } = useCatalogPapers({ scope: "master", isActive: true });

  const sizeOptions = (() => {
    if (allowedSizeCodes.length === 0) return allSizes;
    const allowSet = new Set(allowedSizeCodes.map((c) => c.toLowerCase()));
    const filtered = allSizes.filter((s) => allowSet.has(s.code.toLowerCase()));
    return filtered.length > 0 ? filtered : allSizes;
  })();

  const update = (next: QuantityBlock[]) => {
    const sorted = next.slice().sort((a, b) => {
      const sa = `${a.size ?? "*"}|${a.paper ?? "*"}|${a.sides ?? "single"}`;
      const sb = `${b.size ?? "*"}|${b.paper ?? "*"}|${b.sides ?? "single"}`;
      if (sa !== sb) return sa.localeCompare(sb);
      return a.qty - b.qty;
    });
    form.setValue("quantity_blocks", sorted, { shouldDirty: true });
  };

  const paperLabel = (code: string) => {
    const p = allPapers.find((pp) => pp.code.toLowerCase() === code.toLowerCase());
    if (!p) return code;
    return p.weight_gsm ? `${p.label} ${p.weight_gsm}gsm` : p.label;
  };

  const noCatalogueReady = sizeOptions.length === 0 || allPapers.length === 0;

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div>
        <h4 className="text-sm font-semibold">Quantity Selling Mode</h4>
        <p className="text-xs text-muted-foreground">
          Sell by a free numeric quantity, or as fixed packs (e.g. 50 / 100 / 250 flyers).
        </p>
      </div>
      <FormField
        control={form.control}
        name="quantity_mode"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Mode</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl><SelectTrigger className="h-8"><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="free">Free number (spinner)</SelectItem>
                <SelectItem value="blocks">Fixed pack sizes (blocks)</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />

      {mode === "blocks" && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground px-1">
            Each row is one pack — keyed by size + paper + sides + qty. Choose{" "}
            <code className="text-[10px] bg-muted px-1 rounded">Any</code> for
            size or paper to match every catalogue option.
          </p>
          {noCatalogueReady && (
            <p className="text-[11px] text-amber-600 px-1">
              {sizeOptions.length === 0
                ? "Configure allowed finished sizes first (Printing rules above)."
                : "No papers found in the master catalogue."}
            </p>
          )}
          <div className="grid grid-cols-[140px_200px_100px_90px_1fr_1fr_auto] gap-2 text-[11px] text-muted-foreground px-1">
            <span>Size</span>
            <span>Paper</span>
            <span>Sides</span>
            <span>Qty</span>
            <span>Sell (major)</span>
            <span>Cost (optional)</span>
            <span></span>
          </div>
          {blocks.length === 0 && (
            <p className="text-xs text-muted-foreground italic px-1">
              No pack rows yet. Add a row per size × paper × sides × qty combo you offer.
            </p>
          )}
          {blocks.map((b, i) => {
            const sizeVal = (b.size ?? "*").toLowerCase();
            const paperVal = (b.paper ?? "*").toLowerCase();
            return (
              <div key={i} className="grid grid-cols-[140px_200px_100px_90px_1fr_1fr_auto] gap-2 items-center">
                <Select
                  value={sizeVal}
                  onValueChange={(v) => {
                    const next = [...blocks];
                    next[i] = { ...b, size: v };
                    update(next);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="*">Any (*)</SelectItem>
                    {sizeOptions.map((s) => (
                      <SelectItem key={s.id} value={s.code.toLowerCase()}>
                        {s.label} ({s.code})
                      </SelectItem>
                    ))}
                    {sizeVal !== "*" && !sizeOptions.some((s) => s.code.toLowerCase() === sizeVal) && (
                      <SelectItem value={sizeVal}>{sizeVal} (legacy)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Select
                  value={paperVal}
                  onValueChange={(v) => {
                    const next = [...blocks];
                    next[i] = { ...b, paper: v };
                    update(next);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="*">Any (*)</SelectItem>
                    {allPapers.map((p) => (
                      <SelectItem key={p.id} value={p.code.toLowerCase()}>
                        {paperLabel(p.code)}
                      </SelectItem>
                    ))}
                    {paperVal !== "*" && !allPapers.some((p) => p.code.toLowerCase() === paperVal) && (
                      <SelectItem value={paperVal}>{paperVal} (legacy)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Select
                  value={b.sides ?? "single"}
                  onValueChange={(v) => {
                    const next = [...blocks];
                    next[i] = { ...b, sides: v as "single" | "double" };
                    update(next);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="double">Double</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  className="h-8 text-xs"
                  value={b.qty}
                  onChange={(e) => {
                    const next = [...blocks];
                    next[i] = { ...b, qty: parseInt(e.target.value, 10) || 0 };
                    update(next);
                  }}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-8 text-xs"
                  value={(b.price_minor / 100).toString()}
                  onChange={(e) => {
                    const next = [...blocks];
                    next[i] = { ...b, price_minor: Math.round(parseFloat(e.target.value || "0") * 100) };
                    update(next);
                  }}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-8 text-xs"
                  value={b.cost_minor != null ? (b.cost_minor / 100).toString() : ""}
                  placeholder="—"
                  onChange={(e) => {
                    const raw = e.target.value;
                    const next = [...blocks];
                    next[i] = {
                      ...b,
                      cost_minor: raw === "" ? undefined : Math.round(parseFloat(raw) * 100),
                    };
                    update(next);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => update(blocks.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                const last = blocks[blocks.length - 1];
                update([
                  ...blocks,
                  {
                    size: last?.size ?? "*",
                    paper: last?.paper ?? "*",
                    sides: last?.sides ?? "single",
                    qty: last ? last.qty * 2 : 50,
                    price_minor: 0,
                  },
                ]);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add row
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                const singles = blocks.filter((b) => b.sides === "single");
                const existingKeys = new Set(
                  blocks.map((b) => `${b.size}|${b.paper}|${b.sides}|${b.qty}`),
                );
                const additions = singles
                  .map((s) => ({ ...s, sides: "double" as const }))
                  .filter(
                    (s) => !existingKeys.has(`${s.size}|${s.paper}|${s.sides}|${s.qty}`),
                  );
                if (additions.length === 0) return;
                update([...blocks, ...additions]);
              }}
            >
              Duplicate singles → double
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


