import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  useOrderData,
  useCreateOrder,
  useAddSection,
  useUpdateSection,
  useDeleteSection,
} from "@/hooks/useOrderBuilder";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";
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
import { isImageFile } from "@/lib/imageToPage";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resize, rotate, pollJob, cropRasterize, getAsset, getDerivedFiles } from "@/lib/documentCentreApi";
import { copyS3Object } from "@/lib/s3Storage";
import { useTenantContext } from "@/hooks/useTenantContext";
import { invalidateUserOrderCaches } from "@/lib/queryInvalidation";

import { toStorageKey, pickBestPerPage, clearSignedUrlCache } from "@/lib/thumbnailUtils";
import type { PaperSize, NearIsoMatch } from "@/lib/paperSizes";
import { isLandscape, ISO_SIZES } from "@/lib/paperSizes";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const resolvedDocIds = useRef<Set<string>>(new Set());
  const [advisoryDoc, setAdvisoryDoc] = useState<{
    id: string;
    fileName: string;
    detectedSize: string;
    widthMm: number;
    heightMm: number;
    backendAssetId: string | null;
  } | null>(null);

  // Orientation advisory state for presentations
  const [orientationDoc, setOrientationDoc] = useState<{
    id: string;
    fileName: string;
    widthMm: number;
    heightMm: number;
    backendAssetId: string | null;
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

  // Check for non-ISO documents after upload completes
  useEffect(() => {
    if (uploadModalOpen) return; // Don't check while uploads are in progress
    const nonIsoDoc = documents.find((d) => {
      if (resolvedDocIds.current.has(d.id)) return false;
      const preflight = d.preflight_data as Record<string, any> | null;
      return preflight?.detected_size && !preflight?.size_resolved;
    });
    if (nonIsoDoc && !advisoryDoc) {
      const preflight = nonIsoDoc.preflight_data as Record<string, any>;
      setAdvisoryDoc({
        id: nonIsoDoc.id,
        fileName: nonIsoDoc.file_name,
        detectedSize: preflight.detected_size,
        widthMm: Number(nonIsoDoc.page_width_mm),
        heightMm: Number(nonIsoDoc.page_height_mm),
        backendAssetId: nonIsoDoc.backend_asset_id,
      });
    }
  }, [documents, uploadModalOpen, advisoryDoc]);

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

  // Check for portrait orientation on presentation uploads
  useEffect(() => {
    if (uploadModalOpen || advisoryDoc || orientationDoc || bleedDoc) return;
    if (productFamily?.slug !== "presentations") return;
    const portraitDoc = documents.find((d) => {
      const preflight = d.preflight_data as Record<string, any> | null;
      if (preflight?.orientation_resolved) return false;
      const w = Number(d.page_width_mm);
      const h = Number(d.page_height_mm);
      return w > 0 && h > 0 && w < h; // portrait = width < height
    });
    if (portraitDoc) {
      setOrientationDoc({
        id: portraitDoc.id,
        fileName: portraitDoc.file_name,
        widthMm: Number(portraitDoc.page_width_mm),
        heightMm: Number(portraitDoc.page_height_mm),
        backendAssetId: portraitDoc.backend_asset_id,
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

  const handleKeepOriginal = useCallback(async () => {
    if (!advisoryDoc) return;
    const existing = documents.find((d) => d.id === advisoryDoc.id);
    const preflight = (existing?.preflight_data as Record<string, any>) ?? {};

    // Finalise (orientation normalise + print-ready) on the original-size
    // canvas, then render thumbnails. Office uploads deferred this; PDF
    // uploads already finalised but the call is idempotent.
    if (advisoryDoc.backendAssetId) {
      try {
        setUploadModalOpen(true);
        if (!preflight?.orientation_normalized) {
          await finalizeOrientationAndPrintReady(
            advisoryDoc.id,
            advisoryDoc.backendAssetId,
            advisoryDoc.fileName,
          );
        }
        const mediaBox = await getMediaBox(advisoryDoc.backendAssetId);
        await renderWithProgress(
          advisoryDoc.id,
          advisoryDoc.backendAssetId,
          mediaBox,
          advisoryDoc.fileName,
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
      .eq("id", advisoryDoc.id);
    resolvedDocIds.current.add(advisoryDoc.id);
    setAdvisoryDoc(null);
    refetchDocuments();
    toast.success("Keeping original size");
  }, [advisoryDoc, documents, refetchDocuments, getMediaBox, renderWithProgress, finalizeOrientationAndPrintReady]);

  const handleScaleTo = useCallback(async (target: PaperSize) => {
    if (!advisoryDoc?.backendAssetId) {
      toast.error("Cannot scale — document has no backend asset");
      setAdvisoryDoc(null);
      return;
    }
    // Mark resolved + close the dialog IMMEDIATELY so the detect effect can't
    // re-open it while the resize job is in flight.
    const docId = advisoryDoc.id;
    const assetId = advisoryDoc.backendAssetId;
    const fileName = advisoryDoc.fileName;
    const originalW = advisoryDoc.widthMm;
    const originalH = advisoryDoc.heightMm;
    resolvedDocIds.current.add(docId);
    setAdvisoryDoc(null);

    try {
      toast.info(`Scaling to ${target.name}…`);
      const landscape = isLandscape(originalW, originalH);
      const targetW = landscape ? target.heightMm : target.widthMm;
      const targetH = landscape ? target.widthMm : target.heightMm;

      const { job_id } = await resize(assetId, targetW, targetH, "fit");
      await pollJob(job_id);

      setUploadModalOpen(true);

      // Now that the canvas is correctly sized, run orientation normalise +
      // print-ready (deferred for Office uploads, idempotent for PDF uploads).
      const existingForFinalize = documents.find((d) => d.id === docId);
      const preflightForFinalize = (existingForFinalize?.preflight_data as Record<string, any>) ?? {};
      if (!preflightForFinalize?.orientation_normalized) {
        await finalizeOrientationAndPrintReady(docId, assetId, fileName);
      }

      // Single render at the (now finalised) MediaBox
      const newBox = await getMediaBox(assetId);
      await renderWithProgress(
        docId,
        assetId,
        newBox,
        fileName,
        `Scaling to ${target.name} and rendering pages…`,
      );

      const existing = documents.find((d) => d.id === docId);
      const preflight = (existing?.preflight_data as Record<string, any>) ?? {};
      // Strip detected_size so the advisory effect can't fire again, and
      // persist the new dimensions so OrderBuild's auto-size match picks them up.
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
            original_width_mm: originalW,
            original_height_mm: originalH,
            effective_width_mm: targetW,
            effective_height_mm: targetH,
          },
        })
        .eq("id", docId);

      refetchDocuments();
      toast.success(`Scaled to ${target.name} successfully`);
    } catch (err: any) {
      toast.error("Scaling failed", { description: err.message });
    }
  }, [advisoryDoc, documents, refetchDocuments, getMediaBox, renderWithProgress, finalizeOrientationAndPrintReady]);

  // Orientation handlers
  const handleRotateToLandscape = useCallback(async () => {
    if (!orientationDoc?.backendAssetId) {
      toast.error("Cannot rotate — document has no backend asset");
      setOrientationDoc(null);
      return;
    }
    setIsRotating(true);
    try {
      toast.info("Rotating to landscape…");
      const { job_id } = await rotate(orientationDoc.backendAssetId, 90);
      await pollJob(job_id);

      // Single render at the new (rotated) MediaBox
      setUploadModalOpen(true);
      const newBox = await getMediaBox(orientationDoc.backendAssetId);
      await renderWithProgress(
        orientationDoc.id,
        orientationDoc.backendAssetId,
        newBox,
        orientationDoc.fileName,
        "Rotating to landscape and rendering pages…",
      );

      const existing = documents.find((d) => d.id === orientationDoc.id);
      const preflight = (existing?.preflight_data as Record<string, any>) ?? {};
      await supabase
        .from("documents")
        .update({
          preflight_data: { ...preflight, awaiting_review: false, orientation_resolved: true, orientation_action: "rotated" },
        })
        .eq("id", orientationDoc.id);

      setOrientationDoc(null);
      refetchDocuments();
      toast.success("Rotated to landscape");
    } catch (err: any) {
      toast.error("Rotation failed", { description: err.message });
    } finally {
      setIsRotating(false);
    }
  }, [orientationDoc, documents, refetchDocuments, getMediaBox]);

  const handleSwitchToBoundDocs = useCallback(() => {
    setOrientationDoc(null);
    navigate(`/t/${slug}/orders/new`);
    toast.info("Please select Bound Documents for portrait files");
  }, [navigate, slug]);

  // Bleed advisory handler
  const handleBleedConfirm = useCallback(async (choice: "match" | "custom" | "keep", customBleedMm?: number) => {
    if (!bleedDoc) return;

    if (choice === "keep") {
      // Render once at MediaBox (full size, no trim)
      if (bleedDoc.backendAssetId) {
        try {
          setUploadModalOpen(true);
          const mediaBox = await getMediaBox(bleedDoc.backendAssetId);
          await renderWithProgress(
            bleedDoc.id,
            bleedDoc.backendAssetId,
            mediaBox,
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
    [uploadFiles, ensureOrder]
  );

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

  const handleAddAs = useCallback(
    async (type: "front_cover" | "back_cover" | "body") => {
      if (!selectedDocId || !orderItem) return;
      // Auto-set defaults per product family
      const extraFields: Record<string, boolean> = {};
      if (familySlug === "brochures") {
        extraFields.is_duplex = true;
        extraFields.is_color = true;
      } else if (familySlug === "posters") {
        extraFields.is_duplex = false;
        extraFields.is_color = true;
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
    [selectedDocId, orderItem, sections.length, addSection, familySlug]
  );

  // Auto-assign a 2-3 page document as Outside (page 1) + Inside (page 2) for brochures
  const handleAutoAssignBrochure = useCallback(async () => {
    if (!selectedDocId || !orderItem) return;
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
  }, [selectedDocId, orderItem, documents, sections.length, addSection]);

  // Auto-assign a 4+ page PDF where each page is a panel
  // Bi-fold (4 pages): Outside = pages [0, 3], Inside = pages [1, 2]
  // Tri-fold (6 pages): Outside = pages [0, 1, 2], Inside = pages [3, 4, 5]
  const handleAutoAssignPanels = useCallback(async () => {
    if (!selectedDocId || !orderItem) return;
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
  }, [selectedDocId, orderItem, documents, sections.length, addSection]);

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

  const canContinue = sections.length > 0;

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
          <h2 className="section-header">Uploaded Files</h2>
          <FileUploader onFiles={handleFiles} />
          <FileList
            documents={documents}
            selectedDocId={selectedDocId}
            onSelect={setSelectedDocId}
            onReprocess={reprocessDocument}
            onDelete={handleDeleteDocument}
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
          onKeepOriginal={handleKeepOriginal}
          onScaleTo={handleScaleTo}
        />
      )}

      {/* Orientation Advisory Dialog (presentations only) */}
      {orientationDoc && (
        <OrientationAdvisory
          open={!!orientationDoc}
          onOpenChange={(open) => { if (!open) setOrientationDoc(null); }}
          fileName={orientationDoc.fileName}
          widthMm={orientationDoc.widthMm}
          heightMm={orientationDoc.heightMm}
          onRotate={handleRotateToLandscape}
          onSwitchProduct={handleSwitchToBoundDocs}
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
