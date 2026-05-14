import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  type ImpositionSlot,
  type ImpositionTemplate,
  useCreateImpositionTemplate,
  useDeleteImpositionTemplate,
  useImpositionTemplates,
  useUpdateImpositionTemplate,
  uploadImpositionTemplatePdf,
} from "@/hooks/useImpositionTemplates";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import {
  useProductImpositionDefaults,
  useAssignImpositionTemplate,
  useUnassignImpositionTemplate,
} from "@/hooks/useImpositionTemplates";

const PAPER_SIZES: Record<string, { w: number; h: number }> = {
  A6: { w: 105, h: 148 },
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  SRA3: { w: 320, h: 450 },
  B2: { w: 500, h: 707 },
  BC: { w: 90, h: 55 },
  DL: { w: 210, h: 99 },
  custom: { w: 0, h: 0 },
};

interface FormState {
  id?: string;
  name: string;
  description: string;
  input_size: string;
  input_width_mm: number;
  input_height_mm: number;
  output_size: string;
  output_width_mm: number;
  output_height_mm: number;
  n_up: number;
  has_bleed: boolean;
  has_crop_marks: boolean;
  work_style: "cut_sheet" | "work_and_turn" | "sheetwise";
  template_pdf_path: string | null;
  slots: ImpositionSlot[];
  is_active: boolean;
}

const blank: FormState = {
  name: "",
  description: "",
  input_size: "A4",
  input_width_mm: 210,
  input_height_mm: 297,
  output_size: "SRA3",
  output_width_mm: 320,
  output_height_mm: 450,
  n_up: 2,
  has_bleed: true,
  has_crop_marks: true,
  work_style: "cut_sheet",
  template_pdf_path: null,
  slots: [],
  is_active: true,
};

