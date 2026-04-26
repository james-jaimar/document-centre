import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "@/hooks/use-toast";
import {
  createAsset,
  generatePreviews,
  getAsset,
  getDerivedFiles,
  inspectAsset,
  pollJob,
  convertOffice,
  normalizeOrientation,
  printReady,
  renderPages,
} from "@/lib/documentCentreApi";
import { toStorageKey, pickBestPerPage, clearSignedUrlCache } from "@/lib/thumbnailUtils";
import { detectNonIsoSize, detectNearIsoWithBleed } from "@/lib/paperSizes";
import { isImageFile, imageFileToPdf, type TargetSize } from "@/lib/imageToPage";
import { isOfficeFile, officeMimeFromFilename } from "@/lib/officeFiles";
import { getPrintReadyPlan, type FamilyPrintConfig } from "@/lib/printIntent";

/**
 * Page-orientation policy.
 *
 * We DO NOT auto-rotate uploaded PDF pages on the server during upload. The
 * normaliser silently mutating page boxes was making landscape presentations,
 * leaflets, and bound documents render the wrong way up. Orientation is
 * either:
 *  - left as the customer authored it, or
 *  - changed explicitly by the customer via the OrientationAdvisory dialog
 *    (which calls `rotate(assetId, 90)` directly).
 *
 * The product-family hints below are kept for backwards compatibility (some
 * preflight code reads them) but are NO LONGER used to invoke
 * `normalizeOrientation` automatically.
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
  box: [number, number, number, number] | null,
  opts?: { onProgress?: (msg: string, pct: number) => void },
): Promise<string[]> {
  const onProgress = opts?.onProgress ?? (() => {});

  onProgress("Rendering pages…", 60);

  // Single Ghostscript pass — generate_previews on the VPS does both
  // preview + thumbnail (PIL downscale) in one shot.
  //
  // IMPORTANT: pass `box` only when the caller is intentionally trimming
  // (e.g. user-accepted bleed). For full-document rendering pass `null` so
  // the server renders each page using its own MediaBox. Passing a single
  // page-1-derived box as a global crop guillotines mixed-orientation pages.
  const { job_id: cropJobId } = await generatePreviews(assetId, box ?? undefined);
  await pollJob(cropJobId, (job) => {
    if (job.status === "pending") onProgress("Queued — waiting for server…", 65);
    else if (job.status === "running") onProgress("Rendering pages…", 75);
  });

  // Poll for derived files to appear (rasterization writes them async)
  const asset = await getAsset(assetId);
  const expectedPages = asset.page_count ?? 1;

  // Immediate first check — generate_previews writes derived files synchronously
  // before the task ends, so they're often already present when polling starts.
  let derivedFiles = await getDerivedFiles(assetId);
  let thumbnailPaths = pickBestPerPage(
    derivedFiles,
    asset.thumbnail_storage_path,
    asset.preview_storage_path,
    expectedPages,
  );

  const MAX_THUMB_POLLS = 45; // ~90s ceiling with adaptive backoff
  let interval = 500; // adaptive: 500ms → 1000ms → 2000ms ceiling

  for (let i = 0; i < MAX_THUMB_POLLS; i++) {
    const found = thumbnailPaths.filter(Boolean).length;
    if (found >= expectedPages) break;

    const pct = 75 + (found / expectedPages) * 20;
    onProgress(`Rendering pages… (${found}/${expectedPages})`, Math.min(95, pct));

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(Math.round(interval * 1.5), 2000);
    derivedFiles = await getDerivedFiles(assetId);
    thumbnailPaths = pickBestPerPage(
      derivedFiles,
      asset.thumbnail_storage_path,
      asset.preview_storage_path,
      expectedPages,
    );
  }

  // Compute gaps after the initial polling loop
  const computeMissing = (paths: string[]): number[] => {
    const out: number[] = [];
    for (let i = 0; i < paths.length; i++) if (!paths[i]) out.push(i + 1);
    return out;
  };

  let missing = computeMissing(thumbnailPaths);

  // ── Auto-recovery: surgically re-render any missing pages via the
  // /render-pages endpoint. Runs up to 2 passes; each pass triggers the
  // server-side render, polls the job, then polls derived files for ~20s.
  const RECOVERY_ATTEMPTS = 2;
  const RECOVERY_POLL_BUDGET_MS = 20_000;
  for (let attempt = 0; attempt < RECOVERY_ATTEMPTS && missing.length > 0; attempt++) {
    onProgress(
      `Recovering ${missing.length} missing page${missing.length === 1 ? "" : "s"}…`,
      90,
    );
    try {
      const { job_id } = await renderPages(assetId, missing);
      if (job_id) {
        await pollJob(job_id);
      }
    } catch (recoveryErr: any) {
      console.warn(
        `[renderDocumentThumbnails] asset=${assetId} recovery attempt ${attempt + 1} failed:`,
        recoveryErr,
      );
    }

    // Poll for derived files to flush after the salvage pass.
    const deadline = Date.now() + RECOVERY_POLL_BUDGET_MS;
    let recoveryInterval = 500;
    while (Date.now() < deadline) {
      derivedFiles = await getDerivedFiles(assetId);
      thumbnailPaths = pickBestPerPage(
        derivedFiles,
        asset.thumbnail_storage_path,
        asset.preview_storage_path,
        expectedPages,
      );
      missing = computeMissing(thumbnailPaths);
      if (missing.length === 0) break;
      await new Promise((r) => setTimeout(r, recoveryInterval));
      recoveryInterval = Math.min(Math.round(recoveryInterval * 1.5), 2000);
    }
  }

  if (missing.length > 0) {
    console.warn(
      `[renderDocumentThumbnails] asset=${assetId} still missing thumbnails after recovery:`,
      missing,
    );
  }

  // Compute final dimensions: prefer the trim/crop box when provided
  // (caller is intentionally trimming), otherwise fall back to the asset's
  // own reported dimensions (which already reflect any prior resize).
  let pageWidthMm: number;
  let pageHeightMm: number;
  if (box) {
    const widthPt = Math.abs(box[2] - box[0]);
    const heightPt = Math.abs(box[3] - box[1]);
    pageWidthMm = (widthPt * 25.4) / 72;
    pageHeightMm = (heightPt * 25.4) / 72;
  } else {
    pageWidthMm = ((asset.width_pt ?? 595) * 25.4) / 72;
    pageHeightMm = ((asset.height_pt ?? 842) * 25.4) / 72;
  }

  // Bust signed-url cache so the browser fetches the freshly rendered images
  clearSignedUrlCache(thumbnailPaths.filter(Boolean));

  // Stamp thumbnail_gaps into preflight_data so the file list can show a
  // recovery affordance. Read-modify-write to preserve other preflight keys.
  const { data: existingDoc } = await supabase
    .from("documents")
    .select("preflight_data")
    .eq("id", docId)
    .maybeSingle();
  const existingPreflight =
    (existingDoc?.preflight_data as Record<string, unknown> | null) ?? {};
  const nextPreflight: Record<string, unknown> = { ...existingPreflight };
  if (missing.length > 0) {
    nextPreflight.thumbnail_gaps = missing;
  } else {
    delete nextPreflight.thumbnail_gaps;
  }

  await supabase
    .from("documents")
    .update({
      thumbnail_urls: thumbnailPaths,
      page_width_mm: Math.round(pageWidthMm * 10) / 10,
      page_height_mm: Math.round(pageHeightMm * 10) / 10,
      document_status: "ready",
      preflight_data: nextPreflight as any,
    })
    .eq("id", docId);

  return thumbnailPaths;
}

/**
 * Manually re-trigger gap recovery for a document that still has missing
 * thumbnails after the upload flow finished. Used by the FileList
 * "Re-render missing pages" affordance.
 */
