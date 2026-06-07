import { useState, useCallback, useRef, useEffect } from "react";
import type { PaperSize } from "@/lib/paperSizes";
import { sizesMatch as sizesMatchHelper } from "@/lib/paperSizes";
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
  prepareForProduct,
  renderPages,
} from "@/lib/documentCentreApi";
import { toStorageKey, pickBestPerPage, clearSignedUrlCache } from "@/lib/thumbnailUtils";
import { detectNonIsoSize, detectNearIsoWithBleed, matchIsoSize, matchBusinessCardSize, isBusinessCardFamily, UNKNOWN_SIZE_LABEL } from "@/lib/paperSizes";
import { isImageFile, imageFileToPdf, type TargetSize } from "@/lib/imageToPage";
import { isOfficeFile, officeMimeFromFilename } from "@/lib/officeFiles";
import { getPrintReadyPlan, type FamilyPrintConfig } from "@/lib/printIntent";
import {
  detectOrientationMismatch as policyDetectMismatch,
  advisoryModeFor,
  requiredOrientationFor,
} from "@/lib/orders/orientationPolicy";
import { clearPdfCacheEntry } from "@/lib/pdfBlobCache";

/**
 * Page-orientation policy.
 *
 * Two distinct rules — keep them straight when changing this code:
 *
 * 1. WHOLE-DOCUMENT orientation is owned by the customer. If the document
 *    as a whole violates the product's required orientation (e.g. an
 *    entirely landscape file uploaded against Bound Documents) we surface
 *    the OrientationAdvisory dialog and let the user choose to rotate or
 *    switch products. We do NOT silently rewrite their authored orientation.
 *
 * 2. PER-PAGE orientation INSIDE a product with a required orientation
 *    (Bound Documents / Ring Binders / Booklets = portrait, Presentations
 *    = landscape) is silently normalised at upload time. A bound document
 *    is a physical book — a single landscape page in a portrait book MUST
 *    be rotated 90° so it sits upright on the printed sheet. There is no
 *    UX upside to prompting for this; it is a printing necessity.
 *
 * The single source of truth for "which products require which orientation"
 * lives in `src/lib/orders/orientationPolicy.ts`.
 */

/**
 * Local adapter so existing call sites keep using the "to-portrait" /
 * "to-landscape" mode strings.
 */
