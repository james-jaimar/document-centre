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
    },
  });

  useEffect(() => {
    if (family) {
      form.reset({
        name: family.name,
        slug: family.slug,
        description: family.description || "",
        icon: family.icon || "FileText",
        is_active: family.is_active,
        sort_order: family.sort_order,
        color_output: (family.color_output as "cmyk" | "rgb") ?? "cmyk",
        cmyk_profile: family.cmyk_profile ?? "fogra39",
        render_intent: (family.render_intent as FormValues["render_intent"]) ?? "relative_colorimetric",
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
      <DialogContent className="sm:max-w-md">
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
