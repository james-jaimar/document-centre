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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCatalogSizes,
  useCatalogPrintAttrs,
  useUpsertCatalogSize,
  useDeleteCatalogSize,
  useCatalogPapers,
  useUpsertCatalogPaper,
  useDeleteCatalogPaper,
  useCatalogFinishing,
  useUpsertCatalogFinishing,
  useDeleteCatalogFinishing,
  type CatalogPaper,
  type CatalogFinishing,
} from "@/hooks/useCatalog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PAPER_FINISH_OPTIONS = ["bond", "gloss", "matt", "silk", "uncoated", "recycled", "card"];
const PAPER_CATEGORY_OPTIONS = ["bond", "coated", "uncoated", "card", "speciality"];
const FINISHING_CATEGORIES = [
  "binding",
  "stapling",
  "lamination",
  "folding",
  "trimming",
  "guillotining",
  "cover",
  "other",
];
const FINISHING_BASES = [
  "per_unit",
  "per_sheet",
  "per_set",
  "per_cut",
  "per_document",
  "per_page",
];

export default function PlatformCatalog() {
  const { data: sizes = [], isLoading: sizesLoading } = useCatalogSizes();
  const { data: attrs = [], isLoading: attrsLoading } = useCatalogPrintAttrs();
  const { data: papers = [], isLoading: papersLoading } = useCatalogPapers();
  const { data: finishing = [], isLoading: finLoading } = useCatalogFinishing();

  const upsertSize = useUpsertCatalogSize();
  const deleteSize = useDeleteCatalogSize();
  const upsertPaper = useUpsertCatalogPaper();
  const deletePaper = useDeleteCatalogPaper();
  const upsertFin = useUpsertCatalogFinishing();
  const deleteFin = useDeleteCatalogFinishing();

  // ------- size dialog -------
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

  // ------- paper dialog -------
  const [paperDlg, setPaperDlg] = useState<Partial<CatalogPaper> | null>(null);
  const openNewPaper = () =>
    setPaperDlg({
      code: "",
      label: "",
      weight_gsm: 80,
      finish: "bond",
      category: "bond",
      sort_order: papers.length * 10 + 100,
      is_active: true,
    });
  const savePaper = async () => {
    if (!paperDlg?.code || !paperDlg?.label) {
      toast.error("Code and label required");
      return;
    }
    try {
      await upsertPaper.mutateAsync({
        ...paperDlg,
        code: paperDlg.code.trim().toLowerCase(),
      } as any);
      toast.success("Saved");
      setPaperDlg(null);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    }
  };
  const togglePaper = async (p: CatalogPaper) => {
    try {
      await upsertPaper.mutateAsync({ ...p, is_active: !p.is_active } as any);
    } catch (e: any) {
      toast.error(e.message ?? "Toggle failed");
    }
  };
  const removePaper = async (id: string) => {
    if (!confirm("Remove this paper from the master catalogue?")) return;
    try {
      await deletePaper.mutateAsync(id);
      toast.success("Paper deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  };


  // ------- finishing dialog -------
  const [finDlg, setFinDlg] = useState<Partial<CatalogFinishing> | null>(null);
  const openNewFin = () =>
    setFinDlg({
      code: "",
      label: "",
      category: "binding",
      variant: null,
      pricing_basis: "per_unit",
      sort_order: finishing.length * 10 + 100,
      is_active: true,
    });
  const saveFin = async () => {
    if (!finDlg?.code || !finDlg?.label) {
      toast.error("Code and label required");
      return;
    }
    try {
      await upsertFin.mutateAsync({
        ...finDlg,
        code: finDlg.code.trim().toLowerCase(),
      } as any);
      toast.success("Saved");
      setFinDlg(null);
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    }
  };
  const toggleFin = async (f: CatalogFinishing) => {
    try {
      await upsertFin.mutateAsync({ ...f, is_active: !f.is_active } as any);
    } catch (e: any) {
      toast.error(e.message ?? "Toggle failed");
    }
  };
  const removeFin = async (id: string) => {
    if (!confirm("Remove this finishing item from the master catalogue?")) return;
    try {
      await deleteFin.mutateAsync(id);
      toast.success("Finishing deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  };


  const attrGroups = attrs.reduce<Record<string, typeof attrs>>((acc, a) => {
    (acc[a.attribute] ||= []).push(a);
    return acc;
  }, {});
  const finGroups = finishing.reduce<Record<string, CatalogFinishing[]>>((acc, f) => {
    const k = f.category ?? "other";
    (acc[k] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Master Catalogue</h1>
        <p className="text-muted-foreground">
          Platform-wide source of truth for document sizes, print attributes,
          paper stocks and finishing items. Tenants and branches reference these
          items; branches can disable, rename or surcharge them per location.
        </p>
      </div>

      {/* ---------- Sizes ---------- */}
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
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(s.id)} aria-label="Delete size">
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

      {/* ---------- Print Attributes ---------- */}
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
                    <Badge key={r.id} variant={r.is_active ? "secondary" : "outline"} className="text-xs">
                      {r.label} <span className="opacity-60 ml-1">({r.code})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ---------- Papers ---------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Paper Stocks</CardTitle>
            <CardDescription>
              Size-agnostic paper definitions. Per-size pricing is set in Master Pricing →
              Paper Stocks, where the size dropdown is sourced from the catalogue above.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNewPaper}>
            <Plus className="h-4 w-4 mr-1" /> Add paper
          </Button>
        </CardHeader>
        <CardContent>
          {papersLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : papers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No master papers yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>GSM</TableHead>
                  <TableHead>Finish</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Sort</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {papers.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setPaperDlg(p)}>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell>{p.label}</TableCell>
                    <TableCell>{p.weight_gsm ?? "—"}</TableCell>
                    <TableCell className="capitalize">{p.finish ?? "—"}</TableCell>
                    <TableCell className="capitalize">{p.category ?? "—"}</TableCell>
                    <TableCell>{p.sort_order}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch checked={p.is_active} onCheckedChange={() => togglePaper(p)} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" onClick={() => removePaper(p.id)} aria-label="Delete paper">
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

      {/* ---------- Finishing ---------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Finishing</CardTitle>
            <CardDescription>
              Master finishing items (laminations, bindings, folds, trims…). Pricing
              by size is set in Master Pricing → Finishing.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNewFin}>
            <Plus className="h-4 w-4 mr-1" /> Add finishing
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {finLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : finishing.length === 0 ? (
            <p className="text-sm text-muted-foreground">No master finishing items yet.</p>
          ) : (
            Object.keys(finGroups).sort().map((cat) => (
              <div key={cat}>
                <h4 className="text-xs font-semibold capitalize text-foreground mb-2">{cat}</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Basis</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finGroups[cat].map((f) => (
                      <TableRow key={f.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setFinDlg(f)}>
                        <TableCell className="font-mono text-[11px]">{f.code}</TableCell>
                        <TableCell className="text-sm">{f.label}</TableCell>
                        <TableCell className="text-xs">{f.variant ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {(f.pricing_basis ?? "per_unit").replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Switch checked={f.is_active} onCheckedChange={() => toggleFin(f)} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" onClick={() => removeFin(f.id)} aria-label="Delete finishing">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* size dialog */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add / update size</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code</Label><Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></div>
            <div><Label>Label</Label><Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></div>
            <div><Label>Width (mm)</Label><Input type="number" value={draft.width_mm} onChange={(e) => setDraft({ ...draft, width_mm: e.target.value })} /></div>
            <div><Label>Height (mm)</Label><Input type="number" value={draft.height_mm} onChange={(e) => setDraft({ ...draft, height_mm: e.target.value })} /></div>
            <div><Label>ISO name</Label><Input value={draft.iso_name} onChange={(e) => setDraft({ ...draft, iso_name: e.target.value })} /></div>
            <div><Label>Region</Label><Input value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} /></div>
            <div><Label>Sort order</Label><Input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} /></div>
            <div className="flex items-center gap-2 mt-6">
              <Switch checked={draft.is_active} onCheckedChange={(c) => setDraft({ ...draft, is_active: c })} />
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

      {/* paper dialog */}
      <Dialog open={!!paperDlg} onOpenChange={(o) => !o && setPaperDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{paperDlg?.id ? "Edit paper" : "Add paper"}</DialogTitle></DialogHeader>
          {paperDlg && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Code</Label><Input value={paperDlg.code ?? ""} onChange={(e) => setPaperDlg({ ...paperDlg, code: e.target.value.toLowerCase() })} placeholder="bond-80gsm" /></div>
              <div><Label>Label</Label><Input value={paperDlg.label ?? ""} onChange={(e) => setPaperDlg({ ...paperDlg, label: e.target.value })} placeholder="80gsm Bond" /></div>
              <div><Label>Weight (gsm)</Label><Input type="number" value={paperDlg.weight_gsm ?? 0} onChange={(e) => setPaperDlg({ ...paperDlg, weight_gsm: parseInt(e.target.value) || 0 })} /></div>
              <div>
                <Label>Finish</Label>
                <Select value={paperDlg.finish ?? "bond"} onValueChange={(v) => setPaperDlg({ ...paperDlg, finish: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAPER_FINISH_OPTIONS.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={paperDlg.category ?? "bond"} onValueChange={(v) => setPaperDlg({ ...paperDlg, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAPER_CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Sort order</Label><Input type="number" value={paperDlg.sort_order ?? 0} onChange={(e) => setPaperDlg({ ...paperDlg, sort_order: parseInt(e.target.value) || 0 })} /></div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch checked={paperDlg.is_active ?? true} onCheckedChange={(v) => setPaperDlg({ ...paperDlg, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaperDlg(null)}>Cancel</Button>
            <Button onClick={savePaper} disabled={upsertPaper.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* finishing dialog */}
      <Dialog open={!!finDlg} onOpenChange={(o) => !o && setFinDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{finDlg?.id ? "Edit finishing" : "Add finishing"}</DialogTitle></DialogHeader>
          {finDlg && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Code</Label><Input value={finDlg.code ?? ""} onChange={(e) => setFinDlg({ ...finDlg, code: e.target.value.toLowerCase() })} placeholder="lam-gloss" /></div>
              <div><Label>Label</Label><Input value={finDlg.label ?? ""} onChange={(e) => setFinDlg({ ...finDlg, label: e.target.value })} placeholder="Gloss Lamination" /></div>
              <div>
                <Label>Category</Label>
                <Select value={finDlg.category ?? "binding"} onValueChange={(v) => setFinDlg({ ...finDlg, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FINISHING_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pricing basis</Label>
                <Select value={finDlg.pricing_basis ?? "per_unit"} onValueChange={(v) => setFinDlg({ ...finDlg, pricing_basis: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FINISHING_BASES.map((b) => <SelectItem key={b} value={b}>{b.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Variant (optional)</Label><Input value={finDlg.variant ?? ""} onChange={(e) => setFinDlg({ ...finDlg, variant: e.target.value || null })} placeholder="10mm, soft-touch…" /></div>
              <div><Label>Sort order</Label><Input type="number" value={finDlg.sort_order ?? 0} onChange={(e) => setFinDlg({ ...finDlg, sort_order: parseInt(e.target.value) || 0 })} /></div>
              <div className="flex items-center gap-2 mt-6">
                <Switch checked={finDlg.is_active ?? true} onCheckedChange={(v) => setFinDlg({ ...finDlg, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinDlg(null)}>Cancel</Button>
            <Button onClick={saveFin} disabled={upsertFin.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
