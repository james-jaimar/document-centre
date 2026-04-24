import { useCallback, useState } from "react";
import {
  createAsset,
  cropRasterize,
  resize,
  pollJob,
  merge,
  getDerivedFiles,
} from "@/lib/documentCentreApi";
import { supabase } from "@/integrations/supabase/client";
import type { PhotoPrintEntry } from "@/lib/photoPrints/types";
import { getPhotoPrintSize, PHOTO_BORDER_OPTIONS } from "@/lib/photoPrints/sizes";

export interface PhotoRenderProgress {
  fileName: string;
  status: "pending" | "rendering" | "done" | "error";
  progress: number;
  statusText?: string;
  error?: string;
}

export interface RenderAllResult {
  perPhoto: Array<{ entryId: string; assetId: string | null; error?: string }>;
  mergedAssetId: string | null;
  mergedStoragePath: string | null;
  mergedDocumentId: string | null;
  mergeError?: string;
}

interface RenderAllArgs {
  photos: PhotoPrintEntry[];
  borderSlug: string;
  orderItemId: string;
}

/**
 * Server-side render queue. For each photo entry:
 *   1. Register a Document Centre asset for the original image
 *   2. Crop+rasterize at 300 DPI using croppedAreaPixels
 *   3. Resize to the chosen print size in mm (with border padding if requested)
 * Then merges every photo (repeated by quantity) into a single multi-page
 * PDF and stores it as a `documents` row keyed to the order item.
 */
