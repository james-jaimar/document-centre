import { useBranch } from "@/contexts/BranchContext";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateOrder, useOrderData } from "@/hooks/useOrderBuilder";
import { useAddItemToCart } from "@/hooks/useCart";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { useTenantContext } from "@/hooks/useTenantContext";
import { getCachedBlobUrl, registerBlob } from "@/lib/photoPrints/photoBlobCache";
import { downloadFromS3 } from "@/lib/s3Storage";
import { invalidateUserOrderCaches } from "@/lib/queryInvalidation";
import {
  useResolvedAllowedSizeLabels,
  useResolvedAllowedCustomSizes,
} from "@/hooks/useResolvedCatalogOptions";
import { ISO_SIZES, NON_ISO_SIZES } from "@/lib/paperSizes";
import type { PaperSize } from "@/lib/paperSizes";

import PhotoUploader from "@/components/photo/PhotoUploader";
import QRUploadModal from "@/components/order/QRUploadModal";
import CanvasTile from "@/components/canvas/CanvasTile";
import CanvasEditorModal, { type CanvasSizeChoice } from "@/components/canvas/CanvasEditorModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import {
  CANVAS_PRESETS,
  DEFAULT_BLEED_MM,
  DEFAULT_DPI,
  DEFAULT_WRAP_MM,
  WRAP_DEPTH_PRESETS_MM,
  findPreset,
} from "@/lib/canvasPrints/presets";
import type { CanvasPrintEntry, CanvasPrintsSpec } from "@/lib/canvasPrints/canvasSpecTypes";
import { rasterisePdfPageOneToImage } from "@/lib/canvasPrints/pdfToImage";
import {
  useResolvedRateCardCanvasPrints,
  useResolvedRateCardCanvasSurcharges,
  priceCanvasEntry,
} from "@/hooks/useCanvasPrintsPricing";
import { usePriceDisplay } from "@/lib/tax/usePriceDisplay";
import { formatPrice } from "@/lib/formatCurrency";

const CANVAS_FAMILY_SLUG_DEFAULT = "canvas-prints";

type CanvasPrintingRules = {
  allowed_finished_sizes?: string[];
  canvas_wrap_depths_mm?: number[];
  canvas_default_wrap_mm?: number;
};

/** Build the size choice list from the family's configured sizes.
 *  Falls back to CANVAS_PRESETS when no sizes are configured. */
function useCanvasSizeChoices(
  familyId: string | null,
  branchId: string | null,
): CanvasSizeChoice[] {
  const { labels: allowedLabels } = useResolvedAllowedSizeLabels(familyId, branchId);
  const { sizes: customSizes } = useResolvedAllowedCustomSizes(familyId, branchId);

  return useMemo(() => {
    const choices: CanvasSizeChoice[] = [];
    const seen = new Set<string>();

    const addFromPaper = (p: PaperSize, slugPrefix = "iso") => {
      const slug = `${slugPrefix}-${p.name.toLowerCase().replace(/\s+/g, "-")}`;
      if (seen.has(slug)) return;
      seen.add(slug);
      choices.push({
        slug,
        label: `${p.name} (${p.widthMm} × ${p.heightMm} mm)`,
        frontWidthMm: p.widthMm,
        frontHeightMm: p.heightMm,
      });
    };

    if (allowedLabels && allowedLabels.length > 0) {
      const allSizes = [...ISO_SIZES, ...NON_ISO_SIZES];
      for (const label of allowedLabels) {
        const match = allSizes.find((s) => s.name === label);
        if (match) addFromPaper(match);
      }
    }
    for (const cs of customSizes) addFromPaper(cs, "custom");

    if (choices.length === 0) {
      // Fallback to the built-in canvas presets.
      for (const p of CANVAS_PRESETS) {
        choices.push({
          slug: p.id,
          label: p.label,
          frontWidthMm: p.frontWidthMm,
          frontHeightMm: p.frontHeightMm,
        });
      }
    }
    return choices;
  }, [allowedLabels, customSizes]);
}

