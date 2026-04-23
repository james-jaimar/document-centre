import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { uploadToS3 } from "@/lib/s3Storage";
import { toast } from "sonner";

interface PhotoUploadProgress {
  fileName: string;
  status: "uploading" | "analyzing" | "done" | "error";
  progress: number;
  statusText?: string;
  error?: string;
}

export interface UploadedPhoto {
  documentId: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  width: number;
  height: number;
}

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** Read an image file's natural pixel dimensions client-side. */
async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // HEIC and similar may not load in browser — return 0/0 so we skip the warning.
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

/**
 * Photo-only uploader. Uploads original image to S3, creates a `documents`
 * row with image MIME type & page_count = 1. Skips PDF preflight entirely.
 */
export function usePhotoUpload(orderItemId: string | undefined) {
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
  const [uploads, setUploads] = useState<Record<string, PhotoUploadProgress>>({});

  const updateUpload = useCallback(
    (fileName: string, update: Partial<PhotoUploadProgress>) => {
      setUploads((prev) => ({
        ...prev,
        [fileName]: { ...prev[fileName], ...update } as PhotoUploadProgress,
      }));
    },
    [],
  );

  const uploadPhoto = useCallback(
    async (file: File, overrideOrderItemId?: string): Promise<UploadedPhoto | null> => {
      const effectiveId = overrideOrderItemId || orderItemId;
      if (!effectiveId || !user || !tenantId) return null;

      const fileName = file.name;

      if (file.size > MAX_FILE_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        updateUpload(fileName, {
          fileName,
          status: "error",
          progress: 0,
          error: `File is ${sizeMb} MB — maximum allowed is ${MAX_FILE_SIZE_MB} MB`,
        });
        return null;
      }

      updateUpload(fileName, { fileName, status: "uploading", progress: 5 });

      try {
        const dims = await readImageDimensions(file);
        updateUpload(fileName, { progress: 15, statusText: "Uploading…" });

        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `tenants/${tenantId}/uploads/${user.id}/${effectiveId}/photos/${crypto.randomUUID()}_${safeFileName}`;

        await uploadToS3(storagePath, file);
        updateUpload(fileName, { progress: 70, statusText: "Saving…" });

        // Approximate dimensions in mm at 72 DPI (only used as a metadata stub)
        const widthMm = dims.width ? (dims.width * 25.4) / 72 : null;
        const heightMm = dims.height ? (dims.height * 25.4) / 72 : null;

        const { data: doc, error: docError } = await supabase
          .from("documents")
          .insert({
            order_item_id: effectiveId,
            file_name: fileName,
            file_path: storagePath,
            file_size: file.size,
            mime_type: file.type || "image/jpeg",
            page_count: 1,
            page_width_mm: widthMm,
            page_height_mm: heightMm,
            document_status: "ready",
            preflight_data: {
              kind: "photo_print",
              source_width_px: dims.width,
              source_height_px: dims.height,
            } as any,
          })
          .select()
          .single();

        if (docError) throw docError;

        updateUpload(fileName, { status: "done", progress: 100, statusText: "Ready" });

        return {
          documentId: doc.id,
          fileName,
          storagePath,
          mimeType: file.type || "image/jpeg",
          width: dims.width,
          height: dims.height,
        };
      } catch (err: any) {
        console.error("[photo-upload] failed:", err);
        updateUpload(fileName, {
          status: "error",
          error: err?.message || "Upload failed",
        });
        toast.error(`Failed to upload ${fileName}`, {
          description: err?.message,
        });
        return null;
      }
    },
    [orderItemId, user, tenantId, updateUpload],
  );

  const uploadPhotos = useCallback(
    async (files: File[], overrideOrderItemId?: string): Promise<UploadedPhoto[]> => {
      const results: UploadedPhoto[] = [];
      for (const file of files) {
        const r = await uploadPhoto(file, overrideOrderItemId);
        if (r) results.push(r);
      }
      return results;
    },
    [uploadPhoto],
  );

  const clearUploads = useCallback(() => setUploads({}), []);

  return { uploads, uploadPhoto, uploadPhotos, clearUploads };
}
