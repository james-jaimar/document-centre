import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  createAsset,
  getAsset,
  getDerivedFiles,
  pollJob,
} from "@/lib/documentCentreApi";
import { toStorageKey } from "@/lib/thumbnailUtils";
import { detectNonIsoSize } from "@/lib/paperSizes";

interface UploadProgress {
  fileName: string;
  status: "uploading" | "analyzing" | "done" | "error";
  progress: number;
  error?: string;
  statusText?: string;
}

export function useDocumentUpload(orderItemId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});

  const updateUpload = useCallback(
    (fileName: string, update: Partial<UploadProgress>) => {
      setUploads((prev) => ({
        ...prev,
        [fileName]: { ...prev[fileName], ...update } as UploadProgress,
      }));
    },
    []
  );

  /* ── Process: register asset → poll jobs → fetch metadata ── */

  /** Helper: fetch asset metadata + derived thumbnails and build arrays */
  const fetchThumbnails = useCallback(
    async (asset_id: string) => {
      const asset = await getAsset(asset_id);
      const derivedFiles = await getDerivedFiles(asset_id);

      // Diagnostic: log what the server actually returns
      console.log("[upload] Derived files:", derivedFiles.map(df => ({
        kind: df.kind, page: df.page, media_type: df.media_type,
        path: df.storage_path?.slice(-40)
      })));

      const pageCount = asset.page_count ?? null;

      // Use trim box for dimensions (actual finished size) if available,
      // falling back through crop → media box (width_pt/height_pt)
      const boxes = asset.boxes as Record<string, number[]> | null;
      let effectiveWidthPt = asset.width_pt;
      let effectiveHeightPt = asset.height_pt;

      if (boxes) {
        // Priority: TrimBox → CropBox → MediaBox → asset.width_pt/height_pt
        const preferredBox = boxes.TrimBox ?? boxes.CropBox ?? boxes.MediaBox;
        if (preferredBox && preferredBox.length === 4) {
          const [x0, y0, x1, y1] = preferredBox;
          effectiveWidthPt = Math.abs(x1 - x0);
          effectiveHeightPt = Math.abs(y1 - y0);
          console.log(`[upload] Using ${boxes.TrimBox ? 'TrimBox' : boxes.CropBox ? 'CropBox' : 'MediaBox'}: ${effectiveWidthPt}×${effectiveHeightPt}pt`);
        }
      }

      const pageWidthMm = effectiveWidthPt != null ? (effectiveWidthPt * 25.4) / 72 : null;
      const pageHeightMm = effectiveHeightPt != null ? (effectiveHeightPt * 25.4) / 72 : null;

      // Broad filter: accept any per-page image derived file
      const thumbnailFiles = derivedFiles
        .filter((df) =>
          df.page != null &&
          df.storage_path &&
          (df.media_type?.startsWith("image/") ||
           /thumbnail|preview|page|png/i.test(df.kind))
        )
        .sort((a, b) => (a.page ?? 0) - (b.page ?? 0));

      // Deduplicate by page number (take first per page)
      const thumbnailPaths: string[] = [];
      const seenPages = new Set<number>();
      for (const df of thumbnailFiles) {
        const pg = df.page ?? 0;
        if (!seenPages.has(pg)) {
          seenPages.add(pg);
          thumbnailPaths.push(toStorageKey(df.storage_path));
        }
      }

      // Fallback to asset-level thumbnail/preview if no per-page files found
      if (thumbnailPaths.length === 0 && asset.thumbnail_storage_path) {
        thumbnailPaths.push(toStorageKey(asset.thumbnail_storage_path));
      }
      if (thumbnailPaths.length === 0 && asset.preview_storage_path) {
        thumbnailPaths.push(toStorageKey(asset.preview_storage_path));
      }

      return { asset, pageCount, pageWidthMm, pageHeightMm, thumbnailPaths };
    },
    []
  );

  /* ── Process: register asset → poll jobs → fetch metadata ── */

  const processDocument = useCallback(
    async (docId: string, storagePath: string, fileName: string) => {
      try {
        // 1. Register asset with Document Centre API
        console.log("[upload] Registering asset:", storagePath);
        updateUpload(fileName, { statusText: "Registering file…" });

        const { asset_id, job_ids } = await createAsset({
          original_filename: fileName,
          media_type: "application/pdf",
          source_storage_path: storagePath,
          auto_queue: true,
          render_box: "trim", // Use trim box for thumbnails (actual finished size, not bleed)
        });

        console.log("[upload] Asset registered:", asset_id, "jobs:", job_ids);

        // 2. Save backend_asset_id to documents row
        await supabase
          .from("documents")
          .update({ backend_asset_id: asset_id })
          .eq("id", docId);

        // 3. Poll all jobs to completion with queue-aware status
        if (job_ids.length > 0) {
          updateUpload(fileName, { progress: 35, statusText: "Queued — waiting for server…" });
          await Promise.all(
            job_ids.map((jobId) =>
              pollJob(jobId, (job) => {
                console.log(`[upload] Job ${jobId}: ${job.status}`);
                if (job.status === "pending") {
                  updateUpload(fileName, { progress: 35, statusText: "Queued — waiting for server…" });
                } else if (job.status === "running") {
                  updateUpload(fileName, { progress: 45, statusText: "Processing PDF…" });
                }
              })
            )
          );
        }

        updateUpload(fileName, { progress: 50, statusText: "Rendering pages…" });

        // 4. Poll for thumbnails — they are generated asynchronously after initial jobs
        let final_ = await fetchThumbnails(asset_id);
        const MAX_THUMB_POLLS = 60; // ~3 minutes at 3s intervals
        const expectedPages = final_.pageCount ?? 1;
        let lastCount = -1;
        let stalePolls = 0;

        for (let i = 0; i < MAX_THUMB_POLLS; i++) {
          const found = final_.thumbnailPaths.length;

          // Exit if we have all pages
          if (found >= expectedPages) break;

          // Exit if count hasn't changed for 15 polls (~45s) and we have ≥80% of pages
          if (found === lastCount) {
            stalePolls++;
            if (stalePolls >= 15 && found >= expectedPages * 0.8) {
              console.log(`[upload] Stale count after ${stalePolls} polls, accepting ${found}/${expectedPages} thumbnails`);
              break;
            }
          } else {
            stalePolls = 0;
          }
          lastCount = found;

          // Trickle progress: 20% for actual pages + 20% for time elapsed
          const progress = 50 + (found / expectedPages) * 20 + (i / MAX_THUMB_POLLS) * 20;
          updateUpload(fileName, { progress: Math.min(90, progress), statusText: `Rendering pages… (${found}/${expectedPages})` });

          await new Promise((r) => setTimeout(r, 3000));
          final_ = await fetchThumbnails(asset_id);
          console.log(`[upload] Thumbnail poll ${i + 1}: ${final_.thumbnailPaths.length}/${expectedPages} thumbnails`);
        }

        console.log("[upload] Final thumbnails:", final_.thumbnailPaths.length);

        // 5. Detect non-ISO paper size
        const detectedSize =
          final_.pageWidthMm != null && final_.pageHeightMm != null
            ? detectNonIsoSize(final_.pageWidthMm, final_.pageHeightMm)
            : null;

        // 6. Update documents row with full metadata
        await supabase
          .from("documents")
          .update({
            page_count: final_.pageCount,
            page_width_mm: final_.pageWidthMm,
            page_height_mm: final_.pageHeightMm,
            thumbnail_urls: final_.thumbnailPaths,
            preflight_data: {
              boxes: final_.asset.boxes,
              width_pt: final_.asset.width_pt,
              height_pt: final_.asset.height_pt,
              effective_width_mm: final_.pageWidthMm,
              effective_height_mm: final_.pageHeightMm,
              status: final_.asset.status,
              ...(detectedSize ? { detected_size: detectedSize } : {}),
            },
            document_status: "ready",
          })
          .eq("id", docId);

        return true;
      } catch (err: any) {
        console.error("[upload] processDocument failed:", err);
        toast({
          title: "Processing warning",
          description: `PDF analysis failed for ${fileName}: ${err.message}`,
          variant: "destructive",
        });
        return false;
      }
    },
    [fetchThumbnails, updateUpload, qc, orderItemId]
  );

  /* ── Upload a single file ── */

  const uploadFile = useCallback(
    async (file: File) => {
      if (!orderItemId || !user) return null;

      const fileName = file.name;
      updateUpload(fileName, { fileName, status: "uploading", progress: 0 });

      try {
        // 1. Upload to Supabase Storage
        const storagePath = `${user.id}/${orderItemId}/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("document-uploads")
          .upload(storagePath, file, { upsert: true });

        if (uploadError) throw uploadError;
        updateUpload(fileName, { progress: 30 });

        // 2. Create documents row
        const { data: doc, error: docError } = await supabase
          .from("documents")
          .insert({
            order_item_id: orderItemId,
            file_name: fileName,
            file_path: storagePath,
            file_size: file.size,
            mime_type: file.type || "application/pdf",
            document_status: "processing",
          })
          .select()
          .single();

        if (docError) throw docError;
        updateUpload(fileName, { status: "analyzing", progress: 40 });

        // 3. Register + process via Document Centre API
        const processed = await processDocument(doc.id, storagePath, fileName);

        if (!processed) {
          // Mark as ready even if processing failed (file is uploaded)
          await supabase
            .from("documents")
            .update({ document_status: "ready" })
            .eq("id", doc.id)
            .in("document_status", ["processing", "pending"]);
        }

        updateUpload(fileName, { status: "done", progress: 100 });
        qc.invalidateQueries({ queryKey: ["documents", orderItemId] });
        return doc;
      } catch (err: any) {
        console.error("[upload] Upload failed:", err);
        updateUpload(fileName, {
          status: "error",
          error: err.message || "Upload failed",
        });
        return null;
      }
    },
    [orderItemId, user, updateUpload, processDocument, qc]
  );

  /* ── Reprocess an existing document ── */

  const reprocessDocument = useCallback(
    async (doc: { id: string; file_path: string; file_name: string }) => {
      console.log("[upload] Reprocessing document:", doc.file_name);

      await supabase
        .from("documents")
        .update({ document_status: "processing" })
        .eq("id", doc.id);

      const processed = await processDocument(doc.id, doc.file_path, doc.file_name);

      if (!processed) {
        await supabase
          .from("documents")
          .update({ document_status: "ready" })
          .eq("id", doc.id)
          .eq("document_status", "processing");
      }

      qc.invalidateQueries({ queryKey: ["documents", orderItemId] });
    },
    [processDocument, qc, orderItemId]
  );

  /* ── Upload multiple files ── */

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const results = [];
      for (const file of Array.from(files)) {
        const result = await uploadFile(file);
        results.push(result);
      }
      return results;
    },
    [uploadFile]
  );

  const clearUploads = useCallback(() => setUploads({}), []);

  return { uploads, uploadFile, uploadFiles, clearUploads, reprocessDocument };
}
