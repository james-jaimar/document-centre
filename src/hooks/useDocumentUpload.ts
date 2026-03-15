import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { usePdfApi } from "@/hooks/usePdfApi";
import { useAuth } from "@/hooks/useAuth";

interface UploadProgress {
  fileName: string;
  status: "uploading" | "analyzing" | "done" | "error";
  progress: number;
  error?: string;
}

export function useDocumentUpload(orderItemId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pdfApi = usePdfApi();
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});

  const updateUpload = useCallback((fileName: string, update: Partial<UploadProgress>) => {
    setUploads((prev) => ({
      ...prev,
      [fileName]: { ...prev[fileName], ...update } as UploadProgress,
    }));
  }, []);

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
        updateUpload(fileName, { progress: 40 });

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
        updateUpload(fileName, { status: "analyzing", progress: 50 });

        // 3. Get a signed URL for the VPS to access
        const { data: signedData } = await supabase.storage
          .from("document-uploads")
          .createSignedUrl(storagePath, 3600);

        if (signedData?.signedUrl) {
          // 4. Call VPS /analyze-pdf
          const analysisResult = await pdfApi.invoke("analyze-pdf", {
            url: signedData.signedUrl,
            file_name: fileName,
          });

          if (analysisResult) {
            updateUpload(fileName, { progress: 75 });

            // Update document with analysis data
            await supabase
              .from("documents")
              .update({
                page_count: (analysisResult as any).page_count ?? null,
                page_width_mm: (analysisResult as any).page_width_mm ?? null,
                page_height_mm: (analysisResult as any).page_height_mm ?? null,
                preflight_data: (analysisResult as any).preflight ?? {},
                document_status: "analyzed",
              })
              .eq("id", doc.id);

            // 5. Call VPS /rasterize for thumbnails
            const rasterResult = await pdfApi.invoke("rasterize", {
              url: signedData.signedUrl,
              dpi: 72,
              format: "jpeg",
              max_pages: 200,
            });

            if (rasterResult && (rasterResult as any).thumbnails) {
              await supabase
                .from("documents")
                .update({
                  thumbnail_urls: (rasterResult as any).thumbnails,
                  document_status: "ready",
                })
                .eq("id", doc.id);
            }
          }
        }

        // Mark as ready even if analysis failed (file is uploaded)
        await supabase
          .from("documents")
          .update({ document_status: "ready" })
          .eq("id", doc.id)
          .eq("document_status", "processing");

        updateUpload(fileName, { status: "done", progress: 100 });
        qc.invalidateQueries({ queryKey: ["documents", orderItemId] });
        return doc;
      } catch (err: any) {
        updateUpload(fileName, {
          status: "error",
          error: err.message || "Upload failed",
        });
        return null;
      }
    },
    [orderItemId, user, updateUpload, pdfApi, qc]
  );

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

  return { uploads, uploadFile, uploadFiles, clearUploads };
}
