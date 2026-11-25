import { useEffect, useMemo, useRef, useState } from "react";
import { resolveUrls } from "@/lib/thumbnailUtils";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Box, Download, Layers, Upload, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import PerfectBoundFlatWrap from "@/components/preview/PerfectBoundFlatWrap";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";
import type { Tables } from "@/integrations/supabase/types";
type Document = Tables<"documents">;
type DocumentSection = Tables<"document_sections">;
import { DEFAULT_COVER, coverValidation, type PerfectBoundCover, type CoverSource } from "@/lib/perfectBinding/workflow";
import { coverWrapSizeMm, type SpineResult } from "@/lib/perfectBinding/spine";
import PerfectBoundBook3D from "@/components/preview/PerfectBoundBook3D";

interface Props {
  orderItemId: string;
  documents: Document[];
  sections: DocumentSection[];
  value?: PerfectBoundCover;
  trim: { widthMm: number; heightMm: number };
  spine: SpineResult;
  onChange: (cover: PerfectBoundCover) => void;
  /** Render only the controls (left column) or only the 3D preview (right column). */
  part?: "all" | "controls" | "preview";
}
export default function PerfectBoundCoverStudio({ orderItemId, documents, sections, value, trim, spine, onChange, part = "all" }: Props) {
  const cover: PerfectBoundCover = { ...DEFAULT_COVER, ...value, trim, spine };
  const wrapSize = coverWrapSizeMm(trim, spine.spineMm, cover.bleed_mm);
  const customSizes = useMemo(() => [
    { name: "Cover wrap", ...wrapSize }, { name: "Cover wrap trim", widthMm: wrapSize.widthMm - 6, heightMm: wrapSize.heightMm - 6 }, { name: "Cover panel", widthMm: trim.widthMm + 6, heightMm: trim.heightMm + 6 },
  ], [wrapSize.widthMm, wrapSize.heightMm, trim.widthMm, trim.heightMm]);
  const { uploadFile, uploads, renderWithProgress } = useDocumentUpload(orderItemId, null, null, null, customSizes);
  const isUploading = Object.values(uploads).some((u) => !["done", "error"].includes(u.status));
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<"front" | "back" | "wrap">("front");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"flat" | "3d">("flat");
  const [slotFile, setSlotFile] = useState<Partial<Record<"front" | "back" | "wrap", string>>>({});
  const [finishing, setFinishing] = useState<string | null>(null);
  /** Cover size is validated by the studio itself, so a size/bleed advisory is resolved as "keep" and pages are rendered. */
  async function finishCoverCheck(docId: string) {
    const { data: doc } = await supabase.from("documents").select("id, file_name, preflight_data, backend_asset_id, document_status").eq("id", docId).maybeSingle();
    const pf = (doc?.preflight_data ?? {}) as Record<string, unknown>;
    if (!doc || pf.awaiting_review !== true) return;
    if (!doc.backend_asset_id) { toast.error("This cover PDF could not be processed. Please upload it again."); return; }
    setFinishing(docId);
    try {
      await renderWithProgress(doc.id, doc.backend_asset_id, null, doc.file_name, "Rendering cover…");
      const { data: fresh } = await supabase.from("documents").select("preflight_data").eq("id", docId).maybeSingle();
      await supabase.from("documents").update({ preflight_data: { ...((fresh?.preflight_data ?? {}) as Record<string, unknown>), awaiting_review: false, cover_resolved: true } }).eq("id", docId);
    } finally { setFinishing(null); }
  }
  async function uploadTo(side: "front" | "back" | "wrap", file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) { toast.error("Choose a PDF cover."); return; }
    setSlotFile((m) => ({ ...m, [side]: file.name }));
    try {
      const d = await uploadFile(file);
      if (!d) return;
      change({ [side]: { document_id: d.id, page: 0 } });
      await finishCoverCheck(d.id);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Cover upload failed"); }
  }
  const eligible = documents.filter((d) => !sections.some((s) => s.document_id === d.id) && ["ready", "analyzed"].includes(d.document_status));
  const coverRef = useRef(cover); coverRef.current = cover;
  const change = (delta: Partial<PerfectBoundCover>) => onChange({ ...coverRef.current, ...delta });
  const thumb = (source?: CoverSource) => {
    const doc = documents.find((d) => d.id === source?.document_id);
    const urls = doc?.thumbnail_urls;
    const path = source && Array.isArray(urls) ? urls[source.page] : undefined;
    return typeof path === "string" ? path : undefined;
  };
  const error = coverValidation(cover, documents, trim, spine);
  async function template() {
    const pdf = await PDFDocument.create(), mm = 72 / 25.4;
    const page = pdf.addPage([wrapSize.widthMm * mm, wrapSize.heightMm * mm]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const b = cover.bleed_mm, panel = trim.widthMm, s = spine.spineMm;
    page.setTrimBox(b * mm, b * mm, (panel * 2 + s) * mm, trim.heightMm * mm);
    page.setBleedBox(0, 0, wrapSize.widthMm * mm, wrapSize.heightMm * mm);
    for (const x of [b, b + panel, b + panel + s, b + panel * 2 + s]) page.drawLine({ start: { x: x * mm, y: 0 }, end: { x: x * mm, y: wrapSize.heightMm * mm }, color: rgb(.3, .5, .5), thickness: .5 });
    page.drawText("BACK", { x: (b + 10) * mm, y: (b + 10) * mm, size: 14, font });
    page.drawText("FRONT", { x: (b + panel + s + 10) * mm, y: (b + 10) * mm, size: 14, font });
    page.drawText(`Spine ${s} mm | ${wrapSize.widthMm} x ${wrapSize.heightMm} mm including ${b} mm bleed`, { x: 10 * mm, y: (wrapSize.heightMm - 10) * mm, size: 10, font });
    const bytes = await pdf.save();
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
    const a = document.createElement("a"); a.href = url; a.download = "perfect-bound-cover-template.pdf"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selector = (side: "front" | "back" | "wrap", label: string) => {
    const source = cover[side];
    const pages = documents.find((d) => d.id === source?.document_id)?.page_count ?? 1;
    return <div className="space-y-2" key={side}>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Select value={source?.document_id ?? ""} onValueChange={(id) => change({ [side]: { document_id: id, page: 0 } })}>
          <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Choose PDF" /></SelectTrigger><SelectContent>
            {eligible.map((d) => <SelectItem key={d.id} value={d.id}>{d.file_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" title={`Upload ${label.toLowerCase()}`} aria-label={`Upload ${label.toLowerCase()}`} disabled={isUploading} onClick={() => { setTarget(side); input.current?.click(); }}><Upload className="h-4 w-4" /></Button>
      </div>
      {source && pages > 1 && <div className="flex items-center gap-2"><Label htmlFor={`cover-${side}-page`}>Page</Label><Input id={`cover-${side}-page`} type="number" min={1} max={pages} value={source.page + 1} className="w-24" onChange={(e) => change({ [side]: { ...source, page: Math.max(0, Math.min(pages - 1, Number(e.target.value) - 1)) } })} /></div>}
    </div>;
  };
  const previewProps = { frontPath: thumb(cover.mode === "wrap" ? undefined : cover.front), backPath: thumb(cover.mode === "wrap" ? undefined : cover.back), wrapPath: cover.mode === "wrap" ? thumb(cover.wrap) : undefined, spine, trimMm: trim, title: [cover.title, cover.author].filter(Boolean).join(" · "), spineColor: cover.spine_colour, textColor: cover.text_colour, bleedMm: cover.bleed_mm };
  const preview = <div className="space-y-3">
    <div className="flex justify-center gap-2" role="group" aria-label="Preview style">
      <Button size="sm" variant={view === "flat" ? "default" : "outline"} onClick={() => setView("flat")}><Layers className="mr-2 h-4 w-4" />2D flat wrap</Button>
      <Button size="sm" variant={view === "3d" ? "default" : "outline"} onClick={() => setView("3d")}><Box className="mr-2 h-4 w-4" />3D book</Button>
    </div>
    {view === "flat" ? <PerfectBoundFlatWrap {...previewProps} /> : <PerfectBoundBook3D {...previewProps} />}
  </div>;
  const slots: { side: "front" | "back" | "wrap"; label: string; hint: string }[] = cover.mode === "wrap"
    ? [{ side: "wrap", label: "Full wrap PDF", hint: `${wrapSize.widthMm} × ${wrapSize.heightMm} mm including bleed` }]
    : [{ side: "front", label: "Front cover", hint: `${trim.widthMm} × ${trim.heightMm} mm (+3 mm bleed optional)` }, { side: "back", label: "Back cover", hint: `${trim.widthMm} × ${trim.heightMm} mm (+3 mm bleed optional)` }];
  const stuckDoc = documents.find((d) => [cover.front, cover.back, cover.wrap].some((src) => src?.document_id === d.id) && (d.preflight_data as { awaiting_review?: boolean } | null)?.awaiting_review);
  const dialog = <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader><DialogTitle>Upload cover artwork</DialogTitle><DialogDescription>Drop a PDF into each box. We check it and place it on your cover automatically.</DialogDescription></DialogHeader>
      <div className={slots.length > 1 ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
        {slots.map(({ side, label, hint }) => {
          const name = slotFile[side];
          const up = name ? uploads[name] : undefined;
          const busy = (up && !["done", "error"].includes(up.status)) || (finishing && cover[side]?.document_id === finishing);
          const doc = documents.find((d) => d.id === cover[side]?.document_id);
          const ready = !!doc && ["ready", "analyzed"].includes(doc.document_status) && !(doc.preflight_data as { awaiting_review?: boolean } | null)?.awaiting_review;
          const src = thumb(cover[side]);
          return <label key={side} className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors hover:border-primary hover:bg-accent/40"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void uploadTo(side, f); }}>
            <input type="file" accept="application/pdf,.pdf" className="sr-only" aria-label={`Upload ${label.toLowerCase()}`} disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadTo(side, f); }} />
            {src && ready ? <CoverThumb path={src} /> : <Upload className="h-8 w-8 text-muted-foreground" />}
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
            {busy && <div className="w-full space-y-1"><Progress value={up?.progress ?? 70} /><p className="text-xs text-muted-foreground">{up?.statusText ?? "Rendering cover…"}</p></div>}
            {!busy && up?.status === "error" && <p className="text-xs text-destructive">{up.error ?? "Upload failed"}</p>}
            {!busy && ready && <p className="flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-3 w-3" />{doc?.file_name}</p>}
          </label>;
        })}
      </div>
      {error && !isUploading && !finishing && <p className="text-sm text-muted-foreground">{error}</p>}
      <div className="flex justify-end"><Button onClick={() => setDialogOpen(false)} disabled={isUploading || !!finishing}>Done</Button></div>
    </DialogContent>
  </Dialog>;
  if (part === "preview") return preview;
  return <section className={part === "controls" ? "space-y-4" : "border-t pt-6 space-y-4"}>
    <div><h2 className="text-lg font-semibold">Cover Studio</h2><p className="text-sm text-muted-foreground">Spine {spine.spineMm} mm · {spine.sheets} sheets · {trim.widthMm} × {trim.heightMm} mm</p></div>
    <div className="flex flex-wrap gap-2">
      <Button variant={cover.mode === "guided" ? "default" : "outline"} onClick={() => change({ mode: "guided" })}>Front & Back</Button>
      <Button variant={cover.mode === "wrap" ? "default" : "outline"} onClick={() => change({ mode: "wrap" })}>Designer Wrap</Button>
      <Button variant="outline" onClick={() => void template()}><Download className="mr-2 h-4 w-4" />Template</Button>
    </div>
    <Button className="w-full" onClick={() => setDialogOpen(true)}><Upload className="mr-2 h-4 w-4" />Upload cover artwork</Button>
    {dialog}
    <input ref={input} className="hidden" type="file" accept="application/pdf,.pdf" onChange={async (e) => {
      const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
      if (!file.name.toLowerCase().endsWith(".pdf")) { toast.error("Choose a PDF cover."); return; }
      await uploadTo(target, file);
    }} />
    {cover.mode === "guided" ? <>
      <div className={part === "controls" ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>{selector("front", "Front cover")}{selector("back", "Back cover")}</div>
      <div className={part === "controls" ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
        <div className="flex gap-3 items-center"><Label htmlFor="spine-colour">Spine colour</Label><Input id="spine-colour" type="color" value={cover.spine_colour} onChange={(e) => change({ spine_colour: e.target.value })} className="w-12 h-10 p-1" /><Label htmlFor="spine-text-colour">Text colour</Label><Input id="spine-text-colour" type="color" value={cover.text_colour} onChange={(e) => change({ text_colour: e.target.value })} className="w-12 h-10 p-1" /></div>
        <div><Label htmlFor="spine-title">Spine title</Label><Input id="spine-title" maxLength={120} disabled={!spine.textAllowed} value={cover.title} onChange={(e) => change({ title: e.target.value })} /></div>
        <div><Label htmlFor="spine-author">Author</Label><Input id="spine-author" maxLength={100} disabled={!spine.textAllowed} value={cover.author} onChange={(e) => change({ author: e.target.value })} /></div>
      </div>
      {!spine.textAllowed && <p className="text-xs text-muted-foreground">Spine text requires at least 4 mm.</p>}
    </> : <><p className="text-sm">Wrap: {wrapSize.widthMm} × {wrapSize.heightMm} mm · back + {spine.spineMm} mm spine + front · 3 mm bleed</p>{selector("wrap", "Wrap cover")}</>}
    {isUploading && <p role="status" className="text-sm text-muted-foreground">{Object.values(uploads).find((u) => u.status !== "done")?.statusText ?? "Checking cover PDF…"}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {stuckDoc && <Button variant="outline" size="sm" disabled={!!finishing} onClick={() => void finishCoverCheck(stuckDoc.id)}>{finishing ? "Finishing cover check…" : "Finish cover check"}</Button>}
    {part === "all" && preview}
  </section>;
}
function CoverThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { let alive = true; void resolveUrls([path]).then(([u]) => alive && setUrl(u)).catch(() => {}); return () => { alive = false; }; }, [path]);
  return url ? <img src={url} alt="" className="h-24 rounded object-contain shadow" /> : <div className="h-24" />;
}
