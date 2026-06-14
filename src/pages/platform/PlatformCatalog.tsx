import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  useCatalogSizes,
  useCatalogPrintAttrs,
  useUpsertCatalogSize,
  useDeleteCatalogSize,
} from "@/hooks/useCatalog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function PlatformCatalog() {
  const { data: sizes = [], isLoading: sizesLoading } = useCatalogSizes();
  const { data: attrs = [], isLoading: attrsLoading } = useCatalogPrintAttrs();
  const upsertSize = useUpsertCatalogSize();
  const deleteSize = useDeleteCatalogSize();

  const [dlgOpen, setDlgOpen] = useState(false);
  const [draft, setDraft] = useState({
    code: "",
    label: "",
    width_mm: "",
    height_mm: "",
    iso_name: "",
    region: "ISO",
    sort_order: "0",
    is_active: true,
  });

  const resetDraft = () =>
    setDraft({
      code: "",
      label: "",
      width_mm: "",
      height_mm: "",
      iso_name: "",
      region: "ISO",
      sort_order: "0",
      is_active: true,
    });

  const handleSave = async () => {
    if (!draft.code || !draft.label || !draft.width_mm || !draft.height_mm) {
      toast.error("Code, label, width and height are required");
      return;
    }
    try {
      await upsertSize.mutateAsync({
        code: draft.code.trim().toLowerCase(),
        label: draft.label.trim(),
        width_mm: Number(draft.width_mm),
        height_mm: Number(draft.height_mm),
        iso_name: draft.iso_name.trim() || null,
        region: draft.region.trim() || null,
        sort_order: Number(draft.sort_order) || 0,
        is_active: draft.is_active,
      });
      toast.success("Size saved");
      setDlgOpen(false);
      resetDraft();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    }
  };

  const handleToggleActive = async (id: string, code: string, current: boolean) => {
    const row = sizes.find((s) => s.id === id);
    if (!row) return;
    await upsertSize.mutateAsync({
      code,
      label: row.label,
      width_mm: row.width_mm,
      height_mm: row.height_mm,
      iso_name: row.iso_name,
      region: row.region,
      sort_order: row.sort_order,
      is_active: !current,
    } as any);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this size from the master catalogue? Branches that already use it will keep their links.")) return;
    try {
      await deleteSize.mutateAsync(id);
      toast.success("Removed");
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    }
  };

  const attrGroups = attrs.reduce<Record<string, typeof attrs>>((acc, a) => {
    (acc[a.attribute] ||= []).push(a);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Master Catalogue</h1>
        <p className="text-muted-foreground">
          Platform-wide source of truth for document sizes and print attributes.
          Tenants and branches reference these items; branches can disable, rename
          or surcharge them per location.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Document Sizes</CardTitle>
            <CardDescription>A4, A3, US Letter, custom sizes…</CardDescription>
          </div>
          <Button onClick={() => { resetDraft(); setDlgOpen(true); }} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add size
          </Button>
        </CardHeader>
        <CardContent>
          {sizesLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Dimensions</TableHead>
                  <TableHead>ISO</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Sort</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sizes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell>{s.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {Math.round(Number(s.width_mm))} × {Math.round(Number(s.height_mm))}mm
                    </TableCell>
                    <TableCell>{s.iso_name ?? "—"}</TableCell>
                    <TableCell>{s.region ?? "—"}</TableCell>
                    <TableCell>{s.sort_order}</TableCell>
                    <TableCell>
                      <Switch
                        checked={s.is_active}
                        onCheckedChange={() => handleToggleActive(s.id, s.code, s.is_active)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(s.id)}
                        aria-label="Delete size"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Print Attributes</CardTitle>
          <CardDescription>Colour mode, sides, orientation — managed by the platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {attrsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            Object.entries(attrGroups).map(([attribute, rows]) => (
              <div key={attribute}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-sm">{attribute}</h3>
                  <Badge variant="outline" className="text-xs">{rows.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rows.map((r) => (
                    <Badge
                      key={r.id}
                      variant={r.is_active ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {r.label} <span className="opacity-60 ml-1">({r.code})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add / update size</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-1">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                placeholder="a4-landscape"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </div>
            <div className="col-span-1">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                placeholder="A4 Landscape"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="w">Width (mm)</Label>
              <Input
                id="w"
                type="number"
                value={draft.width_mm}
                onChange={(e) => setDraft({ ...draft, width_mm: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="h">Height (mm)</Label>
              <Input
                id="h"
                type="number"
                value={draft.height_mm}
                onChange={(e) => setDraft({ ...draft, height_mm: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="iso">ISO name</Label>
              <Input
                id="iso"
                placeholder="A4"
                value={draft.iso_name}
                onChange={(e) => setDraft({ ...draft, iso_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="region">Region</Label>
              <Input
                id="region"
                placeholder="ISO / US / custom"
                value={draft.region}
                onChange={(e) => setDraft({ ...draft, region: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="sort">Sort order</Label>
              <Input
                id="sort"
                type="number"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Switch
                checked={draft.is_active}
                onCheckedChange={(c) => setDraft({ ...draft, is_active: c })}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsertSize.isPending}>
              {upsertSize.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
