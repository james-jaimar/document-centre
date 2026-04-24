import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "@/hooks/use-toast";
import {
  createAsset,
  cropRasterize,
  getAsset,
  getDerivedFiles,
  inspectAsset,
  pollJob,
  convertOffice,
  normalizeOrientation,
  printReady,
} from "@/lib/documentCentreApi";
import { toStorageKey, pickBestPerPage, clearSignedUrlCache } from "@/lib/thumbnailUtils";
import { detectNonIsoSize, detectNearIsoWithBleed } from "@/lib/paperSizes";
import { isImageFile, imageFileToPdf, type TargetSize } from "@/lib/imageToPage";
import { isOfficeFile, officeMimeFromFilename } from "@/lib/officeFiles";
import { getPrintReadyPlan, type FamilyPrintConfig } from "@/lib/printIntent";

/**
 * Product families whose output is bound/multi-page and where mixed-orientation
 * pages must be normalised so they all stack the same way up.
 *  - presentations: landscape-dominant (rotate portrait pages)
 *  - everything else here: portrait-dominant (rotate landscape pages)
 */
const PORTRAIT_NORMALIZE_FAMILIES = new Set([
  "bound-documents",
  "bound_documents",
  "ring-binder",
  "ring_binder",
  "booklets",
  "brochures",
]);
const LANDSCAPE_NORMALIZE_FAMILIES = new Set(["presentations"]);

interface UploadProgress {
  fileName: string;
  status: "uploading" | "analyzing" | "done" | "error";
  progress: number;
  error?: string;
  statusText?: string;
}

/**
 * Render thumbnails for an asset by cropping to the supplied PDF box (in points)
 * and updating the documents row when done. Single rasterization pass.
 *
 * Exported so OrderFiles advisory handlers (bleed/scale/rotate) can trigger
 * the single render after the user resolves the advisory.
 */
export async function renderDocumentThumbnails(
  docId: string,
  assetId: string,
  box: [number, number, number, number],
  opts?: { onProgress?: (msg: string, pct: number) => void },
): Promise<string[]> {
  const onProgress = opts?.onProgress ?? (() => {});

  onProgress("Rendering pages…", 60);

  // Single rasterization pass at the resolved box
  const { job_id: cropJobId } = await cropRasterize(assetId, box, 150);
  await pollJob(cropJobId, (job) => {
    if (job.status === "pending") onProgress("Queued — waiting for server…", 65);
    else if (job.status === "running") onProgress("Rendering pages…", 75);
  });

  // Poll for derived files to appear (rasterization writes them async)
  const asset = await getAsset(assetId);
  const expectedPages = asset.page_count ?? 1;

  let derivedFiles = await getDerivedFiles(assetId);
  let thumbnailPaths = pickBestPerPage(
    derivedFiles,
    asset.thumbnail_storage_path,
    asset.preview_storage_path,
  );

  const MAX_THUMB_POLLS = 60;
  let lastCount = -1;
  let stalePolls = 0;

  for (let i = 0; i < MAX_THUMB_POLLS; i++) {
    const found = thumbnailPaths.length;
    if (found >= expectedPages) break;

    if (found === lastCount) {
      stalePolls++;
      if (stalePolls >= 15 && found >= expectedPages * 0.8) break;
    } else {
      stalePolls = 0;
    }
    lastCount = found;

    const pct = 75 + (found / expectedPages) * 20;
    onProgress(`Rendering pages… (${found}/${expectedPages})`, Math.min(95, pct));

    await new Promise((r) => setTimeout(r, 3000));
    derivedFiles = await getDerivedFiles(assetId);
    thumbnailPaths = pickBestPerPage(
      derivedFiles,
      asset.thumbnail_storage_path,
      asset.preview_storage_path,
    );
  }

  // Compute final dimensions from the resolved box
  const widthPt = Math.abs(box[2] - box[0]);
  const heightPt = Math.abs(box[3] - box[1]);
  const pageWidthMm = (widthPt * 25.4) / 72;
  const pageHeightMm = (heightPt * 25.4) / 72;

  // Bust signed-url cache so the browser fetches the freshly rendered images
  clearSignedUrlCache(thumbnailPaths);

  await supabase
    .from("documents")
    .update({
      thumbnail_urls: thumbnailPaths,
      page_width_mm: Math.round(pageWidthMm * 10) / 10,
      page_height_mm: Math.round(pageHeightMm * 10) / 10,
      document_status: "ready",
    })
    .eq("id", docId);

  return thumbnailPaths;
}

