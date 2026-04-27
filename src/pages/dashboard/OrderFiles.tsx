import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  useOrderData,
  useCreateOrder,
  useAddSection,
  useUpdateSection,
  useDeleteSection,
} from "@/hooks/useOrderBuilder";
import { useDocumentUpload, recoverThumbnailGaps } from "@/hooks/useDocumentUpload";
import FileUploader from "@/components/order/FileUploader";
import FileList from "@/components/order/FileList";
import SectionActions from "@/components/order/SectionActions";
import SectionList from "@/components/order/SectionList";
import { useSignedThumbnailUrl } from "@/lib/thumbnailUtils";
import { FileText, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import PreviewLightbox from "@/components/order/PreviewLightbox";
import UploadProgressModal from "@/components/order/UploadProgressModal";
import PaperSizeAdvisory from "@/components/order/PaperSizeAdvisory";
import BleedAdvisory from "@/components/order/BleedAdvisory";
import OrientationAdvisory from "@/components/order/OrientationAdvisory";
import ImageSizeDialog, { type ImageSizeSelection } from "@/components/order/ImageSizeDialog";
import PosterImageEditor, { type PosterEditorResult } from "@/components/order/PosterImageEditor";
import { isImageFile } from "@/lib/imageToPage";
import { imageToPosterPdf } from "@/lib/imageToPage";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resize, rotate, pollJob, cropRasterize, getAsset, getDerivedFiles, ensureFreshAsset, inspectAsset, normalizeOrientation } from "@/lib/documentCentreApi";
import { copyS3Object } from "@/lib/s3Storage";
import { useTenantContext } from "@/hooks/useTenantContext";
import { invalidateUserOrderCaches } from "@/lib/queryInvalidation";

import { toStorageKey, pickBestPerPage, clearSignedUrlCache } from "@/lib/thumbnailUtils";
import type { PaperSize, NearIsoMatch } from "@/lib/paperSizes";
import { isLandscape, ISO_SIZES, matchIsoSize, matchKnownSize, sizesMatch } from "@/lib/paperSizes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, X as XIcon } from "lucide-react";
import {
  requiredOrientationFor,
  orientationOf,
  violatesOrientationPolicy,
  advisoryModeFor,
} from "@/lib/orders/orientationPolicy";