export function usePhotoRenderQueue() {
  const [progress, setProgress] = useState<Record<string, PhotoRenderProgress>>({});
  const [mergeProgress, setMergeProgress] = useState<{ status: string; pct: number }>({
    status: "idle",
    pct: 0,
  });

  const update = useCallback((id: string, patch: Partial<PhotoRenderProgress>) => {
    setProgress((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch } as PhotoRenderProgress,
    }));
  }, []);

  const reset = useCallback(() => {
    setProgress({});
    setMergeProgress({ status: "idle", pct: 0 });
  }, []);

  const renderAll = useCallback(
    async ({ photos, borderSlug, orderItemId }: RenderAllArgs): Promise<RenderAllResult> => {
      const perPhoto: Array<{ entryId: string; assetId: string | null; error?: string }> = [];
      // Tracks the asset_id to merge per page (one entry per print, repeated by quantity).
      const pagesToMerge: string[] = [];

      const border = PHOTO_BORDER_OPTIONS.find((o) => o.slug === borderSlug);
      const borderMm = border?.border_mm ?? 0;

      for (const photo of photos) {
        update(photo.id, {
          fileName: photo.file_name,
          status: "pending",
          progress: 5,
          statusText: "Preparing…",
        });

        try {
          // 1. Register asset
          update(photo.id, { status: "rendering", progress: 15, statusText: "Registering image…" });
          const { asset_id } = await createAsset({
            original_filename: photo.file_name,
            media_type: photo.mime_type || "image/jpeg",
            source_storage_path: photo.original_storage_path,
            auto_queue: false,
          });

          // 2. Crop + rasterize at 300 DPI using croppedAreaPixels.
          const cap = photo.croppedAreaPixels;
          if (cap && cap.width > 0 && cap.height > 0) {
            update(photo.id, { progress: 40, statusText: "Cropping image…" });
            const box: [number, number, number, number] = [
              cap.x,
              cap.y,
              cap.x + cap.width,
              cap.y + cap.height,
            ];
            const { job_id } = await cropRasterize(asset_id, box, 300);
            await pollJob(job_id, (j) => {
              if (j.status === "running") {
                update(photo.id, { progress: 60, statusText: "Rendering…" });
              }
            });
          }

          // 3. Resize to the chosen print size in mm.
          // If border is requested, resize to the inner content box first
          // (size minus 2× borderMm) using "fit", then place that page on
          // the full-size sheet using "fit" again (the implicit padding
          // becomes the white border).
          const size = getPhotoPrintSize(photo.print_size_slug);
          update(photo.id, { progress: 78, statusText: "Resizing to print size…" });

          if (borderMm > 0) {
            const innerW = Math.max(1, size.width_mm - borderMm * 2);
            const innerH = Math.max(1, size.height_mm - borderMm * 2);
            const { job_id: innerJob } = await resize(asset_id, innerW, innerH, "fit");
            await pollJob(innerJob);
            const { job_id: outerJob } = await resize(
              asset_id,
              size.width_mm,
              size.height_mm,
              "fit",
            );
            await pollJob(outerJob);
          } else {
            const { job_id: resizeJobId } = await resize(
              asset_id,
              size.width_mm,
              size.height_mm,
              photo.fit_mode === "fit" ? "fit" : "fill",
            );
            await pollJob(resizeJobId);
          }

          update(photo.id, { status: "done", progress: 100, statusText: "Ready" });
          perPhoto.push({ entryId: photo.id, assetId: asset_id });

          // Push the asset once per copy
          const qty = Math.max(1, Math.floor(photo.quantity || 1));
          for (let i = 0; i < qty; i++) pagesToMerge.push(asset_id);
        } catch (err: any) {
          console.error("[photo-render] failed for", photo.file_name, err);
          update(photo.id, {
            status: "error",
            progress: 100,
            error: err?.message || "Render failed",
          });
          perPhoto.push({ entryId: photo.id, assetId: null, error: err?.message });
        }
      }

      // 4. Merge into a single multi-page PDF
      if (pagesToMerge.length === 0) {
        return {
          perPhoto,
          mergedAssetId: null,
          mergedStoragePath: null,
          mergedDocumentId: null,
          mergeError: "No pages to merge",
        };
      }

      try {
        setMergeProgress({ status: "Merging into print-ready PDF…", pct: 30 });
        const filename = `photo-prints-${orderItemId}.pdf`;
        const { job_id: mergeJobId } = await merge(pagesToMerge, filename);
        const mergeJob = await pollJob(mergeJobId, () => {
          setMergeProgress({ status: "Merging…", pct: 60 });
        });

        // The merge job's result usually carries the merged asset id.
        // Otherwise we look at derived files of the *first* asset for kind=merged.
        const resultAssetId =
          (mergeJob.result as any)?.asset_id ||
          (mergeJob.result as any)?.merged_asset_id ||
          null;

        let mergedAssetId: string | null = resultAssetId;
        let mergedStoragePath: string | null = null;

        if (mergedAssetId) {
          const derived = await getDerivedFiles(mergedAssetId);
          const mergedFile =
            derived.find((d) => d.kind === "merged") ||
            derived.find((d) => d.media_type === "application/pdf") ||
            derived[0];
          mergedStoragePath = mergedFile?.storage_path ?? null;
        } else {
          // Fallback: scan derived files of the first source asset
          const derived = await getDerivedFiles(pagesToMerge[0]);
          const mergedFile = derived.find((d) => d.kind === "merged");
          if (mergedFile) {
            mergedAssetId = mergedFile.asset_id;
            mergedStoragePath = mergedFile.storage_path;
          }
        }

        setMergeProgress({ status: "Saving…", pct: 85 });

        let mergedDocumentId: string | null = null;
        if (mergedStoragePath) {
          // Persist the merged PDF as a documents row tied to the order item.
          // Using `documents` (not order_documents) because it has user-side RLS.
          const { data: doc, error: docErr } = await supabase
            .from("documents")
            .insert({
              order_item_id: orderItemId,
              file_name: filename,
              file_path: mergedStoragePath,
              mime_type: "application/pdf",
              page_count: pagesToMerge.length,
              document_status: "ready",
              backend_asset_id: mergedAssetId,
              preflight_data: {
                kind: "photo_prints_merged",
                page_count: pagesToMerge.length,
              } as any,
            })
            .select("id")
            .single();
          if (docErr) {
            console.warn("[photo-render] documents insert failed", docErr);
          } else {
            mergedDocumentId = doc.id;
          }
        }

        setMergeProgress({ status: "Done", pct: 100 });
        return {
          perPhoto,
          mergedAssetId,
          mergedStoragePath,
          mergedDocumentId,
        };
      } catch (err: any) {
        console.error("[photo-render] merge failed", err);
        setMergeProgress({ status: "Merge failed", pct: 100 });
        return {
          perPhoto,
          mergedAssetId: null,
          mergedStoragePath: null,
          mergedDocumentId: null,
          mergeError: err?.message || "Merge failed",
        };
      }
    },
    [update],
  );

  return { progress, mergeProgress, renderAll, reset };
}
