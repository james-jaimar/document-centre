import { useState } from "react";
import { useProductOptions, useCreateProductOption, useUpdateProductOption, useDeleteProductOption } from "@/hooks/useProductOptions";
import type { ProductOption } from "@/hooks/useProductOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const OPTION_TYPES = ["select", "radio", "checkbox", "number", "text"];

interface Props {
  productFamilyId: string;
}

interface OptionFormData {
  name: string;
  option_type: string;
  values: string[];
  is_required: boolean;
  sort_order: number;
}

const emptyForm: OptionFormData = {
  name: "",
  option_type: "select",
  values: [],
  is_required: false,
  sort_order: 0,
};

export default function ProductOptionsEditor({ productFamilyId }: Props) {
  const { data: options = [], isLoading } = useProductOptions(productFamilyId);
  const createOption = useCreateProductOption();
  const updateOption = useUpdateProductOption();
  const deleteOption = useDeleteProductOption();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<ProductOption | null>(null);
  const [form, setForm] = useState<OptionFormData>(emptyForm);
  const [newValue, setNewValue] = useState("");

  function openCreate() {
    setEditingOption(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(opt: ProductOption) {
    setEditingOption(opt);
    setForm({
      name: opt.name,
      option_type: opt.option_type,
      values: Array.isArray(opt.values) ? (opt.values as string[]) : [],
      is_required: opt.is_required,
      sort_order: opt.sort_order,
    });
    setDialogOpen(true);
  }

  function addValue() {
    const trimmed = newValue.trim();
    if (trimmed && !form.values.includes(trimmed)) {
      setForm({ ...form, values: [...form.values, trimmed] });
      setNewValue("");
    }
  }

  function removeValue(v: string) {
    setForm({ ...form, values: form.values.filter((x) => x !== v) });
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      if (editingOption) {
        await updateOption.mutateAsync({
          id: editingOption.id,
          name: form.name,
          option_type: form.option_type,
          values: form.values as unknown as import("@/integrations/supabase/types").Json,
          is_required: form.is_required,
          sort_order: form.sort_order,
        });
        toast({ title: "Option updated" });
      } else {
        await createOption.mutateAsync({
          product_family_id: productFamilyId,
          name: form.name,
          option_type: form.option_type,
          values: form.values as unknown as import("@/integrations/supabase/types").Json,
          is_required: form.is_required,
          sort_order: form.sort_order,
        });
        toast({ title: "Option created" });
      }
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
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
        <Button size="sm" variant="outline" onClick={openCreate}>
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
            {options.map((opt) => (
              <TableRow key={opt.id}>
                <TableCell className="font-medium">{opt.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{opt.option_type}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(opt.values) ? opt.values : []).map((v, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{String(v)}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{opt.is_required ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(opt)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(opt.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingOption ? "Edit Option" : "New Option"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Paper Stock" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.option_type} onValueChange={(v) => setForm({ ...form, option_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {["select", "radio", "checkbox"].includes(form.option_type) && (
              <div>
                <Label>Values</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {form.values.map((v) => (
                    <Badge key={v} variant="secondary" className="gap-1">
                      {v}
                      <button onClick={() => removeValue(v)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Add a value…"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addValue(); } }}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addValue}>Add</Button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Label>Required</Label>
                <Switch checked={form.is_required} onCheckedChange={(v) => setForm({ ...form, is_required: v })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createOption.isPending || updateOption.isPending}>
              {editingOption ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
