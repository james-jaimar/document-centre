import { useState } from "react";
import { useProductOptions, useCreateProductOption, useUpdateProductOption, useDeleteProductOption } from "@/hooks/useProductOptions";
import type { ProductOption } from "@/hooks/useProductOptions";
import type { StructuredOptionValue } from "@/lib/productOptionTypes";
import { isStructuredValues, slugify, groupOptionValues, isValueActive } from "@/lib/productOptionTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Pencil, Trash2, X, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

const OPTION_TYPES = ["select", "radio", "checkbox", "number", "text"];
const PRICE_TYPES = ["fixed", "per_document", "per_page"] as const;

interface Props {
  productFamilyId: string;
}

// ─── Option-level form (name, type, required, sort) ─────────────────
interface OptionFormData {
  name: string;
  option_type: string;
  is_required: boolean;
  sort_order: number;
}

const emptyOptionForm: OptionFormData = {
  name: "",
  option_type: "select",
  is_required: false,
  sort_order: 0,
};

// ─── Structured value form ──────────────────────────────────────────
interface ValueFormData {
  label: string;
  slug: string;
  group: string;
  price_impact: number;
  price_type: "fixed" | "per_document" | "per_page";
  is_default: boolean;
  is_active: boolean;
  metadata: Record<string, string | number | boolean>;
}

const emptyValueForm: ValueFormData = {
  label: "",
  slug: "",
  group: "",
  price_impact: 0,
  price_type: "per_document",
  is_default: false,
  is_active: true,
  metadata: {},
};