export async function recoverThumbnailGaps(
  docId: string,
  assetId: string,
  gaps: number[],
): Promise<{ thumbnailPaths: string[]; remainingGaps: number[] }> {
  const target = gaps && gaps.length > 0 ? gaps : ("missing" as const);

  const { job_id } = await renderPages(assetId, target);
  if (job_id) {
    await pollJob(job_id);
  }

  const asset = await getAsset(assetId);
  const expectedPages = asset.page_count ?? 1;

  // Poll for derived files to flush after the salvage pass.
  const deadline = Date.now() + 20_000;
  let interval = 500;
  let derivedFiles = await getDerivedFiles(assetId);
  let thumbnailPaths = pickBestPerPage(
    derivedFiles,
    asset.thumbnail_storage_path,
    asset.preview_storage_path,
    expectedPages,
  );
  let remainingGaps: number[] = [];
  while (true) {
    remainingGaps = [];
    for (let i = 0; i < thumbnailPaths.length; i++) {
      if (!thumbnailPaths[i]) remainingGaps.push(i + 1);
    }
    if (remainingGaps.length === 0 || Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(Math.round(interval * 1.5), 2000);
    derivedFiles = await getDerivedFiles(assetId);
    thumbnailPaths = pickBestPerPage(
      derivedFiles,
      asset.thumbnail_storage_path,
      asset.preview_storage_path,
      expectedPages,
    );
  }

  clearSignedUrlCache(thumbnailPaths.filter(Boolean));

  // Read-modify-write preflight to clear / update thumbnail_gaps
  const { data: existingDoc } = await supabase
    .from("documents")
    .select("preflight_data")
    .eq("id", docId)
    .maybeSingle();
  const existingPreflight =
    (existingDoc?.preflight_data as Record<string, unknown> | null) ?? {};
  const nextPreflight: Record<string, unknown> = { ...existingPreflight };
  if (remainingGaps.length > 0) {
    nextPreflight.thumbnail_gaps = remainingGaps;
  } else {
    delete nextPreflight.thumbnail_gaps;
  }

  await supabase
    .from("documents")
    .update({
      thumbnail_urls: thumbnailPaths,
      preflight_data: nextPreflight as any,
    })
    .eq("id", docId);

  return { thumbnailPaths, remainingGaps };
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
  /**
   * Run print-ready CMYK conversion against an asset whose dimensions are
   * already final. Safe to call after a `resize` job. Idempotent — server-side
   * no-ops when nothing needs to change.
   *
   * NOTE: orientation normalisation is intentionally NOT performed here. We
   * preserve the customer's authored orientation; explicit rotation only
   * happens when the user accepts the OrientationAdvisory.
   *
   * Returns true on success (or when nothing to do); false only on hard
   * failure (callers continue rendering with the un-finalised PDF).
   */
  const finalizeOrientationAndPrintReady = useCallback(
    async (
      docId: string,
      assetId: string,
      fileName: string,
    ): Promise<boolean> => {
      // Print-ready CMYK conversion (driven by per-product-family settings).
      const printPlan = getPrintReadyPlan(productFamilyPrintConfig);
      if (printPlan) {
        try {
          updateUpload(fileName, { progress: 55, statusText: "Optimising for print…" });
          const { job_id: printJobId } = await printReady(assetId, {
            intent: printPlan.intent,
            destProfile: printPlan.destProfile,
          });
          await pollJob(printJobId);
        } catch (printErr: any) {
          console.warn("[upload] print-ready failed:", printErr);
        }
      }

      // Mark the print-ready pass as complete so subsequent re-renders can
      // skip the redundant ICC conversion. We deliberately do NOT set
      // `orientation_normalized` — orientation is owned by the customer.
      try {
        const { data: existing } = await supabase
          .from("documents")
          .select("preflight_data")
          .eq("id", docId)
          .maybeSingle();
        const preflight = (existing?.preflight_data as Record<string, unknown>) ?? {};
        await supabase
          .from("documents")
          .update({
            preflight_data: { ...preflight, print_ready_done: true } as any,
          })
          .eq("id", docId);
      } catch (persistErr: any) {
        console.warn("[upload] persist print_ready_done flag failed:", persistErr);
      }

      return true;
    },
    [productFamilyPrintConfig, updateUpload],
  );

  /**
   * Inspect an asset and detect size advisories WITHOUT running
   * normalize-orientation or print-ready. Used as Phase A for both PDF and
   * Office uploads. The caller decides whether to run
   * `finalizeOrientationAndPrintReady` immediately (no advisory) or defer it
   * until the user resolves the size advisory in OrderFiles.
   */
  const inspectExistingAsset = useCallback(
    async (
      docId: string,
      assetId: string,
      fileName: string,
      opts?: { skipFinalize?: boolean },
    ) => {
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

        // If no size advisory AND caller didn't ask us to skip, finalise now
        // (print-ready CMYK only — orientation is preserved as authored).
        // For Office uploads with a size advisory we DEFER finalisation until
        // OrderFiles resolves the size.
        const shouldFinalizeNow = !hasAdvisory && !opts?.skipFinalize;
        let printReadyDone = false;
        if (shouldFinalizeNow) {
          await finalizeOrientationAndPrintReady(docId, assetId, fileName);
          printReadyDone = true;
          // print-ready may have rewritten the PDF (e.g. ICC conversion);
          // re-read the asset so dimensions/boxes reflect the final file.
          asset = await getAsset(assetId);
        }

        // Re-derive boxes/dimensions from possibly-mutated asset.
        const finalBoxes = asset.boxes as Record<string, number[]> | null;
        const finalTrimBox = finalBoxes?.TrimBox;
        const finalCropBox = finalBoxes?.CropBox;
        const finalMediaBox =
          finalBoxes?.MediaBox ?? [0, 0, asset.width_pt ?? 595, asset.height_pt ?? 842];
        const finalReportingBox = finalTrimBox ?? finalCropBox ?? finalMediaBox;
        const finalWidthPt = Math.abs(finalReportingBox[2] - finalReportingBox[0]);
        const finalHeightPt = Math.abs(finalReportingBox[3] - finalReportingBox[1]);
        const finalWidthMm = (finalWidthPt * 25.4) / 72;
        const finalHeightMm = (finalHeightPt * 25.4) / 72;
        const finalExplicitTrim =
          finalTrimBox &&
          finalMediaBox &&
          finalTrimBox.length === 4 &&
          finalMediaBox.length === 4 &&
          (Math.abs(finalTrimBox[0] - finalMediaBox[0]) > 0.5 ||
            Math.abs(finalTrimBox[1] - finalMediaBox[1]) > 0.5 ||
            Math.abs(finalTrimBox[2] - finalMediaBox[2]) > 0.5 ||
            Math.abs(finalTrimBox[3] - finalMediaBox[3]) > 0.5);

        // Persist preflight + provisional dimensions. NO thumbnails written yet.
        const preflight: Record<string, unknown> = {
          boxes: asset.boxes,
          width_pt: asset.width_pt,
          height_pt: asset.height_pt,
          effective_width_mm: finalWidthMm,
          effective_height_mm: finalHeightMm,
          status: asset.status,
          awaiting_review: hasAdvisory,
        };
        if (orientationNormalized) preflight.orientation_normalized = true;
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
            page_width_mm: finalWidthMm,
            page_height_mm: finalHeightMm,
            preflight_data: preflight as any,
            // 'processing' = either still rendering OR awaiting user review.
            // UI distinguishes via preflight_data.awaiting_review.
            document_status: "processing",
          })
          .eq("id", docId);

        return {
          asset_id: assetId,
          hasAdvisory,
          // Only carry an explicit render box when the PDF declares a real
          // TrimBox different from the MediaBox. Otherwise pass `null` so
          // generate-previews uses each page's own MediaBox — using the
          // page-1 MediaBox as a global crop guillotines mixed-orientation
          // pages (Word doc with a landscape table among portrait pages).
          renderBox: (finalExplicitTrim ? finalTrimBox : null) as [number, number, number, number] | null,
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
    [updateUpload, finalizeOrientationAndPrintReady],
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

      // Track the created document id outside the try so the catch can flip
      // its status to 'error' instead of leaving it stuck in 'processing'.
      let createdDocId: string | null = null;

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
        createdDocId = doc.id;
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

          // Office files: skip auto-finalise so we always inspect the
          // pristine LibreOffice output. The size advisory (if any) drives
          // resize → finaliseOrientationAndPrintReady from OrderFiles. If
          // there is no size advisory we still need to finalise here before
          // rendering — handled below after inspection returns.
          inspection = await inspectExistingAsset(doc.id, asset_id, originalName, {
            skipFinalize: true,
          });
          if (inspection && !inspection.hasAdvisory) {
            await finalizeOrientationAndPrintReady(doc.id, inspection.asset_id, originalName);
          }
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
        // Flip the documents row out of 'processing' so the file list
        // shows an error chip instead of an indefinite spinner.
        if (createdDocId) {
          try {
            await supabase
              .from("documents")
              .update({ document_status: "error" })
              .eq("id", createdDocId)
              .in("document_status", ["processing", "pending"]);
            qc.invalidateQueries({ queryKey: ["documents", effectiveId] });
          } catch (markErr) {
            console.warn("[upload] failed to mark document as error:", markErr);
          }
        }
        return null;
      }
    },
    [orderItemId, user, tenantId, updateUpload, inspectDocument, inspectExistingAsset, finalizeOrientationAndPrintReady, qc]
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
      box: [number, number, number, number] | null,
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
        try {
          await supabase
            .from("documents")
            .update({ document_status: "error" })
            .eq("id", docId)
            .in("document_status", ["processing", "pending"]);
          qc.invalidateQueries({ queryKey: ["documents", orderItemId] });
        } catch (markErr) {
          console.warn("[upload] failed to mark document as error:", markErr);
        }
      }
    },
    [updateUpload, qc, orderItemId],
  );

  return { uploads, uploadFile, uploadFiles, clearUploads, reprocessDocument, renderWithProgress, finalizeOrientationAndPrintReady };
}