export default function OrderFiles() {
  const { id: orderId, familyId: routeFamilyId, slug } = useParams<{ id: string; familyId: string; slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromDocId = searchParams.get("fromDoc");
  const createOrder = useCreateOrder();
  const { tenantId: activeTenantId } = useTenantContext();
  const qc = useQueryClient();

  // Track whether we're in "new order" mode (no order created yet)
  const isNewMode = !orderId && !!routeFamilyId;
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const effectiveOrderId = orderId ?? createdOrderId ?? undefined;
  const [copyError, setCopyError] = useState<string | null>(null);

  const {
    order,
    orderItem,
    documents,
    sections,
    loading,
    refetchDocuments,
    refetchSections,
  } = useOrderData(effectiveOrderId);

  // Fetch product family slug for orientation checks (also feeds the upload
  // hook so it can run orientation normalisation on bound/ring-binder/etc.)
  const productFamilyId = orderItem?.product_family_id ?? routeFamilyId ?? null;
  const { data: productFamily } = useQuery({
    queryKey: ["product_family", productFamilyId],
    queryFn: async () => {
      if (!productFamilyId) return null;
      const { data, error } = await supabase
        .from("product_families")
        .select("slug, color_output, cmyk_profile, render_intent")
        .eq("id", productFamilyId)
        .single();
      if (error) throw error;
      return data as { slug: string; color_output: string; cmyk_profile: string; render_intent: string };
    },
    enabled: !!productFamilyId,
  });

  const { uploads, uploadFiles, reprocessDocument, clearUploads, renderWithProgress, finalizeOrientationAndPrintReady } =
    useDocumentUpload(orderItem?.id, productFamily?.slug ?? null, productFamily ?? null);
  const addSection = useAddSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();

  // Helper: ensure an order exists before uploading, returns the orderItemId
  // When skipNavigate is true the caller is responsible for navigating after
  // its own async work completes (used by the fromDoc clone flow).
  const ensureOrder = useCallback(async (opts?: { skipNavigate?: boolean }): Promise<string> => {
    // Already have an order
    if (orderItem?.id) return orderItem.id;

    if (!routeFamilyId) throw new Error("No product family selected");

    const order = await createOrder.mutateAsync(routeFamilyId);
    setCreatedOrderId(order.id);

    // Fetch the order item that was just created
    const { data: newItem, error } = await supabase
      .from("order_items")
      .select("id")
      .eq("order_id", order.id)
      .limit(1)
      .single();
    if (error || !newItem) throw new Error("Failed to create order item");

    // Replace URL so browser shows the real order ID (no history push — use replace)
    if (!opts?.skipNavigate) {
      navigate(`/t/${slug}/orders/${order.id}/files`, { replace: true });
    }

    return newItem.id;
  }, [orderItem?.id, routeFamilyId, createOrder, slug, navigate]);

  // Auto-create order and copy a single document when arriving from "Recently Uploaded Files"
  // IMPORTANT: validate the source doc + its tenant BEFORE creating an order, so a
  // missing/cross-tenant file doesn't leave an orphan empty draft behind.
  const copyTriggeredRef = useRef(false);
  useEffect(() => {
    if (!fromDocId || !isNewMode || copyTriggeredRef.current) return;
    if (!activeTenantId) return; // wait for tenant context
    copyTriggeredRef.current = true;

    (async () => {
      try {
        // 1) Fetch source doc + parent order's tenant_id, BEFORE any mutations.
        const { data: sourceDoc, error: srcErr } = await supabase
          .from("documents")
          .select("*, order_items!inner(orders!inner(tenant_id))")
          .eq("id", fromDocId)
          .maybeSingle();

        if (srcErr || !sourceDoc) {
          setCopyError("That file is no longer available — please upload again.");
          toast.error("Source file not found", {
            description: "It may have been removed. Please upload again.",
          });
          // Refresh dashboard caches so the stale tile disappears
          invalidateUserOrderCaches(qc);
          return;
        }

        const sourceTenantId =
          (sourceDoc as any).order_items?.orders?.tenant_id ?? null;
        if (sourceTenantId && sourceTenantId !== activeTenantId) {
          setCopyError("That file belongs to a different store and can't be reused here.");
          toast.error("File not available in this store");
          return;
        }

        // 2) Source is valid — now create the order + item (WITHOUT navigating yet).
        const newItemId = await ensureOrder({ skipNavigate: true });

        // 3) Physically copy the S3 object to a new key keyed by the new order_item_id.
        const sourcePath: string = sourceDoc.file_path;
        const ext = sourcePath.includes(".") ? sourcePath.slice(sourcePath.lastIndexOf(".")) : "";
        const destPath = `order-items/${newItemId}/${crypto.randomUUID()}${ext}`;
        try {
          await copyS3Object(sourcePath, destPath);
        } catch (copyErr: any) {
          toast.error("Failed to copy file", { description: copyErr.message });
          setCopyError("Could not copy the source file. Please upload again.");
          return;
        }

        // 4) Insert the cloned document row pointing at the NEW path.
        const { error: insErr } = await supabase.from("documents").insert({
          order_item_id: newItemId,
          file_name: sourceDoc.file_name,
          file_path: destPath,
          file_size: sourceDoc.file_size,
          mime_type: sourceDoc.mime_type,
          page_count: sourceDoc.page_count,
          page_width_mm: sourceDoc.page_width_mm,
          page_height_mm: sourceDoc.page_height_mm,
          document_status: sourceDoc.document_status,
          preflight_data: sourceDoc.preflight_data,
          thumbnail_urls: sourceDoc.thumbnail_urls,
          backend_asset_id: sourceDoc.backend_asset_id,
          sort_order: sourceDoc.sort_order,
        });
        if (insErr) throw insErr;

        // 5) Invalidate caches so the file list and dashboard update.
        qc.invalidateQueries({ queryKey: ["documents", newItemId] });
        refetchDocuments();
        invalidateUserOrderCaches(qc);

        // 6) NOW navigate to the canonical order URL (clone is complete).
        const newOrderId = createdOrderId ?? orderId;
        if (newOrderId) {
          navigate(`/t/${slug}/orders/${newOrderId}/files`, { replace: true });
        }

        toast.success(`Copied "${sourceDoc.file_name}" into new order`);
      } catch (err: any) {
        toast.error("Failed to copy file", { description: err.message });
        setCopyError(err.message ?? "Unknown error");
      }
    })();
  }, [fromDocId, isNewMode, ensureOrder, refetchDocuments, activeTenantId, qc, createdOrderId, orderId, navigate, slug]);


  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [imageSizeDialogOpen, setImageSizeDialogOpen] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const pendingFilesRef = useRef<File[]>([]);
  // Poster image editor (crop / scale flow for image uploads on poster orders).
  const [posterEditorOpen, setPosterEditorOpen] = useState(false);
  const [pendingPosterFile, setPendingPosterFile] = useState<File | null>(null);
  const pendingPosterQueueRef = useRef<File[]>([]);
  const pendingPosterPassthroughRef = useRef<File[]>([]);
  const resolvedDocIds = useRef<Set<string>>(new Set());
  const [advisoryDoc, setAdvisoryDoc] = useState<{
    id: string;
    fileName: string;
    detectedSize: string;
    widthMm: number;
    heightMm: number;
    backendAssetId: string | null;
    /** When set, the dialog renders the "follow-the-lock" variant. */
    lockedSize?: PaperSize | null;
  } | null>(null);

  // ── Session paper-size lock ────────────────────────────────────
  // Once the user picks a target size on the first non-ISO doc (or uploads a
  // first clean ISO doc), we lock the session to that size. Subsequent uploads
  // either auto-apply silently or, if mismatched ISO, prompt the locked-variant
  // advisory. The lock is page-lifetime only — a reload deliberately resets it.
  type SessionSizeLock = {
    size: PaperSize;
    source: "user_chose" | "first_iso_upload";
    /** Original action so we can replay it for queued non-ISO docs */
    action: "keep" | "scale";
  };
  const [sessionSizeLock, setSessionSizeLock] = useState<SessionSizeLock | null>(null);
  // Tracks docs we've already auto-resolved against the lock so the effect
  // doesn't re-fire while DB updates are in flight.
  const autoAppliedDocIds = useRef<Set<string>>(new Set());
  // Tracks docs whose ISO size has been recorded (or used to set the lock)
  // so the ISO-detection effect runs once per doc.
  const isoCheckedDocIds = useRef<Set<string>>(new Set());


  // Orientation advisory state.
  // - "to-landscape": presentations product, file is portrait → offer to rotate to landscape.
  // - "to-portrait":  bound documents product, file is landscape → offer to rotate to portrait.
  const [orientationDoc, setOrientationDoc] = useState<{
    id: string;
    fileName: string;
    widthMm: number;
    heightMm: number;
    backendAssetId: string | null;
    mode: "to-landscape" | "to-portrait";
  } | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  // Bleed advisory state
  const [bleedDoc, setBleedDoc] = useState<{
    id: string;
    fileName: string;
    widthMm: number;
    heightMm: number;
    backendAssetId: string | null;
    nearMatch: NearIsoMatch;
  } | null>(null);
  const [isApplyingBleed, setIsApplyingBleed] = useState(false);

  // Check for near-ISO bleed documents after upload completes
  useEffect(() => {
    if (uploadModalOpen || advisoryDoc || bleedDoc || orientationDoc) return;
    const nearIsoDoc = documents.find((d) => {
      if (resolvedDocIds.current.has(d.id)) return false;
      const preflight = d.preflight_data as Record<string, any> | null;
      return preflight?.near_iso_match && !preflight?.bleed_resolved;
    });
    if (nearIsoDoc) {
      const preflight = nearIsoDoc.preflight_data as Record<string, any>;
      const matchedSize = ISO_SIZES.find((s) => s.name === preflight.near_iso_match);
      if (matchedSize) {
        setBleedDoc({
          id: nearIsoDoc.id,
          fileName: nearIsoDoc.file_name,
          widthMm: Number(nearIsoDoc.page_width_mm),
          heightMm: Number(nearIsoDoc.page_height_mm),
          backendAssetId: nearIsoDoc.backend_asset_id,
          nearMatch: {
            matchedSize,
            bleedW: preflight.estimated_bleed_w,
            bleedH: preflight.estimated_bleed_h,
            landscape: !!preflight.near_iso_landscape,
          },
        });
      }
    }
  }, [documents, uploadModalOpen, advisoryDoc, bleedDoc, orientationDoc]);

  // Check for orientation mismatches via the shared policy module — single
  // source of truth for which products require which orientation.
  useEffect(() => {
    if (uploadModalOpen || advisoryDoc || orientationDoc || bleedDoc) return;
    const familySlug = productFamily?.slug;
    const required = requiredOrientationFor(familySlug);
    if (!required) return;
    const mode = advisoryModeFor(required);

    const mismatchDoc = documents.find((d) => {
      const preflight = d.preflight_data as Record<string, any> | null;
      if (preflight?.orientation_resolved) return false;

      // Preferred: persisted flag from Phase A — fires before thumbnails render.
      if (preflight?.orientation_mismatch === mode) return true;

      // Fallback: dimension-based detection. Only when the row has no
      // orientation signal either way (so we don't re-open the dialog while
      // a rotation is in flight).
      if (preflight && (preflight.orientation_resolved || preflight.orientation_mismatch !== undefined)) {
        return false;
      }
      return violatesOrientationPolicy(familySlug, d.page_width_mm, d.page_height_mm);
    });
    if (mismatchDoc) {
      setOrientationDoc({
        id: mismatchDoc.id,
        fileName: mismatchDoc.file_name,
        widthMm: Number(mismatchDoc.page_width_mm),
        heightMm: Number(mismatchDoc.page_height_mm),
        backendAssetId: mismatchDoc.backend_asset_id,
        mode,
      });
    }
  }, [documents, uploadModalOpen, advisoryDoc, orientationDoc, bleedDoc, productFamily?.slug]);

  /** Helper: fetch the asset's MediaBox (used as the default render box) */
  const getMediaBox = useCallback(async (assetId: string): Promise<[number, number, number, number]> => {
    const asset = await getAsset(assetId);
    const boxes = asset.boxes as Record<string, number[]> | null;
    const mb = boxes?.MediaBox ?? [0, 0, asset.width_pt ?? 595, asset.height_pt ?? 842];
    return [mb[0], mb[1], mb[2], mb[3]];
  }, []);

  type SizeDocPayload = {
    id: string;
    fileName: string;
    widthMm: number;
    heightMm: number;
    backendAssetId: string | null;
  };

  /** Core: keep the doc at its original size and finalise it. */
  const applyKeepOriginal = useCallback(async (
    doc: SizeDocPayload,
    opts?: { silent?: boolean; lockedSize?: PaperSize | null },
  ) => {
    const existing = documents.find((d) => d.id === doc.id);
    const preflight = (existing?.preflight_data as Record<string, any>) ?? {};

    if (doc.backendAssetId) {
      try {
        setUploadModalOpen(true);

        let workingAssetId = doc.backendAssetId;
        if (existing?.file_path) {
          const fresh = await ensureFreshAsset({
            assetId: doc.backendAssetId,
            sourceStoragePath: existing.file_path,
            originalFilename: existing.file_name ?? doc.fileName,
            mediaType: existing.mime_type ?? "application/pdf",
          });
          if (fresh.recreated) {
            workingAssetId = fresh.assetId;
            await supabase
              .from("documents")
              .update({ backend_asset_id: workingAssetId })
              .eq("id", doc.id);
          }
        }

        if (!preflight?.print_ready_done) {
          await finalizeOrientationAndPrintReady(doc.id, workingAssetId, doc.fileName);
        }
        await renderWithProgress(
          doc.id,
          workingAssetId,
          null,
          doc.fileName,
          "Rendering pages…",
        );
      } catch (err: any) {
        toast.error("Render failed", { description: err.message });
      }
    }

    await supabase
      .from("documents")
      .update({
        preflight_data: { ...preflight, awaiting_review: false, size_resolved: true, size_action: "keep" },
      })
      .eq("id", doc.id);
    resolvedDocIds.current.add(doc.id);
    refetchDocuments();

    if (opts?.silent && opts?.lockedSize) {
      toast.info(`Kept ${opts.lockedSize.name} size to match other files`);
    } else {
      toast.success("Keeping original size");
    }
  }, [documents, refetchDocuments, renderWithProgress, finalizeOrientationAndPrintReady]);

  /** Core: scale the doc to a target paper size and finalise it. */
  const applyScaleTo = useCallback(async (
    doc: SizeDocPayload,
    target: PaperSize,
    opts?: { silent?: boolean },
  ) => {
    if (!doc.backendAssetId) {
      toast.error("Cannot scale — document has no backend asset");
      return;
    }
    resolvedDocIds.current.add(doc.id);

    try {
      if (!opts?.silent) toast.info(`Scaling to ${target.name}…`);
      const landscape = isLandscape(doc.widthMm, doc.heightMm);
      const targetW = landscape ? target.heightMm : target.widthMm;
      const targetH = landscape ? target.widthMm : target.heightMm;

      let workingAssetId = doc.backendAssetId;
      const docForRecovery = documents.find((d) => d.id === doc.id);
      if (docForRecovery?.file_path) {
        const fresh = await ensureFreshAsset({
          assetId: doc.backendAssetId,
          sourceStoragePath: docForRecovery.file_path,
          originalFilename: docForRecovery.file_name ?? doc.fileName,
          mediaType: docForRecovery.mime_type ?? "application/pdf",
        });
        if (fresh.recreated) {
          workingAssetId = fresh.assetId;
          await supabase
            .from("documents")
            .update({ backend_asset_id: workingAssetId })
            .eq("id", doc.id);
        }
      }

      const { job_id } = await resize(workingAssetId, targetW, targetH, "fit");
      await pollJob(job_id);

      setUploadModalOpen(true);

      const existingForFinalize = documents.find((d) => d.id === doc.id);
      const preflightForFinalize = (existingForFinalize?.preflight_data as Record<string, any>) ?? {};
      if (!preflightForFinalize?.print_ready_done) {
        await finalizeOrientationAndPrintReady(doc.id, workingAssetId, doc.fileName);
      }

      await renderWithProgress(
        doc.id,
        workingAssetId,
        null,
        doc.fileName,
        `Scaling to ${target.name} and rendering pages…`,
      );

      const existing = documents.find((d) => d.id === doc.id);
      const preflight = (existing?.preflight_data as Record<string, any>) ?? {};
      const { detected_size, ...rest } = preflight;
      await supabase
        .from("documents")
        .update({
          page_width_mm: targetW,
          page_height_mm: targetH,
          preflight_data: {
            ...rest,
            awaiting_review: false,
            size_resolved: true,
            size_action: `scaled_to_${target.name}`,
            original_width_mm: doc.widthMm,
            original_height_mm: doc.heightMm,
            effective_width_mm: targetW,
            effective_height_mm: targetH,
          },
        })
        .eq("id", doc.id);

      refetchDocuments();
      if (opts?.silent) {
        toast.success(`Auto-scaled "${doc.fileName}" to ${target.name} to match other files`);
      } else {
        toast.success(`Scaled to ${target.name} successfully`);
      }
    } catch (err: any) {
      toast.error("Scaling failed", { description: err.message });
    }
  }, [documents, refetchDocuments, renderWithProgress, finalizeOrientationAndPrintReady]);

  const handleKeepOriginal = useCallback(async () => {
    if (!advisoryDoc) return;
    const doc: SizeDocPayload = {
      id: advisoryDoc.id,
      fileName: advisoryDoc.fileName,
      widthMm: advisoryDoc.widthMm,
      heightMm: advisoryDoc.heightMm,
      backendAssetId: advisoryDoc.backendAssetId,
    };
    setAdvisoryDoc(null);

    // First-decision wins: if no lock yet, lock to the kept (original) size.
    // Use the matched known size if available so subsequent comparisons work
    // by name; otherwise synthesise a one-off PaperSize entry.
    if (!sessionSizeLock) {
      const matched = matchKnownSize(doc.widthMm, doc.heightMm);
      const lockedSize: PaperSize = matched ?? {
        name: `${Math.round(doc.widthMm)}×${Math.round(doc.heightMm)}mm`,
        widthMm: doc.widthMm,
        heightMm: doc.heightMm,
      };
      setSessionSizeLock({ size: lockedSize, source: "user_chose", action: "keep" });
    }

    await applyKeepOriginal(doc);
  }, [advisoryDoc, sessionSizeLock, applyKeepOriginal]);

  const handleScaleTo = useCallback(async (target: PaperSize) => {
    if (!advisoryDoc) return;
    const doc: SizeDocPayload = {
      id: advisoryDoc.id,
      fileName: advisoryDoc.fileName,
      widthMm: advisoryDoc.widthMm,
      heightMm: advisoryDoc.heightMm,
      backendAssetId: advisoryDoc.backendAssetId,
    };
    setAdvisoryDoc(null);

    // First-decision wins: lock the session to this target size unless the
    // user is explicitly overriding the existing lock by picking a different
    // size in the locked-variant modal.
    if (!sessionSizeLock) {
      setSessionSizeLock({ size: target, source: "user_chose", action: "scale" });
    } else if (sessionSizeLock.size.name !== target.name) {
      // User overrode the lock — replace it. The effects key off the new lock
      // for any future uploads.
      setSessionSizeLock({ size: target, source: "user_chose", action: "scale" });
    }

    await applyScaleTo(doc, target);
  }, [advisoryDoc, sessionSizeLock, applyScaleTo]);

  // ── Session size-lock effects ──────────────────────────────────
  // Non-ISO advisory: silent auto-apply when locked, prompt otherwise.
  useEffect(() => {
    if (uploadModalOpen) return;
    if (advisoryDoc) return;
    const nonIsoDoc = documents.find((d) => {
      if (resolvedDocIds.current.has(d.id)) return false;
      if (autoAppliedDocIds.current.has(d.id)) return false;
      const preflight = d.preflight_data as Record<string, any> | null;
      return preflight?.detected_size && !preflight?.size_resolved;
    });
    if (!nonIsoDoc) return;
    const preflight = nonIsoDoc.preflight_data as Record<string, any>;
    const payload: SizeDocPayload = {
      id: nonIsoDoc.id,
      fileName: nonIsoDoc.file_name,
      widthMm: Number(nonIsoDoc.page_width_mm),
      heightMm: Number(nonIsoDoc.page_height_mm),
      backendAssetId: nonIsoDoc.backend_asset_id,
    };

    if (sessionSizeLock) {
      autoAppliedDocIds.current.add(nonIsoDoc.id);
      if (sessionSizeLock.action === "keep") {
        void applyKeepOriginal(payload, { silent: true, lockedSize: sessionSizeLock.size });
      } else {
        void applyScaleTo(payload, sessionSizeLock.size, { silent: true });
      }
      return;
    }

    setAdvisoryDoc({
      id: nonIsoDoc.id,
      fileName: nonIsoDoc.file_name,
      detectedSize: preflight.detected_size,
      widthMm: Number(nonIsoDoc.page_width_mm),
      heightMm: Number(nonIsoDoc.page_height_mm),
      backendAssetId: nonIsoDoc.backend_asset_id,
    });
  }, [documents, uploadModalOpen, advisoryDoc, sessionSizeLock, applyKeepOriginal, applyScaleTo]);

  // ISO uploads: set lock if none exists, otherwise prompt locked-variant
  // advisory if the doc's ISO size differs from the lock.
  useEffect(() => {
    if (uploadModalOpen) return;
    if (advisoryDoc || bleedDoc || orientationDoc) return;

    const candidate = documents.find((d) => {
      if (isoCheckedDocIds.current.has(d.id)) return false;
      if (resolvedDocIds.current.has(d.id)) return false;
      const preflight = d.preflight_data as Record<string, any> | null;
      if (preflight?.detected_size && !preflight?.size_resolved) return false;
      if (preflight?.near_iso_match && !preflight?.bleed_resolved) return false;
      if (preflight?.awaiting_review) return false;
      const w = Number(d.page_width_mm);
      const h = Number(d.page_height_mm);
      if (!(w > 0 && h > 0)) return false;
      return matchIsoSize(w, h) !== null;
    });

    if (!candidate) return;
    const w = Number(candidate.page_width_mm);
    const h = Number(candidate.page_height_mm);
    const matched = matchIsoSize(w, h)!;

    if (!sessionSizeLock) {
      isoCheckedDocIds.current.add(candidate.id);
      setSessionSizeLock({ size: matched, source: "first_iso_upload", action: "scale" });
      return;
    }

    if (sizesMatch(w, h, sessionSizeLock.size.widthMm, sessionSizeLock.size.heightMm)) {
      isoCheckedDocIds.current.add(candidate.id);
      return;
    }

    isoCheckedDocIds.current.add(candidate.id);
    setAdvisoryDoc({
      id: candidate.id,
      fileName: candidate.file_name,
      detectedSize: matched.name,
      widthMm: w,
      heightMm: h,
      backendAssetId: candidate.backend_asset_id,
      lockedSize: sessionSizeLock.size,
    });
  }, [documents, uploadModalOpen, advisoryDoc, bleedDoc, orientationDoc, sessionSizeLock]);

  // Orientation handlers — rotates 90° in the direction the advisory was opened for.
  const handleRotateOrientation = useCallback(async () => {
    if (!orientationDoc?.backendAssetId) {
      toast.error("Cannot rotate — document has no backend asset");
      setOrientationDoc(null);
      return;
    }
    const toPortrait = orientationDoc.mode === "to-portrait";
    const targetLabel = toPortrait ? "portrait" : "landscape";
    setIsRotating(true);
    try {
      // Use the explicit-target normalize-orientation pipeline. Unlike
      // `rotate(90)`, this guarantees the resulting PDF matches the requested
      // orientation: pages already in the right orientation are left alone,
      // and rotated pages are baked onto a swapped-dimension MediaBox so the
      // rasterizer can't disagree with the viewer.
      const target = toPortrait ? "portrait" : "landscape";
      toast.info(`Rotating to ${targetLabel}…`);

      const existing = documents.find((d) => d.id === orientationDoc.id);
      const oldPaths = Array.isArray(existing?.thumbnail_urls)
        ? (existing!.thumbnail_urls as string[]).filter(Boolean)
        : [];
      if (oldPaths.length) clearSignedUrlCache(oldPaths);

      const { job_id } = await normalizeOrientation(orientationDoc.backendAssetId, target);
      await pollJob(job_id);

      // Re-fetch authoritative dimensions from the asset. Prefer TrimBox →
      // CropBox → MediaBox so a PDF with bleed reports its FINISHED size,
      // not the oversized media canvas.
      const refreshed = await getAsset(orientationDoc.backendAssetId);
      const refBoxes = (refreshed.boxes ?? null) as Record<string, number[]> | null;
      const trimBox = refBoxes?.TrimBox;
      const cropBox = refBoxes?.CropBox;
      const mediaBox =
        refBoxes?.MediaBox ?? [0, 0, refreshed.width_pt ?? 0, refreshed.height_pt ?? 0];
      const reportingBox = (trimBox && trimBox.length === 4 ? trimBox
        : cropBox && cropBox.length === 4 ? cropBox
        : mediaBox) as number[];
      const widthPt = Math.abs(reportingBox[2] - reportingBox[0]);
      const heightPt = Math.abs(reportingBox[3] - reportingBox[1]);
      const widthMm = widthPt > 0 ? (widthPt * 25.4) / 72 : orientationDoc.heightMm;
      const heightMm = heightPt > 0 ? (heightPt * 25.4) / 72 : orientationDoc.widthMm;

      // VERIFY the result actually matches the target orientation.
      const resultOrientation = orientationOf(widthMm, heightMm);
      if (resultOrientation !== target) {
        throw new Error(
          `Rotation did not produce a ${target} document (got ${resultOrientation ?? "unknown"} ${Math.round(widthMm)}×${Math.round(heightMm)}mm). Please try again or use a different file.`,
        );
      }

      // Authoritative source of truth for previews is the rotated PDF on
      // the server. We DO NOT pass a client-derived render box — the
      // backend auto-derives the correct box (TrimBox → BleedBox →
      // MediaBox) from the rotated PDF it just promoted. Passing a
      // pre-rotation box from the document row was the cause of previews
      // rendering the full bleed/crop-mark canvas after rotation.
      const explicitTrim = !!(trimBox && trimBox.length === 4);
      const renderBoxForPreview: [number, number, number, number] | null = null;

      const preflight = (existing?.preflight_data as Record<string, any>) ?? {};
      const { orientation_mismatch: _om, ...preflightRest } = preflight;
      await supabase
        .from("documents")
        .update({
          page_width_mm: Math.round(widthMm * 10) / 10,
          page_height_mm: Math.round(heightMm * 10) / 10,
          thumbnail_urls: [],
          preflight_data: {
            ...preflightRest,
            awaiting_review: false,
            orientation_resolved: true,
            orientation_action: "rotated",
            effective_width_mm: widthMm,
            effective_height_mm: heightMm,
            // Persist the refreshed post-rotation boxes so the UI no
            // longer carries stale pre-rotation geometry.
            boxes: refBoxes ?? undefined,
            ...(explicitTrim ? { trim_box_pt: trimBox } : {}),
          },
        })
        .eq("id", orientationDoc.id);

      // Render the rotated document — backend auto-derives the render
      // box from the new PDF's own TrimBox.
      setUploadModalOpen(true);
      await renderWithProgress(
        orientationDoc.id,
        orientationDoc.backendAssetId,
        renderBoxForPreview,
        orientationDoc.fileName,
        `Rotating to ${targetLabel} and rendering pages…`,
      );

      // Defensive re-assert.
      await supabase
        .from("documents")
        .update({
          preflight_data: {
            ...preflightRest,
            awaiting_review: false,
            orientation_resolved: true,
            orientation_action: "rotated",
            effective_width_mm: widthMm,
            effective_height_mm: heightMm,
            ...(explicitTrim ? { trim_box_pt: trimBox } : {}),
          },
        })
        .eq("id", orientationDoc.id);

      setOrientationDoc(null);
      refetchDocuments();
      toast.success(`Rotated to ${targetLabel}`);
    } catch (err: any) {
      toast.error("Rotation failed", { description: err.message });
    } finally {
      setIsRotating(false);
    }
  }, [orientationDoc, documents, refetchDocuments, renderWithProgress]);

  const handleSwitchProductFamily = useCallback(() => {
    const toPortrait = orientationDoc?.mode === "to-portrait";
    setOrientationDoc(null);
    navigate(`/t/${slug}/orders/new`);
    toast.info(
      toPortrait
        ? "Please select Presentations for landscape files"
        : "Please select Bound Documents for portrait files"
    );
  }, [navigate, slug, orientationDoc]);

  /**
   * User dismissed the orientation advisory — keep the file as-is. We must
   * still trigger Phase B (thumbnail render), since it was deferred while
   * we waited for their decision. Mirrors the bleed/size "keep" branches.
   */
  const handleDismissOrientation = useCallback(async () => {
    if (!orientationDoc) return;
    const doc = orientationDoc;
    setOrientationDoc(null);

    const existing = documents.find((d) => d.id === doc.id);
    const preflight = (existing?.preflight_data as Record<string, any>) ?? {};
    const { orientation_mismatch: _om, ...preflightRest } = preflight;
    const needsRender = !Array.isArray(existing?.thumbnail_urls) || (existing?.thumbnail_urls as unknown[]).length === 0;

    try {
      if (needsRender && doc.backendAssetId) {
        setUploadModalOpen(true);
        await renderWithProgress(
          doc.id,
          doc.backendAssetId,
          null,
          doc.fileName,
          "Rendering pages…",
        );
      }
      await supabase
        .from("documents")
        .update({
          preflight_data: { ...preflightRest, awaiting_review: false, orientation_resolved: true, orientation_action: "kept" },
        })
        .eq("id", doc.id);
      refetchDocuments();
    } catch (err: any) {
      toast.error("Render failed", { description: err.message });
    }
  }, [orientationDoc, documents, renderWithProgress, refetchDocuments]);

  // Bleed advisory handler
  const handleBleedConfirm = useCallback(async (choice: "match" | "custom" | "keep", customBleedMm?: number) => {
    if (!bleedDoc) return;

    if (choice === "keep") {
      // Render full document, no global crop box.
      if (bleedDoc.backendAssetId) {
        try {
          setUploadModalOpen(true);
          await renderWithProgress(
            bleedDoc.id,
            bleedDoc.backendAssetId,
            null,
            bleedDoc.fileName,
            "Rendering pages…",
          );
        } catch (err: any) {
          toast.error("Render failed", { description: err.message });
        }
      }
      const existing = documents.find((d) => d.id === bleedDoc.id);
      const preflight = (existing?.preflight_data as Record<string, any>) ?? {};
      await supabase
        .from("documents")
        .update({
          preflight_data: { ...preflight, awaiting_review: false, bleed_resolved: true, bleed_action: "keep" },
        })
        .eq("id", bleedDoc.id);
      resolvedDocIds.current.add(bleedDoc.id);
      setBleedDoc(null);
      refetchDocuments();
      toast.success("Keeping full size");
      return;
    }

    if (!bleedDoc.backendAssetId) {
      toast.error("Cannot trim — document has no backend asset");
      setBleedDoc(null);
      return;
    }

    setIsApplyingBleed(true);
    try {
      const bleedMm = choice === "custom" && customBleedMm
        ? customBleedMm
        : (bleedDoc.nearMatch.bleedW + bleedDoc.nearMatch.bleedH) / 2;
      const bleedPt = bleedMm * (72 / 25.4);

      const mediaBox = await getMediaBox(bleedDoc.backendAssetId);

      // TrimBox = MediaBox inset by bleed on all sides
      const trimBox: [number, number, number, number] = [
        mediaBox[0] + bleedPt,
        mediaBox[1] + bleedPt,
        mediaBox[2] - bleedPt,
        mediaBox[3] - bleedPt,
      ];

      // Single render at the trimmed box — no separate cropRasterize+reThumbnail
      setUploadModalOpen(true);
      await renderWithProgress(
        bleedDoc.id,
        bleedDoc.backendAssetId,
        trimBox,
        bleedDoc.fileName,
        `Trimming to ${bleedDoc.nearMatch.matchedSize.name} and rendering pages…`,
      );

      const trimWidthPt = Math.abs(trimBox[2] - trimBox[0]);
      const trimHeightPt = Math.abs(trimBox[3] - trimBox[1]);
      const newWidthMm = (trimWidthPt * 25.4) / 72;
      const newHeightMm = (trimHeightPt * 25.4) / 72;

      const existing = documents.find((d) => d.id === bleedDoc.id);
      const preflight = (existing?.preflight_data as Record<string, any>) ?? {};
      await supabase
        .from("documents")
        .update({
          preflight_data: {
            ...preflight,
            awaiting_review: false,
            bleed_resolved: true,
            bleed_action: choice === "custom" ? `custom_${bleedMm}mm` : `trimmed_to_${bleedDoc.nearMatch.matchedSize.name}`,
            bleed_mm: bleedMm,
            original_width_mm: bleedDoc.widthMm,
            original_height_mm: bleedDoc.heightMm,
            trim_box_pt: trimBox,
          },
        })
        .eq("id", bleedDoc.id);

      resolvedDocIds.current.add(bleedDoc.id);
      setBleedDoc(null);
      refetchDocuments();
      toast.success(`Trimmed to ${Math.round(newWidthMm)} × ${Math.round(newHeightMm)}mm`);
    } catch (err: any) {
      toast.error("Trimming failed", { description: err.message });
    } finally {
      setIsApplyingBleed(false);
    }
  }, [bleedDoc, documents, refetchDocuments, getMediaBox]);

  // Determine which document to show in the middle preview
  const previewDoc = useMemo(() => {
    if (selectedDocId) return documents.find((d) => d.id === selectedDocId) ?? null;
    if (selectedSectionId) {
      const section = sections.find((s) => s.id === selectedSectionId);
      if (section?.document_id) return documents.find((d) => d.id === section.document_id) ?? null;
    }
    return null;
  }, [selectedDocId, selectedSectionId, documents, sections]);

  const lightboxThumbnails = useMemo(() => {
    if (!previewDoc) return [];
    return Array.isArray(previewDoc.thumbnail_urls) ? (previewDoc.thumbnail_urls as string[]) : [];
  }, [previewDoc]);

  const ensuredItemIdRef = useRef<string | null>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      // Ensure order exists before uploading — capture the ID directly
      let itemId: string;
      try {
        itemId = await ensureOrder();
        ensuredItemIdRef.current = itemId;
      } catch (err: any) {
        toast.error("Failed to create order", { description: err.message });
        return;
      }

      const slug = productFamily?.slug ?? null;

      // ── Posters: route image uploads through the crop/size editor so the
      // user can frame the image to the chosen poster size before we
      // rasterise it into a print-ready PDF. PDFs / Office files keep going
      // through the normal preflight path.
      if (slug === "posters") {
        const images = files.filter(isImageFile);
        const passthrough = files.filter((f) => !isImageFile(f));
        if (images.length > 0) {
          pendingPosterQueueRef.current = images.slice(1);
          pendingPosterPassthroughRef.current = passthrough;
          setPendingPosterFile(images[0]);
          setPosterEditorOpen(true);
          return;
        }
        // No images — fall through to the normal PDF/Office path.
      }

      const hasImages = files.some(isImageFile);
      if (hasImages) {
        // Stash files and show size picker
        pendingFilesRef.current = files;
        const firstImage = files.find(isImageFile) ?? null;
        setPendingImageFile(firstImage);
        setImageSizeDialogOpen(true);
        return;
      }
      // All PDFs — upload directly, passing the guaranteed itemId
      setUploadModalOpen(true);
      await uploadFiles(files, undefined, itemId);
    },
    [uploadFiles, ensureOrder, productFamily?.slug]
  );

  const handlePosterEditorConfirm = useCallback(
    async (result: PosterEditorResult) => {
      const sourceFile = pendingPosterFile;
      setPosterEditorOpen(false);
      setPendingPosterFile(null);
      if (!sourceFile) return;

      try {
        const pdf = await imageToPosterPdf(sourceFile, {
          widthMm: result.size.widthMm,
          heightMm: result.size.heightMm,
          croppedAreaPixels: result.croppedAreaPixels,
          rotation: result.rotation,
        });
        const itemId = ensuredItemIdRef.current ?? undefined;
        const passthrough = pendingPosterPassthroughRef.current;
        pendingPosterPassthroughRef.current = [];
        const batch: File[] = [pdf, ...passthrough];
        setUploadModalOpen(true);
        await uploadFiles(batch, undefined, itemId);
      } catch (err: any) {
        toast.error("Couldn't process image", { description: err?.message });
      }

      // Continue queue — open editor for the next image, if any.
      const queue = pendingPosterQueueRef.current;
      if (queue.length > 0) {
        const [next, ...rest] = queue;
        pendingPosterQueueRef.current = rest;
        setPendingPosterFile(next);
        setPosterEditorOpen(true);
      }
    },
    [pendingPosterFile, uploadFiles],
  );

  const handlePosterEditorCancel = useCallback(() => {
    setPosterEditorOpen(false);
    setPendingPosterFile(null);
    pendingPosterQueueRef.current = [];
    pendingPosterPassthroughRef.current = [];
  }, []);

  const handleImageSizeConfirm = useCallback(
    async (selection: ImageSizeSelection) => {
      setImageSizeDialogOpen(false);
      setPendingImageFile(null);
      const files = pendingFilesRef.current;
      pendingFilesRef.current = [];
      if (files.length === 0) return;

      const targetSize = selection.target
        ? { widthMm: selection.target.widthMm, heightMm: selection.target.heightMm }
        : undefined;

      setUploadModalOpen(true);
      await uploadFiles(files, targetSize, ensuredItemIdRef.current ?? undefined);
    },
    [uploadFiles]
  );

  const handleImageSizeCancel = useCallback(() => {
    setImageSizeDialogOpen(false);
    setPendingImageFile(null);
    pendingFilesRef.current = [];
  }, []);

  const handleUploadContinue = useCallback(() => {
    setUploadModalOpen(false);
    clearUploads();
    refetchDocuments();
  }, [clearUploads, refetchDocuments]);

  const familySlug = productFamily?.slug ?? null;

  // ── Active print size (for mismatch guard) ─────────────────────
  // Returns the effective dimensions of a doc, preferring post-scale values
  // recorded in preflight_data.
  const getDocEffectiveSize = useCallback(
    (doc: { page_width_mm: number | null; page_height_mm: number | null; preflight_data: unknown } | undefined | null) => {
      if (!doc) return null;
      const pf = (doc.preflight_data as Record<string, any> | null) ?? null;
      const w = Number(pf?.effective_width_mm ?? doc.page_width_mm ?? 0);
      const h = Number(pf?.effective_height_mm ?? doc.page_height_mm ?? 0);
      if (!(w > 0 && h > 0)) return null;
      return { widthMm: w, heightMm: h };
    },
    [],
  );

  // The "active print size" is the dimensions of the first doc already
  // assigned to a section (i.e. the size the print job is committed to).
  const activePrintSize = useMemo(() => {
    for (const s of sections) {
      const doc = documents.find((d) => d.id === s.document_id);
      const sz = getDocEffectiveSize(doc);
      if (sz) return sz;
    }
    return null;
  }, [sections, documents, getDocEffectiveSize]);

  // Set of doc IDs whose effective size doesn't match the active print size
  // (or the session lock if no sections exist yet). Surfaces as a passive
  // ⚠ badge in the file list.
  const mismatchDocIds = useMemo(() => {
    const reference = activePrintSize ?? sessionSizeLock?.size ?? null;
    if (!reference) return new Set<string>();
    const out = new Set<string>();
    for (const d of documents) {
      const sz = getDocEffectiveSize(d);
      if (!sz) continue;
      if (!sizesMatch(sz.widthMm, sz.heightMm, reference.widthMm, reference.heightMm)) {
        out.add(d.id);
      }
    }
    return out;
  }, [documents, activePrintSize, sessionSizeLock, getDocEffectiveSize]);

  // Hard guard: refuse to add a doc to a section if its orientation violates
  // the product's mandatory orientation policy. The advisory dialog is the
  // ONLY way to resolve this — silent acceptance breaks every downstream step.
  const assertOrientationOk = useCallback((docId: string): boolean => {
    const required = requiredOrientationFor(productFamily?.slug);
    if (!required) return true;
    const candidate = documents.find((d) => d.id === docId);
    if (!candidate) return true;
    if (violatesOrientationPolicy(productFamily?.slug, candidate.page_width_mm, candidate.page_height_mm)) {
      toast.error(
        required === "portrait"
          ? "Landscape file can't be used in this product"
          : "Portrait file can't be used in this product",
        {
          description: required === "portrait"
            ? "Rotate this file to portrait first, or switch product."
            : "Rotate this file to landscape first, or switch product.",
        },
      );
      return false;
    }
    return true;
  }, [productFamily?.slug, documents]);

  const handleAddAs = useCallback(
    async (type: "front_cover" | "back_cover" | "body") => {
      if (!selectedDocId || !orderItem) return;

      if (!assertOrientationOk(selectedDocId)) return;

      // ── Belt-and-braces mismatch guard ─────────────────────────
      // Refuse to assign a doc whose effective size doesn't match the
      // size the print job is already committed to.
      const candidate = documents.find((d) => d.id === selectedDocId);
      const candidateSize = getDocEffectiveSize(candidate);
      if (candidateSize && activePrintSize) {
        if (!sizesMatch(candidateSize.widthMm, candidateSize.heightMm, activePrintSize.widthMm, activePrintSize.heightMm)) {
          toast.error("Mixed paper sizes can't be printed together", {
            description: `Your other files are ${Math.round(activePrintSize.widthMm)}×${Math.round(activePrintSize.heightMm)}mm. Re-upload this file at that size, or remove the existing files first.`,
          });
          return;
        }
      }

      // Auto-set defaults per product family
      const extraFields: Record<string, boolean> = {};
      if (familySlug === "brochures") {
        extraFields.is_duplex = true;
        extraFields.is_color = true;
      } else if (familySlug === "posters") {
        extraFields.is_duplex = false;
        extraFields.is_color = true;
      }
      // Cover physics: a 1-page cover upload is ALWAYS simplex (the back of
      // that single sheet is a real blank — see merge rules). A 2+ page upload
      // becomes a duplex cover (face A = outside, face B = inside).
      if (type === "front_cover" || type === "back_cover") {
        const coverDoc = documents.find((d) => d.id === selectedDocId);
        const coverPages = coverDoc?.page_count ?? 1;
        extraFields.is_duplex = coverPages >= 2;
      }
      try {
        await addSection.mutateAsync({
          order_item_id: orderItem.id,
          document_id: selectedDocId,
          section_type: type,
          sort_order: sections.length,
          ...extraFields,
        });
        const labelMap: Record<string, string> = {
          front_cover: familySlug === "brochures" ? "Outside" : familySlug === "flyers" ? "Front" : "Front Cover",
          back_cover: familySlug === "brochures" ? "Inside" : familySlug === "flyers" ? "Back" : "Back Cover",
          body: "Body Pages",
        };
        toast.success(`Added as ${labelMap[type] ?? type.replace("_", " ")}`);
      } catch (err: any) {
        toast.error("Failed to add section", { description: err.message });
      }
    },
    [selectedDocId, orderItem, sections.length, addSection, familySlug, documents, activePrintSize, getDocEffectiveSize, assertOrientationOk]
  );

  // Auto-assign a 2-3 page document as Outside (page 1) + Inside (page 2) for brochures
  // Shared mismatch check used by all assignment paths.
  const assertSizeMatchesActive = useCallback((docId: string): boolean => {
    if (!activePrintSize) return true;
    const candidate = documents.find((d) => d.id === docId);
    const sz = getDocEffectiveSize(candidate);
    if (!sz) return true;
    if (sizesMatch(sz.widthMm, sz.heightMm, activePrintSize.widthMm, activePrintSize.heightMm)) return true;
    toast.error("Mixed paper sizes can't be printed together", {
      description: `Your other files are ${Math.round(activePrintSize.widthMm)}×${Math.round(activePrintSize.heightMm)}mm. Re-upload this file at that size, or remove the existing files first.`,
    });
    return false;
  }, [activePrintSize, documents, getDocEffectiveSize]);

  const handleAutoAssignBrochure = useCallback(async () => {
    if (!selectedDocId || !orderItem) return;
    if (!assertOrientationOk(selectedDocId)) return;
    if (!assertSizeMatchesActive(selectedDocId)) return;
    const doc = documents.find((d) => d.id === selectedDocId);
    if (!doc || (doc.page_count ?? 0) < 2) return;
    try {
      await addSection.mutateAsync({
        order_item_id: orderItem.id,
        document_id: selectedDocId,
        section_type: "front_cover" as any,
        sort_order: sections.length,
        page_range_start: 0,
        is_duplex: true,
        is_color: true,
      });
      await addSection.mutateAsync({
        order_item_id: orderItem.id,
        document_id: selectedDocId,
        section_type: "back_cover" as any,
        sort_order: sections.length + 1,
        page_range_start: 1,
        is_duplex: true,
        is_color: true,
      });
      toast.success("Auto-assigned Outside + Inside from pages 1 & 2");
    } catch (err: any) {
      toast.error("Failed to auto-assign", { description: err.message });
    }
  }, [selectedDocId, orderItem, documents, sections.length, addSection, assertSizeMatchesActive, assertOrientationOk]);

  // Auto-assign a 4+ page PDF where each page is a panel
  // Bi-fold (4 pages): Outside = pages [0, 3], Inside = pages [1, 2]
  // Tri-fold (6 pages): Outside = pages [0, 1, 2], Inside = pages [3, 4, 5]
  const handleAutoAssignPanels = useCallback(async () => {
    if (!selectedDocId || !orderItem) return;
    if (!assertOrientationOk(selectedDocId)) return;
    if (!assertSizeMatchesActive(selectedDocId)) return;
    const doc = documents.find((d) => d.id === selectedDocId);
    const pageCount = doc?.page_count ?? 0;
    if (!doc || pageCount < 4) return;

    try {
      // For 4-page bi-fold: outside = pages 0,3; inside = pages 1,2
      // For 6-page tri-fold: outside = pages 0,1,2; inside = pages 3,4,5
      const half = Math.floor(pageCount / 2);
      // Outside section covers the first half of panels
      // For bi-fold (4pg): page_range_start=0, page_range_end=3 (pages 0 and 3)
      // For tri-fold (6pg): page_range_start=0, page_range_end=2 (pages 0,1,2)
      const isNonContiguous = pageCount === 4; // bi-fold has non-contiguous outside pages

      await addSection.mutateAsync({
        order_item_id: orderItem.id,
        document_id: selectedDocId,
        section_type: "front_cover" as any,
        sort_order: sections.length,
        page_range_start: 0,
        page_range_end: isNonContiguous ? pageCount - 1 : half - 1,
        is_duplex: true,
        is_color: true,
      });
      await addSection.mutateAsync({
        order_item_id: orderItem.id,
        document_id: selectedDocId,
        section_type: "back_cover" as any,
        sort_order: sections.length + 1,
        page_range_start: isNonContiguous ? 1 : half,
        page_range_end: isNonContiguous ? pageCount - 2 : pageCount - 1,
        is_duplex: true,
        is_color: true,
      });
      toast.success(`Auto-assigned ${pageCount}-page panel layout`);
    } catch (err: any) {
      toast.error("Failed to auto-assign panels", { description: err.message });
    }
  }, [selectedDocId, orderItem, documents, sections.length, addSection, assertSizeMatchesActive, assertOrientationOk]);

  const handleRemoveSection = useCallback(async () => {
    if (!selectedSectionId || !orderItem) return;
    try {
      await deleteSection.mutateAsync({
        id: selectedSectionId,
        orderItemId: orderItem.id,
      });
      setSelectedSectionId(null);
      toast.success("Section removed");
    } catch (err: any) {
      toast.error("Failed to remove", { description: err.message });
    }
  }, [selectedSectionId, orderItem, deleteSection]);

  const handleDeleteDocument = useCallback(
    async (docId: string) => {
      try {
        const doc = documents.find((d) => d.id === docId);
        // 1. Delete associated sections
        await supabase.from("document_sections").delete().eq("document_id", docId);
        // 2. Delete the document row
        await supabase.from("documents").delete().eq("id", docId);
        // 3. Remove file from storage
        if (doc?.file_path) {
          const { deleteFromS3 } = await import("@/lib/s3Storage");
          await deleteFromS3([doc.file_path]);
        }
        // 4. Clear selection if this doc was selected
        if (selectedDocId === docId) setSelectedDocId(null);
        // 5. Refresh
        refetchDocuments();
        refetchSections();
        toast.success("File deleted");
      } catch (err: any) {
        toast.error("Failed to delete file", { description: err.message });
      }
    },
    [documents, selectedDocId, refetchDocuments, refetchSections]
  );

  const handleRerenderGaps = useCallback(
    async (doc: { id: string; backend_asset_id: string | null; preflight_data: unknown }) => {
      if (!doc.backend_asset_id) {
        toast.error("Can't re-render: this file has no backend asset reference.");
        return;
      }
      const preflight = (doc.preflight_data as Record<string, unknown> | null) ?? {};
      const gaps = Array.isArray(preflight.thumbnail_gaps)
        ? (preflight.thumbnail_gaps as number[])
        : [];
      const toastId = toast.loading(
        gaps.length > 0
          ? `Re-rendering ${gaps.length} missing page${gaps.length === 1 ? "" : "s"}…`
          : "Checking for missing pages…",
      );
      try {
        // Surgical re-render — server returns 404 if the asset has been
        // evicted, in which case the user should use the full Reprocess action.
        const { remainingGaps } = await recoverThumbnailGaps(
          doc.id,
          doc.backend_asset_id,
          gaps,
        );

        await refetchDocuments();
        qc.invalidateQueries({ queryKey: ["documents", orderItem?.id] });

        if (remainingGaps.length === 0) {
          toast.success("All pages re-rendered.", { id: toastId });
        } else {
          toast.warning(
            `${remainingGaps.length} page${remainingGaps.length === 1 ? "" : "s"} still failed to render. Try again or use Reprocess.`,
            { id: toastId },
          );
        }
      } catch (err: any) {
        toast.error("Re-render failed", { id: toastId, description: err?.message });
      }
    },
    [qc, orderItem?.id, refetchDocuments],
  );

  const handleToggleColor = useCallback(
    async (section: (typeof sections)[0]) => {
      await updateSection.mutateAsync({
        id: section.id,
        is_color: !section.is_color,
      });
    },
    [updateSection]
  );

  const handleToggleDuplex = useCallback(
    async (section: (typeof sections)[0]) => {
      await updateSection.mutateAsync({
        id: section.id,
        is_duplex: !section.is_duplex,
      });
    },
    [updateSection]
  );

  const handleMoveSection = useCallback(
    async (sectionId: string, direction: "up" | "down") => {
      const idx = sections.findIndex((s) => s.id === sectionId);
      if (idx < 0) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sections.length) return;

      await Promise.all([
        updateSection.mutateAsync({
          id: sections[idx].id,
          sort_order: sections[swapIdx].sort_order,
        }),
        updateSection.mutateAsync({
          id: sections[swapIdx].id,
          sort_order: sections[idx].sort_order,
        }),
      ]);
    },
    [sections, updateSection]
  );

  // Hard guard for Configure Options: every assigned doc must satisfy the
  // product's mandatory orientation policy. We refuse to navigate downstream
  // if any section is wired to a doc that would render the wrong way up.
  const orientationViolations = useMemo(() => {
    if (!requiredOrientationFor(productFamily?.slug)) return new Set<string>();
    const out = new Set<string>();
    for (const s of sections) {
      const doc = documents.find((d) => d.id === s.document_id);
      if (!doc) continue;
      if (violatesOrientationPolicy(productFamily?.slug, doc.page_width_mm, doc.page_height_mm)) {
        out.add(doc.id);
      }
    }
    return out;
  }, [sections, documents, productFamily?.slug]);
  const canContinue = sections.length > 0 && orientationViolations.size === 0;

  if (loading && !isNewMode) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Upload &amp; Organise Files
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Step 1 of 2 — Upload your PDFs and assign them to document sections
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/t/${slug}/orders/new`)}
              className="soft-button flex items-center gap-1.5 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              disabled={!canContinue || !effectiveOrderId}
              onClick={() => navigate(`/t/${slug}/orders/${effectiveOrderId}/build`)}
              className="soft-button soft-button-primary flex items-center gap-1.5 text-sm rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Configure Options
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_auto_1fr] gap-5 items-start">
        {/* Left: Uploaded Files */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="section-header">Uploaded Files</h2>
            {sessionSizeLock && (
              <div
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/10 px-2 py-1 rounded-full"
                title={
                  sessionSizeLock.source === "user_chose"
                    ? "All new files in this session will be aligned to this size"
                    : "Auto-detected from your first file. New files will be aligned to this size."
                }
              >
                <Lock className="h-3 w-3" />
                <span>Locked to {sessionSizeLock.size.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSessionSizeLock(null);
                    autoAppliedDocIds.current = new Set();
                    isoCheckedDocIds.current = new Set();
                    toast.info("Size lock reset — next upload will set a new lock");
                  }}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                  title="Reset size lock"
                  aria-label="Reset size lock"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
          <FileUploader onFiles={handleFiles} />
          <FileList
            documents={documents}
            selectedDocId={selectedDocId}
            onSelect={setSelectedDocId}
            onReprocess={reprocessDocument}
            onRerenderGaps={handleRerenderGaps}
            onDelete={handleDeleteDocument}
            mismatchDocIds={mismatchDocIds}
          />
        </div>

        {/* Middle: Preview + Actions */}
        <div className="hidden lg:block">
          <div className="glass-card p-4 sticky top-24 space-y-4">
            <InlinePreviewThumb
              document={previewDoc}
              onClick={() => lightboxThumbnails.length > 0 && setLightboxOpen(true)}
            />
            <div className="border-t border-border/60" />
            <SectionActions
              hasSelectedFile={!!selectedDocId}
              onAddAs={handleAddAs}
              hasSelectedSection={!!selectedSectionId}
              onRemoveSection={handleRemoveSection}
              familySlug={familySlug}
              selectedFilePageCount={selectedDocId ? (documents.find(d => d.id === selectedDocId)?.page_count ?? 0) : 0}
               onAutoAssignBrochure={handleAutoAssignBrochure}
               onAutoAssignPanels={handleAutoAssignPanels}
            />
          </div>
        </div>

        {/* Right: Document Sections */}
        <div className="section-card p-5 space-y-4">
          <h2 className="section-header">Your Document</h2>
          <SectionList
            sections={sections}
            documents={documents}
            selectedSectionId={selectedSectionId}
            onSelect={setSelectedSectionId}
            onToggleColor={handleToggleColor}
            onToggleDuplex={handleToggleDuplex}
            onMove={handleMoveSection}
            familySlug={familySlug}
          />
        </div>
      </div>

      {/* Mobile actions */}
      <div className="lg:hidden glass-card p-4">
        <SectionActions
          hasSelectedFile={!!selectedDocId}
          onAddAs={handleAddAs}
          hasSelectedSection={!!selectedSectionId}
          onRemoveSection={handleRemoveSection}
          familySlug={familySlug}
          selectedFilePageCount={selectedDocId ? (documents.find(d => d.id === selectedDocId)?.page_count ?? 0) : 0}
           onAutoAssignBrochure={handleAutoAssignBrochure}
           onAutoAssignPanels={handleAutoAssignPanels}
        />
      </div>

      {/* Lightbox */}
      {lightboxOpen && lightboxThumbnails.length > 0 && (
        <PreviewLightbox
          thumbnailPaths={lightboxThumbnails}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Image Size Selector Dialog */}
      <ImageSizeDialog
        open={imageSizeDialogOpen}
        imageFile={pendingImageFile}
        onConfirm={handleImageSizeConfirm}
        onCancel={handleImageSizeCancel}
      />

      {/* Poster Image Crop Editor (image uploads on poster orders) */}
      <PosterImageEditor
        open={posterEditorOpen}
        file={pendingPosterFile}
        onConfirm={handlePosterEditorConfirm}
        onCancel={handlePosterEditorCancel}
      />

      {/* Upload Progress Modal */}
      <UploadProgressModal
        open={uploadModalOpen}
        uploads={uploads}
        onContinue={handleUploadContinue}
      />

      {/* Paper Size Advisory Dialog */}
      {advisoryDoc && (
        <PaperSizeAdvisory
          open={!!advisoryDoc}
          onOpenChange={(open) => { if (!open) setAdvisoryDoc(null); }}
          detectedSize={advisoryDoc.detectedSize}
          widthMm={advisoryDoc.widthMm}
          heightMm={advisoryDoc.heightMm}
          fileName={advisoryDoc.fileName}
          documentId={advisoryDoc.id}
          lockedSize={advisoryDoc.lockedSize ?? null}
          onKeepOriginal={handleKeepOriginal}
          onScaleTo={handleScaleTo}
        />
      )}

      {/* Orientation Advisory Dialog (presentations only) */}
      {orientationDoc && (
        <OrientationAdvisory
          open={!!orientationDoc}
          onOpenChange={(open) => { if (!open) handleDismissOrientation(); }}
          fileName={orientationDoc.fileName}
          widthMm={orientationDoc.widthMm}
          heightMm={orientationDoc.heightMm}
          onRotate={handleRotateOrientation}
          onSwitchProduct={handleSwitchProductFamily}
          mode={orientationDoc.mode}
          isRotating={isRotating}
        />
      )}

      {/* Bleed Advisory Dialog */}
      {bleedDoc && (
        <BleedAdvisory
          open={!!bleedDoc}
          onOpenChange={(open) => { if (!open) setBleedDoc(null); }}
          fileName={bleedDoc.fileName}
          widthMm={bleedDoc.widthMm}
          heightMm={bleedDoc.heightMm}
          nearMatch={bleedDoc.nearMatch}
          isApplying={isApplyingBleed}
          onConfirm={handleBleedConfirm}
        />
      )}
    </div>
  );
}

/* Inline preview thumbnail replacing the old DocumentPreviewThumb component */
function ThumbImage({ storagePath }: { storagePath: string }) {
  const url = useSignedThumbnailUrl(storagePath);
  if (!url) return <FileText className="h-8 w-8 text-muted-foreground/30" />;
  return <img src={url} alt="Page preview" className="h-full w-full object-contain" />;
}


function InlinePreviewThumb({
  document,
  onClick,
}: {
  document: { file_name: string; page_count: number | null; page_width_mm: number | null; page_height_mm: number | null; thumbnail_urls: unknown } | null;
  onClick: () => void;
}) {
  const thumbnails = document
    ? Array.isArray(document.thumbnail_urls)
      ? (document.thumbnail_urls as string[])
      : []
    : [];
  const firstThumb = thumbnails.length > 0 ? thumbnails[0] : null;

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/50">
        <FileText className="h-10 w-10 mb-2 opacity-30" />
        <p className="text-xs text-center">Select a file to preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className={cn(
          "relative group w-[140px] aspect-[210/297] bg-muted/30 border border-border/60",
          "flex items-center justify-center overflow-hidden",
          "hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
        )}
      >
        {firstThumb ? (
          <ThumbImage storagePath={firstThumb} />
        ) : (
          <FileText className="h-8 w-8 text-muted-foreground/30" />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <Search className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
      <div className="text-center space-y-0.5">
        <p className="text-xs font-medium text-foreground truncate max-w-[160px]">
          {document.file_name}
        </p>
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          {document.page_count && (
            <span>{document.page_count} {document.page_count === 1 ? "page" : "pages"}</span>
          )}
          {document.page_width_mm && document.page_height_mm && (
            <span>
              {Math.round(Number(document.page_width_mm))}×{Math.round(Number(document.page_height_mm))}mm
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