// ─── Value editor sub-component ─────────────────────────────────────
function ValueEditorRow({
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
    <div className={`border rounded-md p-2 space-y-2 bg-background transition-opacity ${active ? "" : "opacity-50"}`}>
      <div className="flex items-center gap-2">
        <Input
          className="flex-1 h-8 text-sm"
          value={value.label}
          onChange={(e) => onUpdate({ ...value, label: e.target.value, slug: slugify(e.target.value) })}
          placeholder="Label"
        />
        <Input
          className="w-24 h-8 text-xs font-mono"
          value={value.group}
          onChange={(e) => onUpdate({ ...value, group: e.target.value })}
          placeholder="Group"
        />
        <Input
          className="w-20 h-8 text-sm"
          type="number"
          step="0.01"
          value={value.price_impact}
          onChange={(e) => onUpdate({ ...value, price_impact: parseFloat(e.target.value) || 0 })}
          placeholder="Price"
        />
        <Select value={value.price_type} onValueChange={(v) => onUpdate({ ...value, price_type: v as ValueFormData["price_type"] })}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRICE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t.replace("_", "/")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1" title="Show this value to customers">
          <Switch
            checked={active}
            onCheckedChange={(v) => onUpdate({ ...value, is_active: v })}
          />
          <span className="text-xs text-muted-foreground">On</span>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={value.is_default}
            onCheckedChange={(v) => onUpdate({ ...value, is_default: v })}
          />
          <span className="text-xs text-muted-foreground">Def</span>
        </div>
        {!active && (
          <Badge variant="outline" className="text-[10px] uppercase">Hidden</Badge>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onRemove}>
          <X className="h-3 w-3 text-destructive" />
        </Button>
      </div>
      {expanded && (
        <div className="pl-2 space-y-1 text-xs text-muted-foreground">
          <p>Slug: <code className="font-mono">{value.slug}</code></p>
          <MetadataEditor
            metadata={value.metadata}
            onChange={(m) => onUpdate({ ...value, metadata: m })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Metadata key-value editor ──────────────────────────────────────
function MetadataEditor({
  metadata,
  onChange,
}: {
  metadata: Record<string, string | number | boolean>;
  onChange: (m: Record<string, string | number | boolean>) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  function addMeta() {
    if (!newKey.trim()) return;
    const parsed = newVal === "true" ? true : newVal === "false" ? false : isNaN(Number(newVal)) ? newVal : Number(newVal);
    onChange({ ...metadata, [newKey.trim()]: parsed });
    setNewKey("");
    setNewVal("");
  }

  return (
    <div className="space-y-1">
      <p className="font-semibold">Metadata:</p>
      {Object.entries(metadata).map(([k, v]) => (
        <div key={k} className="flex items-center gap-1">
          <Badge variant="outline" className="text-xs">{k}: {String(v)}</Badge>
          <button
            className="hover:text-destructive"
            onClick={() => {
              const next = { ...metadata };
              delete next[k];
              onChange(next);
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <div className="flex gap-1">
        <Input className="h-6 text-xs w-24" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="key" />
        <Input className="h-6 text-xs w-24" value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="value" />
        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={addMeta}>+</Button>
      </div>
    </div>
  );
}

// ─── Grouped values preview ─────────────────────────────────────────
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

// ─── Main component ─────────────────────────────────────────────────
export default function ProductOptionsEditor({ productFamilyId }: Props) {
  const { data: options = [], isLoading } = useProductOptions(productFamilyId);
  const createOption = useCreateProductOption();
  const updateOption = useUpdateProductOption();
  const deleteOption = useDeleteProductOption();

  // Option-level dialog
  const [optionDialogOpen, setOptionDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<ProductOption | null>(null);
  const [optionForm, setOptionForm] = useState<OptionFormData>(emptyOptionForm);

  // Values being edited for current option
  const [editValues, setEditValues] = useState<StructuredOptionValue[]>([]);

  function openCreateOption() {
    setEditingOption(null);
    setOptionForm(emptyOptionForm);
    setEditValues([]);
    setOptionDialogOpen(true);
  }

  function openEditOption(opt: ProductOption) {
    setEditingOption(opt);
    setOptionForm({
      name: opt.name,
      option_type: opt.option_type,
      is_required: opt.is_required,
      sort_order: opt.sort_order,
    });
    // Parse existing values
    const vals = opt.values;
    if (isStructuredValues(vals)) {
      setEditValues(vals);
    } else if (Array.isArray(vals)) {
      // Migrate flat strings to structured
      setEditValues(
        (vals as string[]).map((v) => ({
          label: String(v),
          slug: slugify(String(v)),
          group: "Default",
          price_impact: 0,
          price_type: "per_document" as const,
          is_default: false,
          is_active: true,
          metadata: {},
        }))
      );
    } else {
      setEditValues([]);
    }
    setOptionDialogOpen(true);
  }

  function addValue() {
    setEditValues([
      ...editValues,
      { ...emptyValueForm, slug: "", group: editValues.length > 0 ? editValues[editValues.length - 1].group : "Default" },
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
    try {
      const payload = {
        name: optionForm.name,
        option_type: optionForm.option_type,
        values: editValues as unknown as Json,
        is_required: optionForm.is_required,
        sort_order: optionForm.sort_order,
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Product Options</h4>
        <Button size="sm" variant="outline" onClick={openCreateOption}>
          <Plus className="h-3 w-3 mr-1" /> Add Option
        </Button>
      </div>

      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">No options configured yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Values</TableHead>
              <TableHead>Required</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {options.map((opt) => {
              const vals = opt.values;
              const structured = isStructuredValues(vals);
              const count = Array.isArray(vals) ? vals.length : 0;
              return (
                <TableRow key={opt.id}>
                  <TableCell className="font-medium">{opt.name}</TableCell>
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

      {/* Option Edit Dialog */}
      <Dialog open={optionDialogOpen} onOpenChange={setOptionDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOption ? "Edit Option" : "New Option"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Option metadata */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input value={optionForm.name} onChange={(e) => setOptionForm({ ...optionForm, name: e.target.value })} placeholder="e.g. Binding" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={optionForm.option_type} onValueChange={(v) => setOptionForm({ ...optionForm, option_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label>Sort Order</Label>
                <Input type="number" value={optionForm.sort_order} onChange={(e) => setOptionForm({ ...optionForm, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Label>Required</Label>
                <Switch checked={optionForm.is_required} onCheckedChange={(v) => setOptionForm({ ...optionForm, is_required: v })} />
              </div>
            </div>

            {/* Structured values editor */}
            {["select", "radio", "checkbox"].includes(optionForm.option_type) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Values ({editValues.length})</Label>
                  <Button size="sm" variant="outline" onClick={addValue}>
                    <Plus className="h-3 w-3 mr-1" /> Add Value
                  </Button>
                </div>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                  {editValues.map((val, idx) => (
                    <ValueEditorRow
                      key={idx}
                      value={val}
                      onUpdate={(v) => updateValue(idx, v)}
                      onRemove={() => removeValue(idx)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOptionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleOptionSubmit} disabled={createOption.isPending || updateOption.isPending}>
              {editingOption ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
