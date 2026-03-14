import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import type { PricingRule } from "@/hooks/usePricingRules";
import type { ProductFamily } from "@/hooks/useProductFamilies";
import type { Json } from "@/integrations/supabase/types";

const RULE_TYPES = [
  { value: "per_page", label: "Per Page" },
  { value: "per_document", label: "Per Document" },
  { value: "per_unit", label: "Per Unit" },
  { value: "surcharge", label: "Surcharge" },
  { value: "setup_fee", label: "Setup Fee" },
];

interface Conditions {
  min_pages?: number;
  max_pages?: number;
  is_color?: boolean;
  paper_stock?: string[];
  min_quantity?: number;
  max_quantity?: number;
}

interface FormValues {
  name: string;
  product_family_id: string;
  rule_type: string;
  price_value: number;
  is_active: boolean;
  sort_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: PricingRule | null;
  families: ProductFamily[];
  onSubmit: (values: FormValues & { conditions: Json }) => void;
  isPending: boolean;
}

export default function PricingRuleForm({ open, onOpenChange, rule, families, onSubmit, isPending }: Props) {
  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      product_family_id: "",
      rule_type: "per_page",
      price_value: 0,
      is_active: true,
      sort_order: 0,
    },
  });

  const [conditions, setConditions] = useState<Conditions>({});
  const [newPaperStock, setNewPaperStock] = useState("");

  useEffect(() => {
    if (rule) {
      form.reset({
        name: rule.name,
        product_family_id: rule.product_family_id || "",
        rule_type: rule.rule_type,
        price_value: rule.price_value,
        is_active: rule.is_active,
        sort_order: rule.sort_order,
      });
      const c = (rule.conditions && typeof rule.conditions === "object" && !Array.isArray(rule.conditions))
        ? rule.conditions as unknown as Conditions
        : {};
      setConditions(c);
    } else {
      form.reset({
        name: "",
        product_family_id: "",
        rule_type: "per_page",
        price_value: 0,
        is_active: true,
        sort_order: 0,
      });
      setConditions({});
    }
  }, [rule, open]);

  function handleFormSubmit(values: FormValues) {
    const cleanConditions: Record<string, unknown> = {};
    if (conditions.min_pages !== undefined) cleanConditions.min_pages = conditions.min_pages;
    if (conditions.max_pages !== undefined) cleanConditions.max_pages = conditions.max_pages;
    if (conditions.is_color !== undefined) cleanConditions.is_color = conditions.is_color;
    if (conditions.paper_stock?.length) cleanConditions.paper_stock = conditions.paper_stock;
    if (conditions.min_quantity !== undefined) cleanConditions.min_quantity = conditions.min_quantity;
    if (conditions.max_quantity !== undefined) cleanConditions.max_quantity = conditions.max_quantity;

    onSubmit({
      ...values,
      product_family_id: values.product_family_id || null as any,
      conditions: cleanConditions as Json,
    });
  }

  function addPaperStock() {
    const trimmed = newPaperStock.trim();
    if (trimmed && !(conditions.paper_stock || []).includes(trimmed)) {
      setConditions({ ...conditions, paper_stock: [...(conditions.paper_stock || []), trimmed] });
      setNewPaperStock("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit Pricing Rule" : "New Pricing Rule"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: "Name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. B&W per page base rate" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="product_family_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Family (optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="All families" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">All families</SelectItem>
                      {families.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="rule_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rule Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RULE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price_value"
                rules={{ required: "Price is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price Value</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Conditions editor */}
            <div className="space-y-3 rounded-md border p-3">
              <h4 className="text-sm font-semibold text-foreground">Conditions (match criteria)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Min Pages</Label>
                  <Input
                    type="number"
                    value={conditions.min_pages ?? ""}
                    onChange={(e) => setConditions({ ...conditions, min_pages: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="—"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max Pages</Label>
                  <Input
                    type="number"
                    value={conditions.max_pages ?? ""}
                    onChange={(e) => setConditions({ ...conditions, max_pages: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="—"
                  />
                </div>
                <div>
                  <Label className="text-xs">Min Quantity</Label>
                  <Input
                    type="number"
                    value={conditions.min_quantity ?? ""}
                    onChange={(e) => setConditions({ ...conditions, min_quantity: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="—"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max Quantity</Label>
                  <Input
                    type="number"
                    value={conditions.max_quantity ?? ""}
                    onChange={(e) => setConditions({ ...conditions, max_quantity: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="—"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Colour</Label>
                <Select
                  value={conditions.is_color === undefined ? "any" : conditions.is_color ? "true" : "false"}
                  onValueChange={(v) => setConditions({ ...conditions, is_color: v === "any" ? undefined : v === "true" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="true">Colour only</SelectItem>
                    <SelectItem value="false">B&W only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Paper Stock (match any)</Label>
                <div className="flex flex-wrap gap-1 mb-1">
                  {(conditions.paper_stock || []).map((s) => (
                    <Badge key={s} variant="secondary" className="gap-1">
                      {s}
                      <button onClick={() => setConditions({ ...conditions, paper_stock: conditions.paper_stock?.filter((x) => x !== s) })}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newPaperStock}
                    onChange={(e) => setNewPaperStock(e.target.value)}
                    placeholder="e.g. 80gsm Bond"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPaperStock(); } }}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addPaperStock}>Add</Button>
                </div>
              </div>
            </div>

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
                {isPending ? "Saving…" : rule ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
