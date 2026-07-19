import { useState } from "react";
import {
  useCatalogVariants,
  useUpsertCatalogVariant,
  useDeleteCatalogVariant,
  type CatalogVariant,
} from "@/hooks/useCatalogVariants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CatalogVariantsEditor() {
  const { data: variants = [], isLoading } = useCatalogVariants();
  const upsert = useUpsertCatalogVariant();
  const del = useDeleteCatalogVariant();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Partial<CatalogVariant> | null>(null);

  async function save() {
    if (!editing?.code?.trim() || !editing?.label?.trim()) {
      toast({ title: "Code and label are required", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editing.id,
        code: editing.code.trim().toLowerCase(),
        label: editing.label.trim(),
        description: editing.description ?? null,
        sort_order: editing.sort_order ?? 0,
        is_active: editing.is_active ?? true,
      });
      toast({ title: editing.id ? "Variant updated" : "Variant created" });
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this variant? Products that use it will lose their variant links.")) return;
    try {
      await del.mutateAsync(id);
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Product Variants</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Tier or hardware variants that share the same product family and size list but carry
            different prices. Example: Economy vs Executive pull-up banner. Assign variants to a
            product family from Admin → Products, then price each variant on the click-charges tab.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ is_active: true, sort_order: (variants[variants.length - 1]?.sort_order ?? 0) + 10 })}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add variant
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-20">Order</TableHead>
            <TableHead className="w-20">Active</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Loading…</TableCell></TableRow>
          )}
          {!isLoading && variants.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No variants yet.</TableCell></TableRow>
          )}
          {variants.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="font-mono text-xs">{v.code}</TableCell>
              <TableCell className="font-medium">{v.label}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-md truncate">{v.description ?? "—"}</TableCell>
              <TableCell>{v.sort_order}</TableCell>
              <TableCell>
                <Switch
                  checked={v.is_active}
                  onCheckedChange={async (checked) => {
                    await upsert.mutateAsync({ id: v.id, code: v.code, label: v.label, is_active: checked, description: v.description, sort_order: v.sort_order });
                  }}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(v)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(v.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit variant" : "New variant"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Code</Label>
                <Input
                  value={editing.code ?? ""}
                  placeholder="economy"
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Short slug used in pricing rows.</p>
              </div>
              <div>
                <Label className="text-xs">Label</Label>
                <Input
                  value={editing.label ?? ""}
                  placeholder="Economy"
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Description (optional)</Label>
                <Input
                  value={editing.description ?? ""}
                  placeholder="Entry-level base — lightweight aluminium."
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Sort order</Label>
                <Input
                  type="number"
                  value={editing.sort_order ?? 0}
                  onChange={(e) => setEditing({ ...editing, sort_order: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(c) => setEditing({ ...editing, is_active: c })}
                />
                <span className="text-xs">Active</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
