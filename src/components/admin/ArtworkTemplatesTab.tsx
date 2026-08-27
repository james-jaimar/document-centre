/**
 * Admin: manage templated artwork for a product family.
 * Upload a multi-page base PDF, then draw the placeholder boxes the customer
 * fills in. Boxes are defined once and repeat on every page.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Image as ImageIcon, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { downloadFromS3, uploadToS3 } from "@/lib/s3Storage";
import { rasterisePdfPages, type RasterisedPage } from "@/lib/artworkTemplates/pdfPages";
import { uploadTemplateThumbnail } from "@/lib/artworkTemplates/thumbnails";
import { TemplateThumb } from "@/components/artwork/TemplatePickerSheet";
import TemplateBoxEditor from "@/components/artwork/TemplateBoxEditor";
import {
  useArtworkPlaceholders,
  useArtworkTemplates,
  useDeleteArtworkTemplate,
  useSaveArtworkPlaceholders,
  useUpsertArtworkTemplate,
} from "@/hooks/useArtworkTemplates";
import type { ArtworkPlaceholder, ArtworkTemplate } from "@/lib/artworkTemplates/types";

interface Props {
  productFamilyId: string;
  tenantId: string;
}

export default function ArtworkTemplatesTab({ productFamilyId, tenantId }: Props) {
  const { data: templates = [], isLoading } = useArtworkTemplates(productFamilyId);
  const upsertTemplate = useUpsertArtworkTemplate();
  const deleteTemplate = useDeleteArtworkTemplate();
  const savePlaceholders = useSaveArtworkPlaceholders();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const { data: savedPlaceholders = [] } = useArtworkPlaceholders(selectedId);
  const [draft, setDraft] = useState<ArtworkPlaceholder[]>([]);
  const [pages, setPages] = useState<RasterisedPage[]>([]);
  const [renderingPdf, setRenderingPdf] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const [thumbBusy, setThumbBusy] = useState(false);

  useEffect(() => {
    if (!selectedId && templates.length > 0) setSelectedId(templates[0].id);
  }, [templates, selectedId]);

  useEffect(() => {
    setDraft(savedPlaceholders);
  }, [savedPlaceholders]);

  // Render the stored base PDF for the selected template.
  useEffect(() => {
    let cancelled = false;
    setPages([]);
    if (!selected?.base_pdf_path) return;
    setRenderingPdf(true);
    (async () => {
      try {
        const blob = await downloadFromS3(selected.base_pdf_path!);
        const rendered = await rasterisePdfPages(blob, {
          targetLongPx: 1400,
        });
        if (!cancelled) setPages(rendered);
      } catch (err) {
        console.error("[artwork] template render failed", err);
        if (!cancelled) toast.error("Could not render the template PDF.");
      } finally {
        if (!cancelled) setRenderingPdf(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selected?.id,
    selected?.base_pdf_path,
  ]);

  const handleCreate = async () => {
    try {
      const created = await upsertTemplate.mutateAsync({
        product_family_id: productFamilyId,
        name: `Layout ${templates.length + 1}`,
        scope_type: "tenant",
        tenant_id: tenantId,
        sort_order: templates.length,
        status: "draft",
      } as Partial<ArtworkTemplate> & { product_family_id: string; name: string });
      setSelectedId(created.id);
      toast.success("Template created — upload the base PDF next.");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not create the template.");
    }
  };

  const handleUpload = async (file: File) => {
    if (!selected) return;
    if (file.type !== "application/pdf") {
      toast.error("The base artwork must be a PDF.");
      return;
    }
    setUploading(true);
    try {
      const path = `artwork-templates/${selected.id}/base.pdf`;
      await uploadToS3(path, file);
      const rendered = await rasterisePdfPages(file, {
        targetLongPx: 1400,
      });
      if (rendered.length === 0) throw new Error("The PDF has no pages.");
      let previewPath: string | null = null;
      try {
        previewPath = await uploadTemplateThumbnail(selected.id, rendered[0].dataUrl);
      } catch (thumbErr) {
        console.warn("[artwork] thumbnail generation failed", thumbErr);
      }
      await upsertTemplate.mutateAsync({
        id: selected.id,
        product_family_id: productFamilyId,
        name: selected.name,
        base_pdf_path: path,
        ...(previewPath ? { preview_path: previewPath } : {}),
        page_count: rendered.length,
        trim_width_mm: rendered[0].widthMm,
        trim_height_mm: rendered[0].heightMm,
        trim_offset_x_mm: rendered[0].offsetXMm,
        trim_offset_y_mm: rendered[0].offsetYMm,
      } as any);
      setPages(rendered);
      toast.success(
        `Uploaded — ${rendered.length} page${rendered.length === 1 ? "" : "s"} at ${rendered[0].widthMm} × ${rendered[0].heightMm} mm.`,
      );

    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleThumbnailUpload = async (file: File) => {
    if (!selected) return;
    if (!file.type.startsWith("image/")) {
      toast.error("The thumbnail must be a PNG or JPG image.");
      return;
    }
    setThumbBusy(true);
    try {
      const src = URL.createObjectURL(file);
      const previewPath = await uploadTemplateThumbnail(selected.id, src);
      URL.revokeObjectURL(src);
      await patchTemplate({ preview_path: previewPath } as any);
      toast.success("Thumbnail updated.");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not upload the thumbnail.");
    } finally {
      setThumbBusy(false);
      if (thumbRef.current) thumbRef.current.value = "";
    }
  };

  const handleResetThumbnail = async () => {
    if (!selected) return;
    const page = pages[0];
    if (!page) {
      toast.error("Upload the base PDF first.");
      return;
    }
    setThumbBusy(true);
    try {
      const previewPath = await uploadTemplateThumbnail(selected.id, page.dataUrl);
      await patchTemplate({ preview_path: previewPath } as any);
      toast.success("Thumbnail regenerated from page 1.");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not regenerate the thumbnail.");
    } finally {
      setThumbBusy(false);
    }
  };

  const handleSaveBoxes = async () => {
    if (!selected) return;
    try {
      await savePlaceholders.mutateAsync({ templateId: selected.id, placeholders: draft });
      toast.success("Placeholders saved.");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save placeholders.");
    }
  };

  /** Re-read the stored base PDF and refresh the trim size (fixes templates
   *  saved before trim-box detection, which stored the crop size). */
  const handleRedetectSize = async () => {
    if (!selected?.base_pdf_path) return;
    setRenderingPdf(true);
    try {
      const blob = await downloadFromS3(selected.base_pdf_path);
      const rendered = await rasterisePdfPages(blob, {
        targetLongPx: 1400,
      });
      if (rendered.length === 0) throw new Error("The PDF has no pages.");
      await upsertTemplate.mutateAsync({
        id: selected.id,
        product_family_id: productFamilyId,
        name: selected.name,
        page_count: rendered.length,
        trim_width_mm: rendered[0].widthMm,
        trim_height_mm: rendered[0].heightMm,
        trim_offset_x_mm: rendered[0].offsetXMm,
        trim_offset_y_mm: rendered[0].offsetYMm,
      } as any);
      setPages(rendered);
      toast.success(
        `Trim size updated — ${rendered[0].widthMm} × ${rendered[0].heightMm} mm${rendered[0].trimmed ? " (from the PDF trim box)" : ""}.`,
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Could not re-read the base PDF.");

    } finally {
      setRenderingPdf(false);
    }
  };

  const patchTemplate = async (updates: Partial<ArtworkTemplate>) => {
    if (!selected) return;
    await upsertTemplate.mutateAsync({
      id: selected.id,
      product_family_id: productFamilyId,
      name: selected.name,
      ...updates,
    } as any);
  };


  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedId ?? ""} onValueChange={setSelectedId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Choose a layout" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} {t.status === "draft" ? "(draft)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={handleCreate} disabled={upsertTemplate.isPending}>
          <Plus className="h-4 w-4 mr-1.5" /> New template
        </Button>
        {selected && (
          <>
            <Badge variant="outline">{selected.page_count} pages</Badge>
            {selected.trim_width_mm > 0 && (
              <Badge variant="outline">
                {selected.trim_width_mm} × {selected.trim_height_mm} mm trim
              </Badge>
            )}
            <Badge variant={selected.status === "published" ? "default" : "secondary"}>
              {selected.status === "published" ? "Published" : "Draft — not visible to customers"}
            </Badge>
            <Button
              size="sm"
              variant={selected.status === "published" ? "ghost" : "default"}
              onClick={async () => {
                const next = selected.status === "published" ? "draft" : "published";
                await patchTemplate({ status: next });
                toast.success(
                  next === "published"
                    ? "Published — customers can now choose this layout."
                    : "Unpublished — hidden from customers.",
                );
              }}
            >
              {selected.status === "published" ? "Unpublish" : "Publish"}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await deleteTemplate.mutateAsync(selected.id);
                setSelectedId(null);
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </>
        )}
      </div>

      {templates.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`w-32 shrink-0 rounded-lg border bg-background p-1.5 text-left transition hover:border-primary/60 ${
                t.id === selectedId ? "border-primary ring-2 ring-primary/30" : ""
              }`}
            >
              <TemplateThumb template={t} className="h-20 w-full" />
              <p className="mt-1 truncate px-0.5 text-xs font-medium">{t.name}</p>
              <p className="px-0.5 text-[11px] text-muted-foreground">
                {t.status === "published" ? "Published" : "Draft"}
              </p>
            </button>
          ))}
        </div>
      )}

      {!selected ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No customer templates yet. Create one, upload the multi-page base PDF, then draw the
          placeholder boxes your customers fill in.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Layout name</Label>
              <Input
                defaultValue={selected.name}
                key={selected.id}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== selected.name) patchTemplate({ name: v });
                }}
              />
            </div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1.5" />
                )}
                {selected.base_pdf_path ? "Replace base PDF" : "Upload base PDF"}
              </Button>
              {selected.base_pdf_path && (
                <Button variant="outline" onClick={handleRedetectSize} disabled={renderingPdf}>
                  Re-detect size
                </Button>
              )}
              <input
                ref={thumbRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleThumbnailUpload(f);
                }}
              />
              <Button variant="outline" onClick={() => thumbRef.current?.click()} disabled={thumbBusy}>
                {thumbBusy ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4 mr-1.5" />
                )}
                Upload thumbnail
              </Button>
              {pages.length > 0 && (
                <Button variant="ghost" onClick={handleResetThumbnail} disabled={thumbBusy}>
                  Reset to auto
                </Button>
              )}
              <Button onClick={handleSaveBoxes} disabled={savePlaceholders.isPending}>

                <Save className="h-4 w-4 mr-1.5" /> Save boxes
              </Button>
            </div>
          </div>

          {/* Trim geometry — everything in the editor is measured from this
              rectangle, exactly as in Illustrator. */}
          <div className="grid gap-3 sm:grid-cols-4">
            {([
              ["trim_width_mm", "Trim width (mm)"],
              ["trim_height_mm", "Trim height (mm)"],
              ["trim_offset_x_mm", "Trim left offset (mm)"],
              ["trim_offset_y_mm", "Trim top offset (mm)"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  step="0.1"
                  key={`${selected.id}-${key}`}
                  defaultValue={(selected as any)[key] ?? 0}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n !== (selected as any)[key]) {
                      patchTemplate({ [key]: n } as any);
                    }
                  }}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            The offsets say where the trimmed sheet sits on the supplied page (bleed and crop
            marks sit outside it). Placeholder positions are measured from the trim's top-left
            corner, so they match your Illustrator measurements.
          </p>

          {renderingPdf ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <TemplateBoxEditor
              pageImageUrl={pages[0]?.dataUrl ?? null}
              trimWidthMm={selected.trim_width_mm || pages[0]?.widthMm || 210}
              trimHeightMm={selected.trim_height_mm || pages[0]?.heightMm || 297}
              placeholders={draft}
              onChange={setDraft}
            />
          )}

          {pages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto rounded-lg border bg-muted/30 p-2">
              {pages.map((p) => (
                <img
                  key={p.index}
                  src={p.dataUrl}
                  alt={`Page ${p.index + 1}`}
                  className="h-20 w-auto rounded border bg-background"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