function detectOrientationMismatch(
  familySlug: string | null | undefined,
  widthMm: number,
  heightMm: number,
): "to-landscape" | "to-portrait" | null {
  const target = policyDetectMismatch(familySlug, widthMm, heightMm);
  if (!target) return null;
  return advisoryModeFor(target);
}

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
  opts?: {
    onProgress?: (msg: string, pct: number) => void;
    /** When provided, skip enqueueing generate_previews and poll this
     *  pre-allocated job id instead. Used by the D-chaining path where
     *  print-ready already enqueued generate_previews server-side. */
    prechainedJobId?: string | null;
  },
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
  let cropJobId: string;
  if (opts?.prechainedJobId) {
    // D-chaining: print-ready server-side already enqueued generate_previews
    // immediately after CMYK conversion finished. Skip the extra round-trip
    // and just poll the pre-allocated job id.
    cropJobId = opts.prechainedJobId;
  } else {
    const enq = await generatePreviews(assetId, box ?? undefined);
    cropJobId = enq.job_id;
  }
  // Resolve expected page count once so the in-flight progress reporter can
  // show "Rendering pages… (X/N)" while the server job is still running.
  // Some backends only flip the job to "completed" after every page is
  // recorded, so without an in-flight progress signal the modal sits at
  // 75% for the full render duration (can be many minutes on cold starts).
  let inFlightExpected = 0;
  try {
    const a0 = await getAsset(assetId);
    inFlightExpected = a0.page_count ?? 0;
  } catch {
    inFlightExpected = 0;
  }

  const RENDER_STALL_MS = 90_000;
  const RENDER_STALL_ERROR = "render_job_stalled_no_page_progress";
  let lastReportedFound = inFlightExpected > 0 ? 0 : -1;
  let lastRenderProgressAt = Date.now();
  let derivedPollPromise: Promise<void> | null = null;
  const pollDerivedOnce = async () => {
    if (!inFlightExpected || derivedPollPromise) return;
    derivedPollPromise = (async () => {
      try {
        const dfs = await getDerivedFiles(assetId);
        let found = 0;
        const seen = new Set<number>();
        for (const f of dfs) {
          if (f.kind === "thumbnail_page" && f.page != null && !seen.has(f.page)) {
            seen.add(f.page);
            found++;
          }
        }
        if (found !== lastReportedFound) {
          if (found > lastReportedFound) lastRenderProgressAt = Date.now();
          lastReportedFound = found;
          const pct = 65 + (found / inFlightExpected) * 25;
          onProgress(
            found > 0
              ? `Rendering pages… (${found}/${inFlightExpected})`
              : "Rendering pages…",
            Math.min(92, pct),
          );
        }
      } catch {
        /* non-fatal */
      } finally {
        derivedPollPromise = null;
      }
    })();
  };

  let renderJobStalled = false;
  try {
    await pollJob(cropJobId, (job) => {
      if (job.status === "pending") onProgress("Queued — waiting for server…", 65);
      else if (job.status === "running") {
        // Trigger a derived-files poll in parallel so the user sees granular
        // page progress while the server task continues. Fire-and-forget — we
        // don't block the status poll loop on this lookup.
        void pollDerivedOnce();
        if (
          inFlightExpected > 0 &&
          lastReportedFound >= 0 &&
          lastReportedFound < inFlightExpected &&
          Date.now() - lastRenderProgressAt > RENDER_STALL_MS
        ) {
          throw new Error(RENDER_STALL_ERROR);
        }
      }
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err ?? "");
    if (msg.includes(RENDER_STALL_ERROR) || /Incomplete render|missing/i.test(msg)) {
      renderJobStalled = true;
      console.warn(
        `[renderDocumentThumbnails] asset=${assetId} render job did not complete cleanly; attempting page recovery:`,
        msg,
      );
    } else {
      throw err;
    }
  }

  if (renderJobStalled) {
    onProgress("Recovering missing pages…", 88);
  }

  // Poll for derived files to appear (rasterization writes them async)
  const asset = await getAsset(assetId);
  const expectedPages = asset.page_count ?? 1;

  // Aspect ratio hint for the thumbnail picker — derived from the asset's
  // CURRENT (post-rotation/resize) dimensions. This prevents stale
  // pre-rotation thumbnails from being selected if any happened to survive
  // backend cleanup.
  const targetAspect =
    asset.width_pt && asset.height_pt
      ? Number(asset.width_pt) / Number(asset.height_pt)
      : null;

  // Immediate first check — generate_previews writes derived files synchronously
  // before the task ends, so they're often already present when polling starts.
  let derivedFiles = await getDerivedFiles(assetId);
  let thumbnailPaths = pickBestPerPage(
    derivedFiles,
    asset.thumbnail_storage_path,
    asset.preview_storage_path,
    expectedPages,
    targetAspect,
  );

  const MAX_THUMB_POLLS = 45; // ~60s ceiling with adaptive backoff
  let interval = 150; // adaptive: 150ms → 1000ms ceiling — short docs land in 1-2 polls

  for (let i = 0; i < MAX_THUMB_POLLS; i++) {
    const found = thumbnailPaths.filter(Boolean).length;
    if (found >= expectedPages) break;

    const pct = 75 + (found / expectedPages) * 20;
    onProgress(`Rendering pages… (${found}/${expectedPages})`, Math.min(95, pct));

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(Math.round(interval * 1.3), 1000);
    derivedFiles = await getDerivedFiles(assetId);
    thumbnailPaths = pickBestPerPage(
      derivedFiles,
      asset.thumbnail_storage_path,
      asset.preview_storage_path,
      expectedPages,
      targetAspect,
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
        targetAspect,
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
  // Reaching the render stage means any orientation advisory has been
  // resolved (rotated, dismissed, or never raised). Strip the stale flag so
  // the OrderFiles useEffect does not re-open the advisory dialog when this
  // row write triggers a React Query refetch.
  delete nextPreflight.orientation_mismatch;

  // Persist the processed PDF path so the inline PDF preview renders the
  // post-conversion/rotation/CMYK file — NOT the original upload. Without
  // this, PdfPageView would fetch the raw DOCX upload or pre-rotation PDF.
  const processedPath = asset.normalized_storage_path ?? asset.source_storage_path;
  if (processedPath) {
    nextPreflight.processed_file_path = processedPath;
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
 * Self-heal: if the upload modal was closed (or the page reloaded) before
 * the document row got its thumbnails / "ready" flip, but the backend
 * actually finished rendering, finalise the row in place. Safe to call
 * from a useEffect — it no-ops unless the backend state genuinely covers
 * every page of the asset.
 *
 * Skips docs that are awaiting user review (size advisory) so we don't
 * stomp the "Review needed" chip.
 */
export async function reconcileStuckDocument(doc: {
  id: string;
  document_status: string | null;
  backend_asset_id: string | null;
  preflight_data: unknown;
  thumbnail_urls: unknown;
}): Promise<boolean> {
  if (doc.document_status !== "processing") return false;
  if (!doc.backend_asset_id) return false;
  const pf = (doc.preflight_data as Record<string, unknown> | null) ?? {};
  if (pf.awaiting_review === true) return false;
  if (Array.isArray(doc.thumbnail_urls) && doc.thumbnail_urls.length > 0) {
    return false;
  }

  try {
    const asset = await getAsset(doc.backend_asset_id);
    const expected = asset.page_count ?? 0;
    if (!expected || asset.status !== "ready") return false;

    const derivedFiles = await getDerivedFiles(doc.backend_asset_id);
    const targetAspect =
      asset.width_pt && asset.height_pt
        ? Number(asset.width_pt) / Number(asset.height_pt)
        : null;
    const thumbnailPaths = pickBestPerPage(
      derivedFiles,
      asset.thumbnail_storage_path,
      asset.preview_storage_path,
      expected,
      targetAspect,
    );
    const found = thumbnailPaths.filter(Boolean).length;
    if (found < expected) return false;

    clearSignedUrlCache(thumbnailPaths.filter(Boolean));

    const nextPreflight: Record<string, unknown> = { ...pf };
    delete nextPreflight.thumbnail_gaps;
    delete nextPreflight.orientation_mismatch;
    const processedPath =
      asset.normalized_storage_path ?? asset.source_storage_path;
    if (processedPath) nextPreflight.processed_file_path = processedPath;

    await supabase
      .from("documents")
      .update({
        thumbnail_urls: thumbnailPaths,
        document_status: "ready",
        preflight_data: nextPreflight as any,
      })
      .eq("id", doc.id)
      .eq("document_status", "processing");

    console.info(
      `[reconcileStuckDocument] healed doc=${doc.id} pages=${expected}`,
    );
    return true;
  } catch (err) {
    console.warn(`[reconcileStuckDocument] doc=${doc.id} failed:`, err);
    return false;
  }
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
  const targetAspect =
    asset.width_pt && asset.height_pt
      ? Number(asset.width_pt) / Number(asset.height_pt)
      : null;

  // Poll for derived files to flush after the salvage pass.
  const deadline = Date.now() + 20_000;
  let interval = 500;
  let derivedFiles = await getDerivedFiles(assetId);
  let thumbnailPaths = pickBestPerPage(
    derivedFiles,
    asset.thumbnail_storage_path,
    asset.preview_storage_path,
    expectedPages,
    targetAspect,
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
      targetAspect,
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
  sessionLockedSize?: PaperSize | null,
) {
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
  const qc = useQueryClient();
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});

  // Ref so in-flight uploads see the latest lock without restarting closures.
  const sessionLockedSizeRef = useRef<PaperSize | null>(sessionLockedSize ?? null);
  useEffect(() => {
    sessionLockedSizeRef.current = sessionLockedSize ?? null;
  }, [sessionLockedSize]);


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
   * For products with a required orientation (portrait or landscape), this
   * also runs a defensive normalize-orientation pass BEFORE print-ready.
   * This catches any landscape pages that survived the resize step (the
   * resize pipeline preserves each page's original orientation).
   *
   * Returns true on success (or when nothing to do); false only on hard
   * failure (callers continue rendering with the un-finalised PDF).
   */
  const finalizeOrientationAndPrintReady = useCallback(
    async (
      docId: string,
      assetId: string,
      fileName: string,
      chainOpts?: {
        chainGeneratePreviews?: boolean;
        chainRenderBox?: [number, number, number, number] | null;
      },
    ): Promise<{ ok: boolean; previewJobId: string | null }> => {
      const requiredOrient = requiredOrientationFor(productFamilySlug);
      const printPlan = getPrintReadyPlan(productFamilyPrintConfig);
      const wantChain = !!chainOpts?.chainGeneratePreviews;

      // ── Single server call: CMYK → orient → (no resize at this stage) ─
      // The server performs all mutations in the correct order inside one
      // pipeline. When chaining is requested, the server also enqueues
      // generate_previews against the pre-allocated `preview_job_id` and
      // hands the prepared PDF over a shared on-disk cache — saving one
      // S3 round-trip AND the prepare→previews polling gap.
      let previewJobId: string | null = null;
      try {
        updateUpload(fileName, { progress: 52, statusText: "Preparing for print…" });
        const { job_id, preview_job_id } = await prepareForProduct(assetId, {
          dominantOrientation: requiredOrient,
          destProfile: printPlan?.destProfile ?? null,
          intent: printPlan?.intent,
          chainGeneratePreviews: wantChain,
          chainRenderBox: chainOpts?.chainRenderBox ?? null,
        });
        previewJobId = preview_job_id ?? null;

        if (wantChain && previewJobId) {
          // Server will dispatch generate_previews itself the moment the
          // prepared PDF is committed. We don't need to poll the prepare
          // job — the caller polls the preview job, which only flips to
          // running AFTER prepare_for_product is done. Skip the wait so
          // the next inspectionrelated reads happen sooner.
          updateUpload(fileName, { progress: 58, statusText: "Preparing for print…" });
        } else {
          await pollJob(job_id, (job) => {
            if (job.status === "pending") updateUpload(fileName, { progress: 55, statusText: "Queued — preparing…" });
            else if (job.status === "running") updateUpload(fileName, { progress: 60, statusText: "Processing…" });
          });
        }
      } catch (prepareErr: any) {
        // Non-fatal — continue with the un-prepared PDF.
        console.warn("[upload] prepare-for-product failed (non-fatal):", prepareErr?.message);
        previewJobId = null;
      }

      // Persist what happened
      try {
        const { data: existing } = await supabase
          .from("documents")
          .select("preflight_data")
          .eq("id", docId)
          .maybeSingle();
        const preflight = (existing?.preflight_data as Record<string, unknown>) ?? {};
        const next: Record<string, unknown> = { ...preflight };
        next.print_ready_done = true;
        delete (next as any).print_ready_error;
        const asset = await getAsset(assetId);
        const processedPath = asset.normalized_storage_path ?? asset.source_storage_path;
        if (processedPath) {
          next.processed_file_path = processedPath;
          clearPdfCacheEntry(processedPath);
        }
        await supabase
          .from("documents")
          .update({ preflight_data: next as any })
          .eq("id", docId);
      } catch (persistErr: any) {
        console.warn("[upload] persist print_ready flag failed:", persistErr);
      }

      return { ok: true, previewJobId };
    },
    [productFamilyPrintConfig, productFamilySlug, updateUpload],
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
      opts?: {
        skipFinalize?: boolean;
        /** When supplied, the caller has already obtained metadata via
         *  the synchronous /v1/assets inline probe. We skip the Celery
         *  inspect_asset hop and the initial getAsset round-trip. */
        inlineInspect?: {
          page_count: number;
          width_pt: number;
          height_pt: number;
          boxes: Record<string, number[]>;
          mixed_orientation: boolean;
          status: string;
        } | null;
      },
    ) => {
      try {
        await supabase
          .from("documents")
          .update({ backend_asset_id: assetId })
          .eq("id", docId);

        let asset: Awaited<ReturnType<typeof getAsset>>;
        if (opts?.inlineInspect) {
          // Fast path: the server already returned metadata inline. No
          // Celery hop, no GET /assets round-trip.
          updateUpload(fileName, { progress: 45, statusText: "Reading page metadata…" });
          asset = await getAsset(assetId);
        } else {
          // Legacy path: queue inspect_asset and poll it.
          updateUpload(fileName, { progress: 35, statusText: "Inspecting PDF…" });
          const { job_id: inspectJobId } = await inspectAsset(assetId);
          await pollJob(inspectJobId, (job) => {
            if (job.status === "pending") {
              updateUpload(fileName, { progress: 35, statusText: "Queued — inspecting…" });
            } else if (job.status === "running") {
              updateUpload(fileName, { progress: 45, statusText: "Reading page metadata…" });
            }
          });
          asset = await getAsset(assetId);
        }

        // ── Per-page orientation normalisation ────────────────────────
        // For products with a required orientation (Bound Documents,
        // Ring Binders, Booklets, Presentations) we silently rotate any
        // page whose visual orientation doesn't match the product. This
        // is a print-correctness step, not a UX choice — a landscape
        // table page in a portrait bound document MUST be rotated 90°
        // CW so it sits upright on the printed sheet.
        //
        // OPTIMISATION: when the inline probe reported
        // `mixed_orientation: false` (i.e. every page is the same
        // orientation), we skip the explicit Celery hop entirely.
        // prepare_for_product still runs its own orientation pass
        // downstream, so any whole-document mismatch is still corrected.
        //
        // The whole-document OrientationAdvisory below still fires when
        // the *entire* document violates the policy (e.g. a fully
        // landscape file uploaded against Bound Documents) — that is a
        // genuine "wrong product / wrong file" situation that warrants
        // a user prompt.
        const requiredOrient = requiredOrientationFor(productFamilySlug);
        const pageCountForNormalise = Number(asset.page_count ?? 0);
        const documentLikelyMixed = opts?.inlineInspect
          ? opts.inlineInspect.mixed_orientation
          : true; // unknown when no probe — fall back to legacy behaviour
        if (requiredOrient && pageCountForNormalise > 1 && documentLikelyMixed) {
          try {
            updateUpload(fileName, {
              progress: 50,
              statusText: "Aligning page orientation…",
            });
            const { job_id: normJobId } = await normalizeOrientation(
              assetId,
              requiredOrient,
            );
            await pollJob(normJobId);
            // Re-fetch so the box/dimension reads below reflect the
            // rotated PDF (normalize_orientation promotes a new
            // normalized_storage_path with rebuilt boxes).
            asset = await getAsset(assetId);
          } catch (normErr: any) {
            // Non-fatal — fall back to the un-normalised PDF. The user
            // can still resolve any whole-doc orientation issue via the
            // advisory dialog.
            console.warn(
              "[upload] per-page normalize-orientation failed:",
              normErr,
            );
          }
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

        // Detect non-ISO size or near-ISO bleed for the advisory.
        // Order: exact ISO match → known non-ISO/presentation size → near-ISO+bleed → unknown.
        // Business cards: any of our recognised BC sizes counts as a clean
        // match — never raise the "custom size" advisory for them.
        const isBcFamily = isBusinessCardFamily(productFamilySlug);
        const bcSizeMatch = isBcFamily ? matchBusinessCardSize(pageWidthMm, pageHeightMm) : null;
        const isoMatch = bcSizeMatch ? null : matchIsoSize(pageWidthMm, pageHeightMm);
        const knownNonIso = bcSizeMatch || isoMatch ? null : detectNonIsoSize(pageWidthMm, pageHeightMm);
        const nearIsoMatch = bcSizeMatch || isoMatch || knownNonIso
          ? null
          : detectNearIsoWithBleed(pageWidthMm, pageHeightMm, productFamilySlug);
        const isUnknownSize = !bcSizeMatch && !isoMatch && !knownNonIso && !nearIsoMatch;
        const detectedSize = knownNonIso ?? (isUnknownSize ? UNKNOWN_SIZE_LABEL : null);

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

        // Orientation mismatch — gates Phase B render so the advisory fires
        // BEFORE we waste time rasterising the wrong-orientation document.
        const orientationMismatch = detectOrientationMismatch(
          productFamilySlug,
          pageWidthMm,
          pageHeightMm,
        );

        // Session lock-mismatch: an exact-ISO file whose ISO size differs
        // from the lock established by earlier uploads. Treated as an
        // advisory so we DEFER the (potentially slow) thumbnail render
        // until the user chooses Scale-to-lock or Keep-original.
        const lockedSize = sessionLockedSizeRef.current;
        const lockedSizeMismatch =
          !!lockedSize &&
          !!isoMatch &&
          !sizesMatchHelper(
            pageWidthMm,
            pageHeightMm,
            lockedSize.widthMm,
            lockedSize.heightMm,
          );

        const hasAdvisory = !!detectedSize || !!nearIsoMatch || !!orientationMismatch || lockedSizeMismatch;

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
        console.debug("[upload] asset.boxes after finalize", {
          fileName,
          family: productFamilySlug,
          hasTrim: !!finalTrimBox,
          hasCrop: !!finalCropBox,
          MediaBox: finalMediaBox,
          TrimBox: finalTrimBox,
          CropBox: finalCropBox,
          BleedBox: finalBoxes?.BleedBox,
        });
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
        if (printReadyDone) preflight.print_ready_done = true;
        if (detectedSize) preflight.detected_size = detectedSize;
        if (nearIsoMatch) {
          preflight.near_iso_match = nearIsoMatch.matchedSize.name;
          preflight.estimated_bleed_w = nearIsoMatch.bleedW;
          preflight.estimated_bleed_h = nearIsoMatch.bleedH;
          preflight.near_iso_landscape = nearIsoMatch.landscape;
        }
        // Persist explicit TrimBox / bleed signals so a later scale-to-size
        // call (e.g. A5 → A4) knows to ask the server for trim-aware
        // resizing even when the file is an exact ISO size with bleed.
        // For business cards we always stamp the TrimBox when one is present
        // so the preview's CSS trim-clip can engage even if the post-finalize
        // TrimBox momentarily equals the MediaBox.
        if (finalTrimBox && finalTrimBox.length === 4) {
          if (finalExplicitTrim || isBcFamily) {
            preflight.trim_box_pt = finalTrimBox;
            preflight.has_bleed = finalExplicitTrim || preflight.has_bleed === true;
          }
        }
        if (orientationMismatch) {
          preflight.orientation_mismatch = orientationMismatch;
        }
        if (lockedSizeMismatch && lockedSize && isoMatch) {
          preflight.locked_size_mismatch = true;
          preflight.locked_against = lockedSize.name;
          preflight.detected_iso_size = isoMatch.name;
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
    [updateUpload, finalizeOrientationAndPrintReady, productFamilySlug],
  );

  /* ── Phase A: Inspect — register PDF asset & extract metadata, NO thumbnails yet ── */

  const inspectDocument = useCallback(
    async (docId: string, storagePath: string, fileName: string) => {
      try {
        updateUpload(fileName, { statusText: "Registering file…", progress: 30 });

        // Register asset WITHOUT auto-queuing rasterization. The server
        // runs a pikepdf-only probe inline and returns metadata in the
        // response — no Celery hop for inspect.
        const { asset_id, inline_inspect } = await createAsset({
          original_filename: fileName,
          media_type: "application/pdf",
          source_storage_path: storagePath,
          auto_queue: false,
          inline_inspect: true,
        });

        // Defer finalize so the outer uploadFile flow can chain print-ready
        // → generate_previews server-side (single round-trip).
        return await inspectExistingAsset(docId, asset_id, fileName, {
          skipFinalize: true,
          inlineInspect: inline_inspect,
        });
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
          // resize → finaliseOrientationAndPrintReady from OrderFiles.
          // Finalisation for the no-advisory case is now handled below
          // (shared with the PDF branch) so we can chain print-ready →
          // generate_previews in a single server-side hop.
          inspection = await inspectExistingAsset(doc.id, asset_id, originalName, {
            skipFinalize: true,
          });
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
          // D-chaining: ask print-ready to enqueue generate_previews as its
          // final server-side step. Returns a pre-allocated `previewJobId`
          // we can poll directly — eliminating one client↔server round trip
          // while preserving the mandatory CMYK-first → RGB-thumbnail order.
          const { previewJobId } = await finalizeOrientationAndPrintReady(
            doc.id,
            inspection.asset_id,
            originalName,
            {
              chainGeneratePreviews: true,
              chainRenderBox: inspection.renderBox,
            },
          );

          updateUpload(originalName, { progress: 60, statusText: "Rendering pages…" });
          await renderDocumentThumbnails(doc.id, inspection.asset_id, inspection.renderBox, {
            onProgress: (msg, pct) => updateUpload(originalName, { statusText: msg, progress: pct }),
            prechainedJobId: previewJobId,
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

  /** Push a synthetic progress row so the upload-progress modal has something
   * to display BEFORE any server work starts. Used by the scale/keep
   * advisory handlers — server jobs can take 30–60s and without this the
   * user sees no feedback after clicking. */
  const beginManualProgress = useCallback(
    (fileName: string, statusText: string, progress = 8) => {
      updateUpload(fileName, {
        fileName,
        status: "analyzing",
        progress,
        statusText,
        error: undefined,
      });
    },
    [updateUpload],
  );

  /** Update the status text and/or progress for an existing manual entry. */
  const updateManualProgress = useCallback(
    (fileName: string, statusText?: string | null, progress?: number) => {
      const patch: Partial<UploadProgress> = {};
      if (statusText !== undefined && statusText !== null) patch.statusText = statusText;
      if (progress !== undefined) patch.progress = progress;
      if (Object.keys(patch).length === 0) return;
      updateUpload(fileName, patch);
    },
    [updateUpload],
  );

  return {
    uploads,
    uploadFile,
    uploadFiles,
    clearUploads,
    reprocessDocument,
    renderWithProgress,
    finalizeOrientationAndPrintReady,
    beginManualProgress,
    updateManualProgress,
  };
}
