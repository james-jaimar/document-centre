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

interface UploadProgress {
  fileName: string;
  status: "uploading" | "analyzing" | "done" | "error";
  progress: number;
  error?: string;
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

  const processDocument = useCallback(
    async (docId: string, storagePath: string, fileName: string) => {
      try {
        // 1. Register asset with Document Centre API
        const fullStoragePath = `document-uploads/${storagePath}`;
        console.log("[upload] Registering asset:", fullStoragePath);

        const { asset_id, job_ids } = await createAsset({
          original_filename: fileName,
          media_type: "application/pdf",
          source_storage_path: fullStoragePath,
          auto_queue: true,
        });

        console.log("[upload] Asset registered:", asset_id, "jobs:", job_ids);

        // 2. Save backend_asset_id to documents row
        await supabase
          .from("documents")
          .update({ backend_asset_id: asset_id } as any)
          .eq("id", docId);

        // 3. Poll all jobs until complete
        if (job_ids.length > 0) {
          await Promise.all(
            job_ids.map((jobId) =>
              pollJob(jobId, (job) => {
                console.log(`[upload] Job ${jobId}: ${job.status}`);
              })
            )
          );
        }

        // 4. Fetch asset metadata
        const asset = await getAsset(asset_id);
        console.log("[upload] Asset metadata:", asset);

        const pageCount = asset.page_count ?? null;
        const widthPt = asset.width_pt;
        const heightPt = asset.height_pt;
        const pageWidthMm = widthPt != null ? (widthPt * 25.4) / 72 : null;
        const pageHeightMm = heightPt != null ? (heightPt * 25.4) / 72 : null;

        // 5. Fetch derived files for thumbnails
        const derivedFiles = await getDerivedFiles(asset_id);
        console.log("[upload] Derived files:", derivedFiles.length);

        // Build thumbnail URLs from derived files (prefer thumbnail_png, then preview_png)
        const thumbnailUrls: string[] = [];
        const thumbnailFiles = derivedFiles
          .filter((df) => df.kind === "thumbnail_png" || df.kind === "preview_png")
          .sort((a, b) => (a.page ?? 0) - (b.page ?? 0));

        for (const df of thumbnailFiles) {
          if (df.url) thumbnailUrls.push(df.url);
        }

        // Fall back to asset-level thumbnail/preview URL
        if (thumbnailUrls.length === 0 && asset.thumbnail_url) {
          thumbnailUrls.push(asset.thumbnail_url);
        }
        if (thumbnailUrls.length === 0 && asset.preview_url) {
          thumbnailUrls.push(asset.preview_url);
        }

        // 6. Update documents row with metadata
        await supabase
          .from("documents")
          .update({
            page_count: pageCount,
            page_width_mm: pageWidthMm,
            page_height_mm: pageHeightMm,
            thumbnail_urls: thumbnailUrls,
            preflight_data: {
              boxes: asset.boxes,
              width_pt: widthPt,
              height_pt: heightPt,
              status: asset.status,
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
    []
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