export default function PlatformImposition() {
  const { data: templates = [], isLoading } = useImpositionTemplates();
  const create = useCreateImpositionTemplate();
  const update = useUpdateImpositionTemplate();
  const remove = useDeleteImpositionTemplate();

  const [editing, setEditing] = useState<FormState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const openNew = () => setEditing({ ...blank });
  const openEdit = (t: ImpositionTemplate) =>
    setEditing({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      input_size: t.input_size,
      input_width_mm: Number(t.input_width_mm),
      input_height_mm: Number(t.input_height_mm),
      output_size: t.output_size,
      output_width_mm: Number(t.output_width_mm),
      output_height_mm: Number(t.output_height_mm),
      n_up: t.n_up,
      has_bleed: t.has_bleed,
      has_crop_marks: t.has_crop_marks,
      work_style: t.work_style as FormState["work_style"],
      template_pdf_path: t.template_pdf_path,
      slots: (t.slots as unknown as ImpositionSlot[]) ?? [],
      is_active: t.is_active,
    });

  const save = async () => {
    if (!editing) return;
    try {
      const payload = {
        name: editing.name,
        description: editing.description || null,
        input_size: editing.input_size,
        input_width_mm: editing.input_width_mm,
        input_height_mm: editing.input_height_mm,
        output_size: editing.output_size,
        output_width_mm: editing.output_width_mm,
        output_height_mm: editing.output_height_mm,
        n_up: editing.n_up,
        has_bleed: editing.has_bleed,
        has_crop_marks: editing.has_crop_marks,
        work_style: editing.work_style,
        template_pdf_path: editing.template_pdf_path,
        slots: editing.slots as unknown as never,
        is_active: editing.is_active,
      };
      if (editing.id) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast.success("Template updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Template created");
      }
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleUpload = async (file: File) => {
    if (!editing?.id) {
      toast.error("Save the template first to attach a PDF");
      return;
    }
    setUploading(true);
    try {
      const path = await uploadImpositionTemplatePdf(file, editing.id);
      setEditing({ ...editing, template_pdf_path: path });
      await update.mutateAsync({ id: editing.id, template_pdf_path: path });
      toast.success("Template PDF uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onChangeOutputSize = (slug: string) => {
    if (!editing) return;
    const s = PAPER_SIZES[slug];
    setEditing({
      ...editing,
      output_size: slug,
      output_width_mm: s?.w || editing.output_width_mm,
      output_height_mm: s?.h || editing.output_height_mm,
    });
  };
  const onChangeInputSize = (slug: string) => {
    if (!editing) return;
    const s = PAPER_SIZES[slug];
    setEditing({
      ...editing,
      input_size: slug,
      input_width_mm: s?.w || editing.input_width_mm,
      input_height_mm: s?.h || editing.input_height_mm,
    });
  };

  const addSlot = () => {
    if (!editing) return;
    const nextIdx = editing.slots.length;
    setEditing({
      ...editing,
      slots: [
        ...editing.slots,
        {
          index: nextIdx,
          x_mm: 0,
          y_mm: 0,
          width_mm: editing.input_width_mm,
          height_mm: editing.input_height_mm,
          rotation_deg: 0,
        },
      ],
    });
  };
  const updateSlot = (i: number, patch: Partial<ImpositionSlot>) => {
    if (!editing) return;
    const slots = editing.slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    setEditing({ ...editing, slots });
  };
  const removeSlot = (i: number) => {
    if (!editing) return;
    setEditing({ ...editing, slots: editing.slots.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, index: idx })) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Imposition Templates</h1>
          <p className="text-sm text-muted-foreground">
            Master library of press-sheet templates. Operators pick from these on the Impose step.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAssign(true)}>Assign to products</Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> New template</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Input → Output</TableHead>
                <TableHead>n-up</TableHead>
                <TableHead>Bleed</TableHead>
                <TableHead>Crops</TableHead>
                <TableHead>Work style</TableHead>
                <TableHead>PDF</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9}>Loading…</TableCell></TableRow>}
              {!isLoading && templates.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-muted-foreground">No templates yet.</TableCell></TableRow>
              )}
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.input_size} → {t.output_size}</TableCell>
                  <TableCell>{t.n_up}</TableCell>
                  <TableCell>{t.has_bleed ? "Yes" : "—"}</TableCell>
                  <TableCell>{t.has_crop_marks ? "Yes" : "—"}</TableCell>
                  <TableCell><Badge variant="outline">{t.work_style}</Badge></TableCell>
                  <TableCell>{t.template_pdf_path ? <Badge>uploaded</Badge> : <span className="text-muted-foreground text-xs">missing</span>}</TableCell>
                  <TableCell>{t.is_active ? <Badge>active</Badge> : <Badge variant="secondary">inactive</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      if (!confirm(`Delete template "${t.name}"?`)) return;
                      try { await remove.mutateAsync(t.id); toast.success("Deleted"); } catch (e) { toast.error((e as Error).message); }
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing.id ? "Edit template" : "New template"}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>

              <div>
                <Label>Input size</Label>
                <Select value={editing.input_size} onValueChange={onChangeInputSize}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(PAPER_SIZES).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <Input type="number" value={editing.input_width_mm} onChange={(e) => setEditing({ ...editing, input_width_mm: Number(e.target.value) })} placeholder="W mm" />
                  <Input type="number" value={editing.input_height_mm} onChange={(e) => setEditing({ ...editing, input_height_mm: Number(e.target.value) })} placeholder="H mm" />
                </div>
              </div>

              <div>
                <Label>Output size</Label>
                <Select value={editing.output_size} onValueChange={onChangeOutputSize}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(PAPER_SIZES).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <Input type="number" value={editing.output_width_mm} onChange={(e) => setEditing({ ...editing, output_width_mm: Number(e.target.value) })} placeholder="W mm" />
                  <Input type="number" value={editing.output_height_mm} onChange={(e) => setEditing({ ...editing, output_height_mm: Number(e.target.value) })} placeholder="H mm" />
                </div>
              </div>

              <div>
                <Label>n-up</Label>
                <Input type="number" min={1} value={editing.n_up} onChange={(e) => setEditing({ ...editing, n_up: Math.max(1, Number(e.target.value)) })} />
              </div>

              <div>
                <Label>Work style</Label>
                <Select value={editing.work_style} onValueChange={(v) => setEditing({ ...editing, work_style: v as FormState["work_style"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cut_sheet">Cut sheet</SelectItem>
                    <SelectItem value="work_and_turn">Work and turn</SelectItem>
                    <SelectItem value="sheetwise">Sheetwise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 pt-6">
                <Switch checked={editing.has_bleed} onCheckedChange={(v) => setEditing({ ...editing, has_bleed: v })} />
                <Label>Has bleed</Label>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={editing.has_crop_marks} onCheckedChange={(v) => setEditing({ ...editing, has_crop_marks: v })} />
                <Label>Has crop marks</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <Label>Active</Label>
              </div>

              <div className="col-span-2 border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label>Template artwork PDF</Label>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input type="file" accept="application/pdf" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                    <Button type="button" variant="outline" size="sm" disabled={uploading || !editing.id} asChild>
                      <span>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} Upload PDF</span>
                    </Button>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {editing.template_pdf_path ?? (editing.id ? "No PDF uploaded yet." : "Save the template first, then upload.")}
                </p>
              </div>

              <div className="col-span-2 border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label>Slots ({editing.slots.length})</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addSlot}><Plus className="h-3 w-3 mr-1" /> Add slot</Button>
                </div>

                <SlotPreview
                  outputW={editing.output_width_mm}
                  outputH={editing.output_height_mm}
                  slots={editing.slots}
                />

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>X (mm)</TableHead>
                      <TableHead>Y (mm)</TableHead>
                      <TableHead>W (mm)</TableHead>
                      <TableHead>H (mm)</TableHead>
                      <TableHead>Rot°</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editing.slots.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell>{s.index + 1}</TableCell>
                        <TableCell><Input type="number" value={s.x_mm} onChange={(e) => updateSlot(i, { x_mm: Number(e.target.value) })} /></TableCell>
                        <TableCell><Input type="number" value={s.y_mm} onChange={(e) => updateSlot(i, { y_mm: Number(e.target.value) })} /></TableCell>
                        <TableCell><Input type="number" value={s.width_mm} onChange={(e) => updateSlot(i, { width_mm: Number(e.target.value) })} /></TableCell>
                        <TableCell><Input type="number" value={s.height_mm} onChange={(e) => updateSlot(i, { height_mm: Number(e.target.value) })} /></TableCell>
                        <TableCell><Input type="number" value={s.rotation_deg} onChange={(e) => updateSlot(i, { rotation_deg: Number(e.target.value) })} /></TableCell>
                        <TableCell><Button variant="ghost" size="sm" onClick={() => removeSlot(i)}><Trash2 className="h-3 w-3" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-xs text-muted-foreground mt-2">
                  Coordinates from bottom-left of the output sheet. Slot order = page order on the sheet.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save} disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showAssign && <AssignmentDialog templates={templates} onClose={() => setShowAssign(false)} />}
    </div>
  );
}