export default function CanvasPrintsBuilder() {
  const { id: orderIdParam } = useParams<{ id?: string }>();
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { tenantId } = useTenantContext();
  const { activeBranch } = useBranch();

  const createOrder = useCreateOrder();
  const addItemToCart = useAddItemToCart();

  // ── Resolve the canvas_wrap product family for this tenant.
  const { data: family } = useQuery({
    queryKey: ["canvas_family", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_families")
        .select("*")
        .eq("kind", "canvas_wrap")
        .or(tenantId
          ? `tenant_id.eq.${tenantId},tenant_id.is.null`
          : "tenant_id.is.null");
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return rows.find((r) => r.tenant_id === tenantId) ?? rows[0] ?? null;
    },
  });

  const familyId: string | null = family?.id ?? null;

  const allowedDepths = useMemo<number[]>(() => {
    const rules = (family?.printing_rules ?? {}) as CanvasPrintingRules;
    const arr = Array.isArray(rules.canvas_wrap_depths_mm) && rules.canvas_wrap_depths_mm.length > 0
      ? rules.canvas_wrap_depths_mm.filter((d) => WRAP_DEPTH_PRESETS_MM.includes(d as any))
      : (WRAP_DEPTH_PRESETS_MM as unknown as number[]);
    return arr;
  }, [family]);

  const defaultWrap = useMemo(() => {
    const rules = (family?.printing_rules ?? {}) as CanvasPrintingRules;
    return allowedDepths.includes(rules.canvas_default_wrap_mm ?? DEFAULT_WRAP_MM)
      ? (rules.canvas_default_wrap_mm ?? DEFAULT_WRAP_MM)
      : allowedDepths[0];
  }, [family, allowedDepths]);

  const sizeChoices = useCanvasSizeChoices(familyId, activeBranch?.id ?? null);
  const defaultSize = sizeChoices[0] ?? null;

  // ── Order lazy-init
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const effectiveOrderId = orderIdParam ?? createdOrderId ?? undefined;
  const { order, orderItem } = useOrderData(effectiveOrderId);

  const ensureOrder = useCallback(async (): Promise<string> => {
    if (orderItem?.id) return orderItem.id;
    if (!familyId) throw new Error("Canvas Prints product isn't configured yet.");
    const newOrder = await createOrder.mutateAsync({
      productFamilyId: familyId,
      branchId: activeBranch?.id ?? null,
    });
    setCreatedOrderId(newOrder.id);
    const { data: newItem, error } = await supabase
      .from("order_items")
      .select("id")
      .eq("order_id", newOrder.id)
      .single();
    if (error || !newItem) throw error ?? new Error("Failed to load order item");
    return newItem.id;
  }, [orderItem?.id, familyId, createOrder, activeBranch?.id]);

  // ── Photo-style upload (reused verbatim — canvases ARE just images)
  const { uploadPhotos } = usePhotoUpload(orderItem?.id);

  // ── Spec state
  const [spec, setSpec] = useState<CanvasPrintsSpec>({ canvases: [] });
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    const s = orderItem?.spec as any;
    if (s?.canvas_prints?.canvases) {
      setSpec({ canvases: s.canvas_prints.canvases as CanvasPrintEntry[] });
      hydratedRef.current = true;
    }
  }, [orderItem?.spec]);

  // ── Debounced persist
  const persistTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!orderItem?.id) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      const totalQty = spec.canvases.reduce((s, c) => s + c.quantity, 0);
      const baseSpec = (orderItem.spec as any) || {};
      const nextSpec = {
        ...baseSpec,
        page_count: spec.canvases.length,
        quantity: Math.max(totalQty, 1),
        is_color: true,
        is_duplex: false,
        selected_options: {
          ...(baseSpec.selected_options || {}),
        },
        canvas_prints: spec,
      };
      await supabase
        .from("order_items")
        .update({ spec: nextSpec, quantity: Math.max(totalQty, 1) })
        .eq("id", orderItem.id);
    }, 600);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [spec, orderItem?.id, orderItem?.spec]);

  // ── Canvas-safe preview resolution: local blob cache first, Edge proxy for
  // existing S3 objects. Canvas previews must not draw directly from S3 URLs.
  const [blobVersion, setBlobVersion] = useState(0);
  useEffect(() => {
    const wanted = new Set<string>();
    for (const c of spec.canvases) {
      const preferred = c.preview_path ?? c.original_storage_path;
      if (preferred && !getCachedBlobUrl(preferred)) wanted.add(preferred);
      if (c.thumb_path && !getCachedBlobUrl(c.thumb_path)) wanted.add(c.thumb_path);
    }
    const paths = Array.from(wanted);
    if (paths.length === 0) return;
    let cancelled = false;
    void Promise.all(
      paths.map(async (path) => {
        try {
          const blob = await downloadFromS3(path);
          registerBlob(path, blob);
          return { path, ok: true };
        } catch (e) {
          console.warn("[canvas] preview proxy download failed", path, e);
          return { path, ok: false };
        }
      }),
    ).then((items) => {
      if (cancelled) return;
      if (items.some((item) => item.ok)) {
        setBlobVersion((v) => v + 1);
      }
    });
    return () => { cancelled = true; };
  }, [spec.canvases]);

  const resolveUrl = useCallback((path: string | undefined | null): string | null => {
    if (!path) return null;
    const blob = getCachedBlobUrl(path);
    if (blob) return blob;
    return null;
  }, [blobVersion]);

  // ── QR upload
  const [qrOpen, setQrOpen] = useState(false);
  const [qrItemId, setQrItemId] = useState<string | undefined>();
  const handlePhoneUpload = useCallback(async () => {
    try {
      const id = await ensureOrder();
      setQrItemId(id);
      setQrOpen(true);
    } catch {
      toast.error("Could not start phone upload. Please try again.");
    }
  }, [ensureOrder]);

  // ── File handling
  const [uploading, setUploading] = useState(0);
  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || !defaultSize) return;
    setUploading(files.length);

    // Rasterise any PDFs to page-1 JPEGs before uploading.
    const prepared: { file: File; wasPdf: boolean }[] = [];
    for (const f of files) {
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (isPdf) {
        try {
          const img = await rasterisePdfPageOneToImage(f);
          prepared.push({ file: img, wasPdf: true });
        } catch (e: any) {
          console.error("[canvas] pdf rasterise failed", e);
          toast.error(`Couldn't read PDF ${f.name}: ${e?.message ?? "unknown error"}`);
        }
      } else {
        prepared.push({ file: f, wasPdf: false });
      }
    }
    if (prepared.length === 0) { setUploading(0); return; }

    const targetItemId = await ensureOrder();
    const uploaded = await uploadPhotos(prepared.map((p) => p.file), targetItemId);
    setUploading(0);
    if (uploaded.length === 0) return;

    const newEntries: CanvasPrintEntry[] = uploaded.map((u, i) => ({
      id: crypto.randomUUID(),
      document_id: u.documentId,
      file_name: u.fileName,
      original_storage_path: u.storagePath,
      source_width_px: u.width,
      source_height_px: u.height,
      mime_type: u.mimeType,
      source_was_pdf: prepared[i]?.wasPdf ?? false,
      size_slug: defaultSize.slug,
      // Landscape default: long edge is width.
      frontWidthMm: Math.max(defaultSize.frontWidthMm, defaultSize.frontHeightMm),
      frontHeightMm: Math.min(defaultSize.frontWidthMm, defaultSize.frontHeightMm),
      pageOrientation: "landscape",
      wrapMm: defaultWrap,
      bleedMm: DEFAULT_BLEED_MM,
      dpi: DEFAULT_DPI,
      wrapMode: "gallery_wrap",

      crop: { x: 0, y: 0 },
      zoom: 1,
      rotation: 0,
      fit_mode: "fill",
      croppedAreaPixels: null,
      quantity: 1,
      thumb_path: u.thumbPath,
      preview_path: u.previewPath,
      preview_width_px: u.previewWidthPx,
      preview_height_px: u.previewHeightPx,
    }));

    setSpec((prev) => ({ canvases: [...prev.canvases, ...newEntries] }));
    toast.success(`Added ${uploaded.length} canvas${uploaded.length === 1 ? "" : "es"}`);

    // Auto-open editor for the first newly-added canvas.
    if (newEntries[0]) setEditorId(newEntries[0].id);
  }, [defaultSize, defaultWrap, ensureOrder, uploadPhotos]);

  const updateCanvas = (id: string, patch: Partial<CanvasPrintEntry>) => {
    setSpec((prev) => ({
      canvases: prev.canvases.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const removeCanvas = async (id: string) => {
    const target = spec.canvases.find((c) => c.id === id);
    setSpec((prev) => ({ canvases: prev.canvases.filter((c) => c.id !== id) }));
    if (target) {
      try {
        await supabase.from("documents").delete().eq("id", target.document_id);
        const { deleteFromS3 } = await import("@/lib/s3Storage");
        await deleteFromS3([target.original_storage_path]);
      } catch (e) {
        console.warn("[canvas] remove cleanup failed", e);
      }
    }
  };

  const duplicateCanvas = (id: string) => {
    setSpec((prev) => {
      const idx = prev.canvases.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const copy = { ...prev.canvases[idx], id: crypto.randomUUID() };
      const next = [...prev.canvases];
      next.splice(idx + 1, 0, copy);
      return { canvases: next };
    });
  };

  // ── Editor
  const [editorId, setEditorId] = useState<string | null>(null);
  const editorCanvas = spec.canvases.find((c) => c.id === editorId) ?? null;
  const editorSignedUrl = editorCanvas
    ? (resolveUrl(editorCanvas.preview_path) ?? resolveUrl(editorCanvas.original_storage_path))
    : null;
  const editorPixelScale = editorCanvas && editorCanvas.preview_width_px && editorCanvas.source_width_px
    ? editorCanvas.source_width_px / editorCanvas.preview_width_px
    : 1;

  // ── Auto-correct stale sizes
  useEffect(() => {
    if (sizeChoices.length === 0 || spec.canvases.length === 0) return;
    setSpec((prev) => {
      let changed = false;
      const canvases = prev.canvases.map((c) => {
        if (sizeChoices.some((s) => s.slug === c.size_slug)) return c;
        const fallback = sizeChoices[0];
        changed = true;
        return {
          ...c,
          size_slug: fallback.slug,
          frontWidthMm: fallback.frontWidthMm,
          frontHeightMm: fallback.frontHeightMm,
        };
      });
      return changed ? { canvases } : prev;
    });
  }, [sizeChoices]);

  // ── Pricing (base by size × wrap depth + optional wrap-mode surcharge)
  const { data: canvasBaseRows = [] } = useResolvedRateCardCanvasPrints({
    tenantId: tenantId ?? null,
    branchId: activeBranch?.id ?? null,
  });
  const { data: canvasSurcharges = [] } = useResolvedRateCardCanvasSurcharges({
    tenantId: tenantId ?? null,
    branchId: activeBranch?.id ?? null,
  });
  const priceDisplay = usePriceDisplay();

  const pricedCanvases = useMemo(() => {
    return spec.canvases.map((c) => {
      const p = priceCanvasEntry(c, canvasBaseRows, canvasSurcharges);
      return { canvas: c, ...p, line: p.unit * Math.max(c.quantity, 1) };
    });
  }, [spec.canvases, canvasBaseRows, canvasSurcharges]);

  const anyUnpriced = pricedCanvases.some((p) => !p.matched);
  const netTotal = pricedCanvases.reduce((s, p) => s + p.line, 0);

  // ── Add to cart
  const [submitting, setSubmitting] = useState(false);
  const totalQty = spec.canvases.reduce((s, c) => s + c.quantity, 0);

  const handleAddToCart = async () => {
    if (!order || !orderItem || submitting) return;
    if (spec.canvases.length === 0) {
      toast.error("Add at least one canvas before checking out.");
      return;
    }
    if (anyUnpriced) {
      toast.error("Some canvases don't have a price set up yet. Please contact us.");
      return;
    }
    setSubmitting(true);
    try {
      const replacesCartItemId = (order.metadata as any)?.replaces_cart_item_id;
      const safeQty = Math.max(totalQty, 1);
      await addItemToCart.mutateAsync({
        orderItemId: orderItem.id,
        draftOrderId: order.id,
        title: `Canvas Prints (${spec.canvases.length})`,
        unitPrice: safeQty > 0 ? netTotal / safeQty : 0,
        quantity: safeQty,
        totalPrice: netTotal,
        spec: {
          page_count: spec.canvases.length,
          quantity: safeQty,
          is_color: true,
          is_duplex: false,
          selected_options: {},
          canvas_prints: spec,
          canvas_pricing: {
            currency: "ZAR",
            net_total: netTotal,
            lines: pricedCanvases.map((p) => ({
              canvas_id: p.canvas.id,
              size_slug: p.canvas.size_slug,
              wrap_mm: p.canvas.wrapMm,
              wrap_mode: p.canvas.wrapMode,
              quantity: p.canvas.quantity,
              unit_price: p.unit,
              line_total: p.line,
            })),
          },
        } as any,
        replacesCartItemId: replacesCartItemId || undefined,
      });
      invalidateUserOrderCaches(qc);
      toast.success("Added to cart");
      navigate(tenantPath("cart"));
    } catch (e: any) {
      console.error("[canvas] add to cart failed", e);
      toast.error(e?.message ?? "Failed to add to cart");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-2xl font-semibold">Canvas Prints</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* ── Left: upload + tile grid */}
        <div className="space-y-5">
          <PhotoUploader
            onFiles={handleFiles}
            acceptPdf
            helperText="JPG, PNG, WEBP, HEIC or PDF (page 1 only) · up to 200 MB each"
            orderItemId={orderItem?.id}
            onPhoneUpload={handlePhoneUpload}
            onMobileFilesReceived={() => {
              qc.invalidateQueries({ queryKey: ["order-data", effectiveOrderId] });
            }}
          />

          {uploading > 0 && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading {uploading} file{uploading === 1 ? "" : "s"}…
            </div>
          )}

          {spec.canvases.length === 0 && uploading === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              Upload photos or PDF artwork above to start building canvases.
            </div>
          )}

          {spec.canvases.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {spec.canvases.map((c) => (
                <CanvasTile
                  key={c.id}
                  canvas={c}
                  signedUrl={
                    resolveUrl(c.preview_path) ??
                    resolveUrl(c.thumb_path) ??
                    resolveUrl(c.original_storage_path)
                  }
                  onEdit={() => setEditorId(c.id)}
                  onDuplicate={() => duplicateCanvas(c.id)}
                  onRemove={() => removeCanvas(c.id)}
                  onQuantityChange={(q) => updateCanvas(c.id, { quantity: q })}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: summary */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 sticky top-4">
            <h3 className="font-semibold">Order summary</h3>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Canvases</span>
              <span className="font-medium tabular-nums">{spec.canvases.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total prints</span>
              <span className="font-medium tabular-nums">{totalQty}</span>
            </div>
            {priceDisplay.showVatBreakdown ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal (ex VAT)</span>
                  <span className="font-medium tabular-nums">{formatPrice(netTotal, "ZAR")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{priceDisplay.vatLineLabel}</span>
                  <span className="font-medium tabular-nums">
                    {formatPrice(priceDisplay.vatOf(netTotal), "ZAR")}
                  </span>
                </div>
                <div className="flex justify-between text-base pt-1 border-t border-border">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold tabular-nums">
                    {formatPrice(priceDisplay.toGross(netTotal), "ZAR")}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-base pt-1 border-t border-border">
                <span className="font-semibold">Total</span>
                <span className="font-semibold tabular-nums">{formatPrice(netTotal, "ZAR")}</span>
              </div>
            )}
            {anyUnpriced && (
              <p className="text-[11px] text-destructive leading-snug">
                Some canvases have no matching price on your rate card yet — please contact us to
                confirm pricing before checkout.
              </p>
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={handleAddToCart}
              disabled={spec.canvases.length === 0 || submitting || anyUnpriced}
            >
              {submitting
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <ShoppingCart className="h-4 w-4 mr-2" />}
              Add to cart
            </Button>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Each canvas is priced per unit. Wrap depth and edge finish are set per canvas — tap
              "Edit" on any tile to change them.
            </p>
          </div>
        </div>
      </div>

      <CanvasEditorModal
        open={!!editorCanvas}
        canvas={editorCanvas}
        signedUrl={editorSignedUrl}
        sizes={sizeChoices}
        allowedWrapDepthsMm={allowedDepths}
        pixelScale={editorPixelScale}
        onClose={() => setEditorId(null)}
        onSave={(patch) => {
          if (editorCanvas) updateCanvas(editorCanvas.id, patch);
          setEditorId(null);
        }}
      />

      {qrItemId && (
        <QRUploadModal
          open={qrOpen}
          onOpenChange={setQrOpen}
          orderItemId={qrItemId}
          onFilesReceived={async (fileIds) => {
            if (!fileIds.length || !defaultSize) return;
            try {
              const { data: docs } = await supabase
                .from("documents")
                .select("id, file_name, file_path, mime_type")
                .in("id", fileIds);
              if (!docs?.length) return;

              const readDims = (url: string) =>
                new Promise<{ w: number; h: number }>((resolve) => {
                  const img = new Image();
                  img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
                  img.onerror = () => resolve({ w: 0, h: 0 });
                  img.src = url;
                });

              const newEntries: CanvasPrintEntry[] = [];
              for (const d of docs as any[]) {
                let dims = { w: 0, h: 0 };
                try {
                  const blob = await downloadFromS3(d.file_path);
                  const blobUrl = registerBlob(d.file_path, blob);
                  dims = await readDims(blobUrl);
                } catch (e) {
                  console.warn("[canvas] QR preview proxy download failed", d.file_path, e);
                }
                newEntries.push({
                  id: crypto.randomUUID(),
                  document_id: d.id,
                  file_name: d.file_name,
                  original_storage_path: d.file_path,
                  source_width_px: dims.w,
                  source_height_px: dims.h,
                  mime_type: d.mime_type || "image/jpeg",
                  source_was_pdf: false,
                  size_slug: defaultSize.slug,
                  frontWidthMm: Math.max(defaultSize.frontWidthMm, defaultSize.frontHeightMm),
                  frontHeightMm: Math.min(defaultSize.frontWidthMm, defaultSize.frontHeightMm),
                  pageOrientation: "landscape",
                  wrapMm: defaultWrap,
                  bleedMm: DEFAULT_BLEED_MM,
                  dpi: DEFAULT_DPI,
                  wrapMode: "gallery_wrap",

                  crop: { x: 0, y: 0 },
                  zoom: 1,
                  rotation: 0,
                  fit_mode: "fill",
                  croppedAreaPixels: null,
                  quantity: 1,
                });
              }
              setSpec((prev) => ({ canvases: [...prev.canvases, ...newEntries] }));
              toast.success(
                `Added ${newEntries.length} canvas${newEntries.length === 1 ? "" : "es"} from phone`,
              );
              if (newEntries[0]) setEditorId(newEntries[0].id);
              qc.invalidateQueries({ queryKey: ["order-data", effectiveOrderId] });
            } catch (e: any) {
              console.error("[canvas] QR ingest failed", e);
              toast.error("Could not import phone uploads");
            }
          }}
        />
      )}
    </div>
  );
}
