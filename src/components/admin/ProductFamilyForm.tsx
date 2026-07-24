import { useForm } from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductFamily } from "@/hooks/useProductFamilies";
import { FAMILY_KIND_OPTIONS, type FamilyKind } from "@/lib/products/familyKind";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";


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


interface FormValues {
  name: string;
  slug: string;
  description: string;
  icon: string;
  image_url: string | null;
  kind: FamilyKind;
  is_active: boolean;
  sort_order: number;
  color_output: "cmyk" | "rgb";
  cmyk_profile: string;
  render_intent: "relative_colorimetric" | "perceptual" | "absolute_colorimetric" | "saturation";
  pricing_engine: "click_charges" | "photo_prints" | "business_cards";
  printing_rules: PrintingRules;
  quantity_mode: "free" | "blocks";

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
      image_url: null,
      kind: "custom",
      is_active: true,
      sort_order: 0,
      color_output: "cmyk",
      cmyk_profile: "fogra39",
      render_intent: "relative_colorimetric",
      pricing_engine: "click_charges",
      printing_rules: DEFAULT_PRINTING_RULES,
      quantity_mode: "free",

    },
  });

  useEffect(() => {
    const fam = family as (ProductFamily & { printing_rules?: Partial<PrintingRules>; pricing_engine?: FormValues["pricing_engine"]; quantity_mode?: FormValues["quantity_mode"]; kind?: FamilyKind; image_url?: string | null }) | null;
    if (fam) {
      form.reset({
        name: fam.name,
        slug: fam.slug,
        description: fam.description || "",
        icon: fam.icon || "FileText",
        image_url: fam.image_url ?? null,
        kind: (fam.kind as FamilyKind) ?? "custom",
        is_active: fam.is_active,
        sort_order: fam.sort_order,
        color_output: (fam.color_output as "cmyk" | "rgb") ?? "cmyk",
        cmyk_profile: fam.cmyk_profile ?? "fogra39",
        render_intent: (fam.render_intent as FormValues["render_intent"]) ?? "relative_colorimetric",
        pricing_engine: (fam.pricing_engine as FormValues["pricing_engine"]) ?? "click_charges",
        printing_rules: { ...DEFAULT_PRINTING_RULES, ...((fam.printing_rules as Partial<PrintingRules>) ?? {}) },
        quantity_mode: fam.quantity_mode ?? "free",

      });
    } else {
      form.reset({
        name: "",
        slug: "",
        description: "",
        icon: "FileText",
        image_url: null,
        kind: "custom",
        is_active: true,
        sort_order: 0,
        color_output: "cmyk",
        cmyk_profile: "fogra39",
        render_intent: "relative_colorimetric",
        pricing_engine: "click_charges",
        printing_rules: DEFAULT_PRINTING_RULES,
        quantity_mode: "free",

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
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Template</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FAMILY_KIND_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {FAMILY_KIND_OPTIONS.find((o) => o.value === field.value)?.description}
                  </p>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hero Image</FormLabel>
                  <FormControl>
                    <HeroImageUpload
                      value={field.value ?? ""}
                      onChange={(v) => field.onChange(v || null)}
                      slug={form.watch("slug") || "product"}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Shown on the storefront product card and configurator header.
                  </p>
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

            <QuantityModeSection form={form} />





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

// ─── Quantity mode toggle (just the definition flag — prices live in Master Pricing → Pack Pricing) ─

import type { UseFormReturn } from "react-hook-form";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

function QuantityModeSection({ form }: { form: UseFormReturn<FormValues> }) {
  const mode = form.watch("quantity_mode");
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div>
        <h4 className="text-sm font-semibold">Quantity Selling Mode</h4>
        <p className="text-xs text-muted-foreground">
          Sell by a free numeric quantity, or as fixed packs (e.g. 100 / 250 / 500 flyers).
          Pack prices are managed in{" "}
          <Link
            to="/platform/master-pricing"
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            Master Pricing → Pack Pricing <ExternalLink className="h-3 w-3" />
          </Link>
          .
        </p>
      </div>
      <FormField
        control={form.control}
        name="quantity_mode"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Mode</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="free">Free number (spinner)</SelectItem>
                <SelectItem value="blocks">Fixed pack sizes (blocks)</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
      {mode === "blocks" && (
        <p className="text-[11px] text-muted-foreground">
          Switching to <strong>Fixed pack sizes</strong> enables this family in Master Pricing → Pack Pricing.
          Existing pack rows are preserved.
        </p>
      )}
    </div>
  );
}