function SlotPreview({ outputW, outputH, slots }: { outputW: number; outputH: number; slots: ImpositionSlot[] }) {
  const maxPx = 360;
  const scale = useMemo(() => maxPx / Math.max(outputW, outputH), [outputW, outputH]);
  const w = outputW * scale, h = outputH * scale;
  return (
    <div className="my-3 inline-block border bg-muted/20 p-2 rounded">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ background: "white" }}>
        {slots.map((s) => {
          const cx = s.x_mm * scale + (s.width_mm * scale) / 2;
          const cy = h - (s.y_mm * scale + (s.height_mm * scale) / 2);
          return (
            <g key={s.index} transform={`rotate(${-s.rotation_deg} ${cx} ${cy})`}>
              <rect
                x={s.x_mm * scale}
                y={h - (s.y_mm + s.height_mm) * scale}
                width={s.width_mm * scale}
                height={s.height_mm * scale}
                fill="hsl(var(--primary) / 0.15)"
                stroke="hsl(var(--primary))"
                strokeWidth={1}
              />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="hsl(var(--primary))">
                {s.index + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function AssignmentDialog({ templates, onClose }: { templates: ImpositionTemplate[]; onClose: () => void }) {
  const { data: families = [] } = useProductFamilies(null, { masterOnly: true });
  const [familyId, setFamilyId] = useState<string | null>(null);
  const { data: assignments = [] } = useProductImpositionDefaults(familyId);
  const assign = useAssignImpositionTemplate();
  const unassign = useUnassignImpositionTemplate();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Assign templates to product families</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Product family</Label>
            <Select value={familyId ?? ""} onValueChange={(v) => setFamilyId(v || null)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {familyId && (
            <>
              <div>
                <Label className="text-sm">Available templates</Label>
                <div className="space-y-1 mt-1 max-h-64 overflow-y-auto">
                  {templates.filter(t => t.is_active).map(t => {
                    const assigned = assignments.find(a => a.imposition_template_id === t.id);
                    return (
                      <div key={t.id} className="flex items-center justify-between border rounded p-2">
                        <div className="text-sm">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-muted-foreground ml-2">{t.input_size} → {t.output_size} ({t.n_up}-up)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {assigned?.is_primary && <Badge>primary</Badge>}
                          {assigned ? (
                            <>
                              {!assigned.is_primary && (
                                <Button size="sm" variant="outline" onClick={() => assign.mutate({ product_family_id: familyId, imposition_template_id: t.id, is_primary: true })}>
                                  Make primary
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => unassign.mutate(assigned.id)}><Trash2 className="h-3 w-3" /></Button>
                            </>
                          ) : (
                            <Button size="sm" onClick={() => assign.mutate({ product_family_id: familyId, imposition_template_id: t.id, is_primary: assignments.length === 0 })}>
                              Assign
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