export function useDocumentUpload(
  orderItemId: string | undefined,
  productFamilySlug?: string | null,
  productFamilyPrintConfig?: FamilyPrintConfig | null,
) {
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
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

  /**
   * Run inspect + advisory + persistence for an asset that has ALREADY been
   * registered with the PDF server. Used by both the standard PDF upload
   * path (after createAsset) and the Office conversion path (after the
   * conversion job has promoted the asset to a PDF).
   */
  const inspectExistingAsset = useCallback(
    async (docId: string, assetId: string, fileName: string) => {
      try {
        await supabase
          .from("documents")
          .update({ backend_asset_id: assetId })
          .eq("id", docId);

        // Explicitly enqueue an inspect job (this also authorizes the
        // asset for subsequent reads — without it GET /v1/assets/:id 401s).
        updateUpload(fileName, { progress: 35, statusText: "Inspecting PDF…" });
        const { job_id: inspectJobId } = await inspectAsset(assetId);

        await pollJob(inspectJobId, (job) => {
          if (job.status === "pending") {
            updateUpload(fileName, { progress: 35, statusText: "Queued — inspecting…" });
          } else if (job.status === "running") {
            updateUpload(fileName, { progress: 45, statusText: "Reading page metadata…" });
          }
        });

        // Normalise mixed-orientation pages for bound/ring-binder/presentation
        // products before we record the canonical dimensions. Server is a no-op
        // when nothing needs rotating.
        const familyKey = (productFamilySlug ?? "").toLowerCase();
        const dominant: "portrait" | "landscape" | null =
          PORTRAIT_NORMALIZE_FAMILIES.has(familyKey)
            ? "portrait"
            : LANDSCAPE_NORMALIZE_FAMILIES.has(familyKey)
              ? "landscape"
              : null;
        if (dominant) {
          try {
            updateUpload(fileName, { progress: 50, statusText: "Aligning page orientation…" });
            const { job_id: orientJobId } = await normalizeOrientation(assetId, dominant);
            await pollJob(orientJobId);
          } catch (orientErr: any) {
            // Non-fatal — surface a warning but continue with the original PDF.
            console.warn("[upload] normalize-orientation failed:", orientErr);
          }
        }

        // Poll the asset itself until we have boxes + page_count (metadata may
        // populate slightly after job completes for newly-created assets)
        let asset = await getAsset(assetId);
        for (let i = 0; i < 20 && (!asset.boxes || asset.page_count == null); i++) {
          await new Promise((r) => setTimeout(r, 1000));
          asset = await getAsset(assetId);
        }

        const boxes = asset.boxes as Record<string, number[]> | null;
        const trimBox = boxes?.TrimBox;
        const cropBox = boxes?.CropBox;
        const mediaBox =
          boxes?.MediaBox ?? [0, 0, asset.width_pt ?? 595, asset.height_pt ?? 842];

        // Pick the box for dimensions reporting (TrimBox → CropBox → MediaBox)
        const reportingBox = trimBox ?? cropBox ?? mediaBox;
        const widthPt = Math.abs(reportingBox[2] - reportingBox[0]);
        const heightPt = Math.abs(reportingBox[3] - reportingBox[1]);
        const pageWidthMm = (widthPt * 25.4) / 72;
        const pageHeightMm = (heightPt * 25.4) / 72;

        // Detect non-ISO size or near-ISO bleed for the advisory
        const detectedSize = detectNonIsoSize(pageWidthMm, pageHeightMm);
        const nearIsoMatch = !detectedSize
          ? detectNearIsoWithBleed(pageWidthMm, pageHeightMm)
          : null;

        // TrimBox differs from MediaBox? Treat it as an explicit author intent
        // (no advisory needed — render to TrimBox directly).
        const explicitTrim =
          trimBox &&
          mediaBox &&
          trimBox.length === 4 &&
          mediaBox.length === 4 &&
          (Math.abs(trimBox[0] - mediaBox[0]) > 0.5 ||
            Math.abs(trimBox[1] - mediaBox[1]) > 0.5 ||
            Math.abs(trimBox[2] - mediaBox[2]) > 0.5 ||
            Math.abs(trimBox[3] - mediaBox[3]) > 0.5);

        const hasAdvisory = !!detectedSize || !!nearIsoMatch;

        // Persist preflight + provisional dimensions. NO thumbnails written yet.
        const preflight: Record<string, unknown> = {
          boxes: asset.boxes,
          width_pt: asset.width_pt,
          height_pt: asset.height_pt,
          effective_width_mm: pageWidthMm,
          effective_height_mm: pageHeightMm,
          status: asset.status,
          awaiting_review: hasAdvisory,
        };
        if (detectedSize) preflight.detected_size = detectedSize;
        if (nearIsoMatch) {
          preflight.near_iso_match = nearIsoMatch.matchedSize.name;
          preflight.estimated_bleed_w = nearIsoMatch.bleedW;
          preflight.estimated_bleed_h = nearIsoMatch.bleedH;
          preflight.near_iso_landscape = nearIsoMatch.landscape;
        }

        await supabase
          .from("documents")
          .update({
            page_count: asset.page_count,
            page_width_mm: pageWidthMm,
            page_height_mm: pageHeightMm,
            preflight_data: preflight as any,
            // 'processing' = either still rendering OR awaiting user review.
            // UI distinguishes via preflight_data.awaiting_review.
            document_status: "processing",
          })
          .eq("id", docId);

        return {
          asset_id: assetId,
          hasAdvisory,
          renderBox: (explicitTrim ? trimBox : mediaBox) as [number, number, number, number],
        };
      } catch (err: any) {
        console.error("[upload] inspectExistingAsset failed:", err);
        toast({
          title: "Processing warning",
          description: `PDF analysis failed for ${fileName}: ${err.message}`,
          variant: "destructive",
        });
        return null;
      }
    },
    [updateUpload, productFamilySlug],
  );

  /* ── Phase A: Inspect — register PDF asset & extract metadata, NO thumbnails yet ── */

  const inspectDocument = useCallback(
    async (docId: string, storagePath: string, fileName: string) => {
      try {
        updateUpload(fileName, { statusText: "Registering file…", progress: 30 });

        // Register asset WITHOUT auto-queuing rasterization
        const { asset_id } = await createAsset({
          original_filename: fileName,
          media_type: "application/pdf",
          source_storage_path: storagePath,
          auto_queue: false,
        });

        return await inspectExistingAsset(docId, asset_id, fileName);
      } catch (err: any) {
        console.error("[upload] inspectDocument failed:", err);
        toast({
          title: "Processing warning",
          description: `PDF analysis failed for ${fileName}: ${err.message}`,
          variant: "destructive",
        });
        return null;
      }
    },
    [updateUpload, inspectExistingAsset]
  );

  /* ── Upload a single file ── */

  const MAX_FILE_SIZE_MB = 50;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  const uploadFile = useCallback(
    async (file: File, targetSize?: TargetSize, overrideOrderItemId?: string) => {
      const effectiveId = overrideOrderItemId || orderItemId;
      if (!effectiveId || !user) return null;

      const originalName = file.name;

      if (file.size > MAX_FILE_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        updateUpload(originalName, {
          fileName: originalName,
          status: "error",
          progress: 0,
          error: `File is ${sizeMb} MB — maximum allowed is ${MAX_FILE_SIZE_MB} MB`,
        });
        return null;
      }

      updateUpload(originalName, { fileName: originalName, status: "uploading", progress: 0 });

      try {
        const office = isOfficeFile(file);

        if (!office && isImageFile(file)) {
          updateUpload(originalName, { progress: 5, statusText: "Converting image to PDF…" });
          file = await imageFileToPdf(file, targetSize);
        }

        const fileName = file.name;
        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

        const storagePath = `tenants/${tenantId}/uploads/${user.id}/${effectiveId}/${safeFileName}`;
        const { uploadToS3 } = await import("@/lib/s3Storage");
        await uploadToS3(storagePath, file);
        updateUpload(originalName, { progress: 25, fileName: originalName });

        // Office files keep their original MIME so the converter knows what
        // to do; everything else is treated as PDF (images were already
        // converted to PDF above).
        const recordedMime = office
          ? officeMimeFromFilename(fileName)
          : file.type || "application/pdf";

        const { data: doc, error: docError } = await supabase
          .from("documents")
          .insert({
            order_item_id: effectiveId,
            file_name: fileName,
            file_path: storagePath,
            file_size: file.size,
            mime_type: recordedMime,
            document_status: "processing",
          })
          .select()
          .single();

        if (docError) throw docError;
        updateUpload(originalName, { status: "analyzing", progress: 30 });

        // Phase A: inspect-only (no rasterization).
        // For Office docs we first run a LibreOffice conversion job on the
        // PDF server, then inspect the resulting PDF.
        let inspection: Awaited<ReturnType<typeof inspectDocument>> = null;

        if (office) {
          updateUpload(originalName, {
            progress: 12,
            statusText: "Registering Office document…",
          });
          const { asset_id } = await createAsset({
            original_filename: fileName,
            media_type: recordedMime,
            source_storage_path: storagePath,
            auto_queue: false,
          });
          await supabase
            .from("documents")
            .update({ backend_asset_id: asset_id })
            .eq("id", doc.id);

          updateUpload(originalName, {
            progress: 18,
            statusText: "Converting to PDF…",
          });
          const { job_id: convertJobId } = await convertOffice(asset_id);
          const convertJob = await pollJob(convertJobId, (job) => {
            if (job.status === "pending") {
              updateUpload(originalName, {
                progress: 22,
                statusText: "Queued — waiting for converter…",
              });
            } else if (job.status === "running") {
              updateUpload(originalName, {
                progress: 30,
                statusText: "Converting document…",
              });
            }
          });
          if (convertJob.status !== "completed") {
            throw new Error(
              convertJob.error ||
                `Office conversion ${convertJob.status} — please check the file and try again.`,
            );
          }

          inspection = await inspectExistingAsset(doc.id, asset_id, originalName);
        } else {
          inspection = await inspectDocument(doc.id, storagePath, originalName);
        }

        if (!inspection) {
          await supabase
            .from("documents")
            .update({ document_status: "ready" })
            .eq("id", doc.id)
            .in("document_status", ["processing", "pending"]);
          updateUpload(originalName, { status: "done", progress: 100 });
          qc.invalidateQueries({ queryKey: ["documents", effectiveId] });
          return doc;
        }

        // Phase B: only render now if no advisory. Otherwise defer until the
        // user resolves the advisory dialog (bleed / non-ISO / orientation).
        if (!inspection.hasAdvisory) {
          updateUpload(originalName, { progress: 60, statusText: "Rendering pages…" });
          await renderDocumentThumbnails(doc.id, inspection.asset_id, inspection.renderBox, {
            onProgress: (msg, pct) => updateUpload(originalName, { statusText: msg, progress: pct }),
          });
        } else {
          // Leave document_status as 'processing' with awaiting_review=true so the
          // UI shows the advisory chip; the dialog handler will trigger render.
          updateUpload(originalName, {
            progress: 95,
            statusText: "Awaiting your review…",
          });
        }

        updateUpload(originalName, { status: "done", progress: 100 });
        qc.invalidateQueries({ queryKey: ["documents", effectiveId] });
        return doc;
      } catch (err: any) {
        console.error("[upload] Upload failed:", err);
        updateUpload(originalName, {
          status: "error",
          error: err.message || "Upload failed",
        });
        return null;
      }
    },
    [orderItemId, user, tenantId, updateUpload, inspectDocument, inspectExistingAsset, qc]
  );

  /* ── Reprocess an existing document (re-runs full inspect + render) ── */

  const reprocessDocument = useCallback(
    async (doc: { id: string; file_path: string; file_name: string }) => {
      await supabase
        .from("documents")
        .update({ document_status: "processing" })
        .eq("id", doc.id);

      const inspection = await inspectDocument(doc.id, doc.file_path, doc.file_name);

      if (!inspection) {
        await supabase
          .from("documents")
          .update({ document_status: "ready" })
          .eq("id", doc.id)
          .eq("document_status", "processing");
      } else if (!inspection.hasAdvisory) {
        await renderDocumentThumbnails(doc.id, inspection.asset_id, inspection.renderBox);
      }

      qc.invalidateQueries({ queryKey: ["documents", orderItemId] });
    },
    [inspectDocument, qc, orderItemId]
  );

  /* ── Upload multiple files ── */

  const uploadFiles = useCallback(
    async (files: FileList | File[], targetSize?: TargetSize, overrideOrderItemId?: string) => {
      const results = [];
      for (const file of Array.from(files)) {
        const result = await uploadFile(file, targetSize, overrideOrderItemId);
        results.push(result);
      }
      return results;
    },
    [uploadFile]
  );

  const clearUploads = useCallback(() => setUploads({}), []);

  /* ── Phase B (deferred): render thumbnails after advisory resolved, with live progress ── */
  const renderWithProgress = useCallback(
    async (
      docId: string,
      assetId: string,
      box: [number, number, number, number],
      fileName: string,
      initialStatusText = "Trimming and rendering pages…",
    ) => {
      // Re-open the upload entry in the progress modal
      updateUpload(fileName, {
        fileName,
        status: "analyzing",
        progress: 50,
        statusText: initialStatusText,
        error: undefined,
      });
      try {
        await renderDocumentThumbnails(docId, assetId, box, {
          onProgress: (msg, pct) =>
            updateUpload(fileName, { statusText: msg, progress: pct }),
        });
        updateUpload(fileName, { status: "done", progress: 100, statusText: "Ready" });
        qc.invalidateQueries({ queryKey: ["documents", orderItemId] });
      } catch (err: any) {
        console.error("[upload] renderWithProgress failed:", err);
        updateUpload(fileName, {
          status: "error",
          error: err?.message || "Render failed",
        });
      }
    },
    [updateUpload, qc, orderItemId],
  );

  return { uploads, uploadFile, uploadFiles, clearUploads, reprocessDocument, renderWithProgress };
}
