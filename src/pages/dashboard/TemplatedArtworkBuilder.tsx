/**
 * Customer builder for templated artwork (e.g. deskpad calendars).
 *
 * Admin supplies a multi-page base PDF plus placeholder boxes; the customer
 * drops images / types text into those boxes and the content repeats across
 * every page. The preview here is a client-side proof — the print-ready file
 * is composed server-side by the PDF server from the original PDF and the
 * full-resolution uploads.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, ShoppingCart } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";
import { useCreateOrder, useOrderData } from "@/hooks/useOrderBuilder";
import { useAddItemToCart } from "@/hooks/useCart";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { invalidateUserOrderCaches } from "@/lib/queryInvalidation";
import { downloadFromS3 } from "@/lib/s3Storage";
import { getCachedBlobUrl, registerBlob } from "@/lib/photoPrints/photoBlobCache";
import { rasterisePdfPageOneToImage } from "@/lib/canvasPrints/pdfToImage";
import { rasterisePdfPages, loadImage, type RasterisedPage } from "@/lib/artworkTemplates/pdfPages";
import { composeTemplatePage } from "@/lib/artworkTemplates/renderTemplate";
import { useArtworkPlaceholders, useArtworkTemplates } from "@/hooks/useArtworkTemplates";
import PlaceholderPanel from "@/components/artwork/PlaceholderPanel";
import QRUploadModal from "@/components/order/QRUploadModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { usePriceDisplay } from "@/lib/tax/usePriceDisplay";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { useCurrencyConverter } from "@/hooks/useCurrencyProfiles";
import { formatPrice } from "@/lib/formatCurrency";
import type {
  TemplatedArtworkSpec,
  TemplatedImageValue,
  TemplatedPlaceholderValue,
} from "@/lib/artworkTemplates/types";

const TemplatedArtworkBuilder = forwardRef<HTMLDivElement>(function TemplatedArtworkBuilder(
  _props,
  ref,
) {
  const { id: orderIdParam } = useParams<{ id?: string }>();
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { tenantId } = useTenantContext();
  const { activeBranch } = useBranch();

  const createOrder = useCreateOrder();
  const addItemToCart = useAddItemToCart();

  // ── Product family (kind = templated_artwork)
  const { data: family, isLoading: familyLoading } = useQuery({
    queryKey: ["templated_artwork_family", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_families")
        .select("*")
        .eq("kind", "templated_artwork")
        .or(tenantId ? `tenant_id.eq.${tenantId},tenant_id.is.null` : "tenant_id.is.null");
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return rows.find((r) => r.tenant_id === tenantId) ?? rows[0] ?? null;
    },
  });
  const familyId: string | null = family?.id ?? null;

  const { data: templates = [], isLoading: templatesLoading } = useArtworkTemplates(familyId, {
    publishedOnly: true,
  });

  const [templateId, setTemplateId] = useState<string | null>(null);
  const template = templates.find((t) => t.id === templateId) ?? null;
  useEffect(() => {
    if (!templateId && templates.length > 0) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  const { data: placeholders = [] } = useArtworkPlaceholders(templateId);

  // ── Order lazy-init
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const effectiveOrderId = orderIdParam ?? createdOrderId ?? undefined;
  const { order, orderItem } = useOrderData(effectiveOrderId);

  const ensureOrder = useCallback(async (): Promise<string> => {
    if (orderItem?.id) return orderItem.id;
    if (!familyId) throw new Error("This product isn't configured yet.");
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

  const { uploadPhoto } = usePhotoUpload(orderItem?.id);

  // ── Spec state
  const [values, setValues] = useState<Record<string, TemplatedPlaceholderValue>>({});
  const [quantity, setQuantity] = useState(1);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    const s = (orderItem?.spec as any)?.templated_artwork as TemplatedArtworkSpec | undefined;
    if (!s) return;
    hydrated.current = true;
    if (s.template_id) setTemplateId(s.template_id);
    const map: Record<string, TemplatedPlaceholderValue> = {};
    for (const v of s.placeholders ?? []) map[v.placeholder_id] = v;
    setValues(map);
    const q = (orderItem?.spec as any)?.quantity;
    if (typeof q === "number" && q > 0) setQuantity(q);
  }, [orderItem?.spec]);

  const specForSave = useMemo<TemplatedArtworkSpec>(
    () => ({
      template_id: templateId ?? "",
      template_name: template?.name,
      base_pdf_path: template?.base_pdf_path ?? null,
      page_count: template?.page_count,
      trim_width_mm: template?.trim_width_mm,
      trim_height_mm: template?.trim_height_mm,
      bleed_mm: template?.bleed_mm,
      placeholders: placeholders
        .map((p) => values[p.id])
        .filter(Boolean) as TemplatedPlaceholderValue[],
      // Geometry snapshot for the print-ready composer.
      placeholder_defs: placeholders,
    }),
    [templateId, template, placeholders, values],
  );

  // Debounced persist onto the order item.
  const persistTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!orderItem?.id || !templateId) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      const base = (orderItem.spec as any) || {};
      await supabase
        .from("order_items")
        .update({
          spec: {
            ...base,
            page_count: template?.page_count ?? 1,
            quantity,
            is_color: true,
            is_duplex: false,
            selected_options: base.selected_options || {},
            templated_artwork: specForSave,
          },
          quantity,
        })
        .eq("id", orderItem.id);
    }, 600);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [specForSave, quantity, orderItem?.id, orderItem?.spec, template?.page_count, templateId]);

  // ── Render the template pages
  const [pages, setPages] = useState<RasterisedPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setPageIndex(0);
    if (!template?.base_pdf_path) return;
    setPagesLoading(true);
    (async () => {
      try {
        const blob = await downloadFromS3(template.base_pdf_path!);
        const rendered = await rasterisePdfPages(blob, { targetLongPx: 1400 });
        if (!cancelled) setPages(rendered);
      } catch (err) {
        console.error("[templated-artwork] template render failed", err);
        if (!cancelled) toast.error("Could not load this layout. Please try another.");
      } finally {
        if (!cancelled) setPagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [template?.id, template?.base_pdf_path]);

  const [pageImages, setPageImages] = useState<Record<number, HTMLImageElement>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<number, HTMLImageElement> = {};
      for (const p of pages) {
        try {
          next[p.index] = await loadImage(p.dataUrl);
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setPageImages(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [pages]);

  // ── Customer images (blob-proxied so canvas stays untainted)
  const [placedImages, setPlacedImages] = useState<Record<string, HTMLImageElement>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const [phId, value] of Object.entries(values)) {
        if (value.kind !== "image") continue;
        if (placedImages[phId]?.dataset?.path === value.storage_path) continue;
        const path = (value as TemplatedImageValue).storage_path;
        try {
          let url = getCachedBlobUrl(path);
          if (!url) {
            const blob = await downloadFromS3(path);
            registerBlob(path, blob);
            url = getCachedBlobUrl(path);
          }
          if (!url) continue;
          const img = await loadImage(url);
          img.dataset.path = path;
          if (cancelled) return;
          setPlacedImages((prev) => ({ ...prev, [phId]: img }));
        } catch (err) {
          console.warn("[templated-artwork] image load failed", path, err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  // ── Preview canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    const page = pages[pageIndex];
    if (!el || !page || !template) return;
    el.width = page.widthPx;
    el.height = page.heightPx;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    composeTemplatePage(ctx, {
      pageImage: pageImages[page.index] ?? null,
      pageWidthPx: page.widthPx,
      pageHeightPx: page.heightPx,
      trimWidthMm: template.trim_width_mm || page.widthMm,
      placeholders,
      values,
      images: placedImages,
      showBoxes: true,
      activeId,
    });
  }, [pages, pageIndex, pageImages, placedImages, placeholders, values, template, activeId]);

  // ── Uploads
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrItemId, setQrItemId] = useState<string | undefined>();

  const handlePickFile = useCallback(
    async (placeholderId: string, rawFile: File) => {
      setBusyId(placeholderId);
      try {
        const isPdf = rawFile.type === "application/pdf" || /\.pdf$/i.test(rawFile.name);
        const wasPdf = isPdf;
        const file = isPdf ? await rasterisePdfPageOneToImage(rawFile) : rawFile;
        const itemId = await ensureOrder();
        const uploaded = await uploadPhoto(file, itemId);
        if (!uploaded) return;
        const ph = placeholders.find((p) => p.id === placeholderId);
        const next: TemplatedImageValue = {
          placeholder_id: placeholderId,
          kind: "image",
          document_id: uploaded.documentId,
          storage_path: uploaded.storagePath,
          file_name: uploaded.fileName,
          mime_type: uploaded.mimeType,
          source_was_pdf: wasPdf,
          source_width_px: uploaded.width,
          source_height_px: uploaded.height,
          fit: ph?.fit_mode ?? "fill",
          scale: 1,
          offset_x: 0,
          offset_y: 0,
          background_hex: ph?.background_hex ?? null,
        };
        setValues((prev) => ({ ...prev, [placeholderId]: next }));
      } catch (err: any) {
        console.error("[templated-artwork] upload failed", err);
        toast.error(err?.message ?? "Upload failed");
      } finally {
        setBusyId(null);
      }
    },
    [ensureOrder, uploadPhoto, placeholders],
  );

  const handlePhoneUpload = useCallback(async () => {
    try {
      const id = await ensureOrder();
      setQrItemId(id);
      setQrOpen(true);
    } catch {
      toast.error("Could not start phone upload. Please try again.");
    }
  }, [ensureOrder]);

  // ── Pricing (v1: flat unit price configured on the product family)
  const priceDisplay = usePriceDisplay();
  const { region, baseCurrency, displayDefaultCurrency } = useRegionalPricing();
  const activeCurrency = region?.currency_code ?? displayDefaultCurrency ?? "ZAR";
  const { convert } = useCurrencyConverter(activeCurrency, baseCurrency);

  const baseUnit = Number((family?.printing_rules as any)?.templated_unit_price ?? 0);
  const unitPrice = convert(baseUnit);
  const netTotal = unitPrice * Math.max(quantity, 1);

  // ── Validation + cart
  const missingRequired = placeholders.filter((p) => {
    if (!p.is_required) return false;
    const v = values[p.id];
    if (!v) return true;
    if (v.kind === "text") return !v.value.trim();
    return !v.storage_path;
  });

  const [submitting, setSubmitting] = useState(false);
  const handleAddToCart = async () => {
    if (!order || !orderItem || submitting) return;
    if (!template) {
      toast.error("Choose a layout first.");
      return;
    }
    if (missingRequired.length > 0) {
      toast.error(`Please complete: ${missingRequired.map((p) => p.name).join(", ")}`);
      return;
    }
    setSubmitting(true);
    try {
      const replacesCartItemId = (order.metadata as any)?.replaces_cart_item_id;
      await addItemToCart.mutateAsync({
        orderItemId: orderItem.id,
        draftOrderId: order.id,
        title: `${family?.name ?? "Templated artwork"} — ${template.name}`,
        unitPrice,
        quantity: Math.max(quantity, 1),
        totalPrice: netTotal,
        spec: {
          page_count: template.page_count,
          quantity: Math.max(quantity, 1),
          is_color: true,
          is_duplex: false,
          selected_options: {},
          templated_artwork: specForSave,
        } as any,
        replacesCartItemId: replacesCartItemId || undefined,
      });
      invalidateUserOrderCaches(qc);
      toast.success("Added to cart");
      navigate(tenantPath("cart"));
    } catch (e: any) {
      console.error("[templated-artwork] add to cart failed", e);
      toast.error(e?.message ?? "Failed to add to cart");
    } finally {
      setSubmitting(false);
    }
  };

  if (familyLoading || templatesLoading) {
    return <Skeleton className="m-6 h-96" />;
  }

  if (!familyId || templates.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No artwork layouts are published for this product yet.
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <h1 className="text-2xl font-semibold">{family?.name ?? "Custom artwork"}</h1>
      </div>

      {/* Layout picker */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplateId(t.id)}
            className={`shrink-0 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
              templateId === t.id ? "border-primary bg-primary/5" : "hover:bg-muted"
            }`}
          >
            <span className="block font-medium">{t.name}</span>
            <span className="block text-xs text-muted-foreground">
              {t.page_count} pages · {t.trim_width_mm} × {t.trim_height_mm} mm
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr_300px]">
        {/* Controls */}
        <div className="space-y-3">
          {placeholders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This layout has no editable areas — it prints exactly as designed.
            </p>
          ) : (
            placeholders.map((p) => (
              <PlaceholderPanel
                key={p.id}
                placeholder={p}
                value={values[p.id]}
                busy={busyId === p.id}
                active={activeId === p.id}
                onFocus={() => setActiveId(p.id)}
                onPickFile={(file) => handlePickFile(p.id, file)}
                onPhoneUpload={p.kind === "image" ? handlePhoneUpload : undefined}
                onChange={(v) => setValues((prev) => ({ ...prev, [p.id]: v }))}
                onClear={() =>
                  setValues((prev) => {
                    const next = { ...prev };
                    delete next[p.id];
                    return next;
                  })
                }
              />
            ))
          )}
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            {pagesLoading ? (
              <Skeleton className="aspect-[4/3] w-full" />
            ) : (
              <canvas ref={canvasRef} className="block h-auto w-full rounded bg-white shadow-sm" />
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pageIndex + 1} of {pages.length || 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={pageIndex >= pages.length - 1}
              onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {pages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto rounded-lg border bg-muted/30 p-2">
              {pages.map((p) => (
                <button
                  key={p.index}
                  onClick={() => setPageIndex(p.index)}
                  className={`shrink-0 rounded border-2 ${
                    p.index === pageIndex ? "border-primary" : "border-transparent"
                  }`}
                >
                  <img src={p.dataUrl} alt={`Page ${p.index + 1}`} className="h-16 w-auto rounded-sm" />
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Your artwork repeats on every page. This is a proof — the final print file is produced at
            full resolution.
          </p>
        </div>

        {/* Summary */}
        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Order summary</h2>
          <div className="space-y-1.5">
            <Label className="text-xs">Quantity</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-semibold">
              {baseUnit > 0
                ? `${formatPrice(priceDisplay.toGross(netTotal), activeCurrency)} ${priceDisplay.inclSuffix}`.trim()
                : "On request"}
            </span>
          </div>
          {missingRequired.length > 0 && (
            <p className="text-xs text-destructive">
              Still needed: {missingRequired.map((p) => p.name).join(", ")}
            </p>
          )}
          <Button
            className="w-full"
            onClick={handleAddToCart}
            disabled={submitting || missingRequired.length > 0}
          >
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="mr-1.5 h-4 w-4" />
            )}
            Add to cart
          </Button>
        </div>
      </div>

      <QRUploadModal open={qrOpen} onOpenChange={setQrOpen} orderItemId={qrItemId} />
    </div>
  );
});

export default TemplatedArtworkBuilder;
