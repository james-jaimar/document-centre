import { useCallback, useState } from "react";
import { createAsset, cropRasterize, resize, pollJob } from "@/lib/documentCentreApi";
import type { PhotoPrintEntry } from "@/lib/photoPrints/types";
import { getPhotoPrintSize } from "@/lib/photoPrints/sizes";

export interface PhotoRenderProgress {
  fileName: string;
  status: "pending" | "rendering" | "done" | "error";
  progress: number;
  statusText?: string;
  error?: string;
}

/**
 * Server-side render queue. For each photo entry:
 *   1. Register a Document Centre asset for the original image
 *   2. Crop+rasterize at 300 DPI using croppedAreaPixels
 *   3. Resize to the chosen print size in mm
 * The resulting derived PDF lives in the Document Centre derived_files table
 * keyed by the asset; we record the render asset id back on the entry's
 * metadata so the production job can reference it.
 *
 * NOTE: Order/document persistence (order_documents row) is left to the
 * caller — this hook only orchestrates the rendering. Failures on a single
 * photo are captured in the progress map but do not block the rest.
 */
export function usePhotoRenderQueue() {
  const [progress, setProgress] = useState<Record<string, PhotoRenderProgress>>({});

  const update = useCallback((id: string, patch: Partial<PhotoRenderProgress>) => {
    setProgress((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch } as PhotoRenderProgress,
    }));
  }, []);

  const reset = useCallback(() => setProgress({}), []);

  const renderAll = useCallback(
    async (
      photos: PhotoPrintEntry[],
    ): Promise<Array<{ entryId: string; assetId: string | null; error?: string }>> => {
      const results: Array<{ entryId: string; assetId: string | null; error?: string }> = [];

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
          // The Document Centre `box` is in source-pixel units [x1, y1, x2, y2].
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

          // 3. Resize to the chosen print size in mm
          const size = getPhotoPrintSize(photo.print_size_slug);
          update(photo.id, { progress: 80, statusText: "Resizing to print size…" });
          const { job_id: resizeJobId } = await resize(
            asset_id,
            size.width_mm,
            size.height_mm,
            photo.fit_mode === "fit" ? "fit" : "fill",
          );
          await pollJob(resizeJobId);

          update(photo.id, { status: "done", progress: 100, statusText: "Ready" });
          results.push({ entryId: photo.id, assetId: asset_id });
        } catch (err: any) {
          console.error("[photo-render] failed for", photo.file_name, err);
          update(photo.id, {
            status: "error",
            progress: 100,
            error: err?.message || "Render failed",
          });
          // Don't bubble — degrade gracefully so the rest of the order continues
          results.push({ entryId: photo.id, assetId: null, error: err?.message });
        }
      }

      return results;
    },
    [update],
  );

  return { progress, renderAll, reset };
}
