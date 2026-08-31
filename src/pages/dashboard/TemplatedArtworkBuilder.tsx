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
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Eye, LayoutTemplate, Loader2, ShoppingCart } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";
import { useCreateOrder, useOrderData } from "@/hooks/useOrderBuilder";
import { useAddItemToCart } from "@/hooks/useCart";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { invalidateUserOrderCaches } from "@/lib/queryInvalidation";
import { downloadFromS3, uploadToS3 } from "@/lib/s3Storage";
import { getCachedBlobUrl, registerBlob } from "@/lib/photoPrints/photoBlobCache";
import { rasterisePdfPageOneToImage } from "@/lib/canvasPrints/pdfToImage";
import { rasterisePdfPages, loadImage, type RasterisedPage } from "@/lib/artworkTemplates/pdfPages";
import { composeTemplatePage } from "@/lib/artworkTemplates/renderTemplate";
import { useArtworkPlaceholders, useArtworkTemplates } from "@/hooks/useArtworkTemplates";
import PlaceholderPanel from "@/components/artwork/PlaceholderPanel";
import ArtworkProofModal from "@/components/artwork/ArtworkProofModal";
import UploadedArtworkBuilder from "@/pages/dashboard/UploadedArtworkBuilder";
import TemplatePickerSheet, { TemplateThumb } from "@/components/artwork/TemplatePickerSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePriceDisplay } from "@/lib/tax/usePriceDisplay";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { useCurrencyConverter } from "@/hooks/useCurrencyProfiles";
import { useFamilyPackPricing } from "@/hooks/useFamilyPackBlocks";
import {
  computePackPrice,
  packQuantitiesForOption,
  snapQuantity,
  visibleOptions,
} from "@/lib/pricing/packOptions";

import { useCustomerPricingTier } from "@/hooks/useCustomerPricingTier";
import { formatPrice } from "@/lib/formatCurrency";
import type {
  TemplatedArtworkSpec,
  TemplatedImageValue,
  TemplatedPlaceholderValue,
} from "@/lib/artworkTemplates/types";
import { DEFAULT_CMYK, normaliseCmyk } from "@/lib/artworkTemplates/types";



const TemplatedArtworkBuilder = forwardRef<HTMLDivElement>(function TemplatedArtworkBuilder(
  _props,
  ref,
) {
  const { id: orderIdParam, familyId: routeFamilyId } = useParams<{ id?: string; familyId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get("mode") === "upload";
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { tenantId } = useTenantContext();
  const { activeBranch } = useBranch();

  const createOrder = useCreateOrder();
  const addItemToCart = useAddItemToCart();

  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const effectiveOrderId = orderIdParam ?? createdOrderId ?? undefined;
  const { order, orderItem } = useOrderData(effectiveOrderId);
  const selectedFamilyId = routeFamilyId ?? orderItem?.product_family_id ?? null;


  // Resolve the exact family selected by the customer (or stored on the order).
  const { data: family, isLoading: familyLoading } = useQuery({
    queryKey: ["editable_artwork_family", selectedFamilyId],
    queryFn: async () => {
      if (!selectedFamilyId) return null;
      const { data, error } = await supabase
        .from("product_families")
        .select("*")
        .eq("id", selectedFamilyId)
        .maybeSingle();
      if (error) throw error;
      if (
        data &&
        !data.supports_editable_artwork &&
        !(data as any).supplied_artwork_only &&
        data.kind !== "templated_artwork"
      )
        return null;
      return data;
    },
    enabled: !!selectedFamilyId,
  });
  const familyId: string | null = family?.id ?? null;

  /** Upload route: explicit ?mode=upload, an order that already holds a supplied
   *  PDF, or a family configured as supplied-artwork only. */
  const uploadMode =
    modeParam ||
    !!(orderItem?.spec as any)?.uploaded_artwork ||
    !!(family as any)?.supplied_artwork_only;


  const { data: templates = [], isLoading: templatesLoading } = useArtworkTemplates(familyId, {
    publishedOnly: true,
  });

  const [templateId, setTemplateId] = useState<string | null>(null);
  const template = templates.find((t) => t.id === templateId) ?? null;
  useEffect(() => {
    if (!templateId && templates.length > 0) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  const { data: placeholders = [] } = useArtworkPlaceholders(templateId);

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
      trim_offset_x_mm: template?.trim_offset_x_mm,
      trim_offset_y_mm: template?.trim_offset_y_mm,
      bleed_mm: template?.bleed_mm,

      placeholders: placeholders
        .map((p) => {
          const v = values[p.id];
          if (v) return v;
          // Colour boxes always ship a value so the composer paints the default.
          if (p.kind === "colour") {
            return {
              placeholder_id: p.id,
              kind: "colour" as const,
              cmyk: normaliseCmyk(p.default_cmyk ?? DEFAULT_CMYK),
              opacity: p.opacity ?? 1,
            };
          }
          return null;
        })
        .filter(Boolean) as TemplatedPlaceholderValue[],

      // Geometry snapshot for the print-ready composer.
      placeholder_defs: placeholders,
    }),
    [templateId, template, placeholders, values],
  );

  // Debounced persist onto the order item.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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
      setSavedAt(Date.now());
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
        const rendered = await rasterisePdfPages(blob, {
          targetLongPx: 1400,
        });
        if (!cancelled) setPages(rendered);
      } catch (err) {
        console.error("[templated-artwork] template render failed", err);
        if (!cancelled) {
          if ((err as Error)?.name === "StorageSessionError") {
            toast.error("Your session timed out. Reload to continue.", {
              action: { label: "Reload", onClick: () => window.location.reload() },
              duration: 10000,
            });
          } else {
            toast.error("Could not load this layout. Please try another.");
          }
        }
      } finally {
        if (!cancelled) setPagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    template?.id,
    template?.base_pdf_path,
  ]);

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
        // Keep the original vector PDF too — the print composer places it as a
        // form XObject (with a transparency group when opacity < 1) instead of
        // using the rasterised proof image.
        let sourcePdfPath: string | null = null;
        if (isPdf) {
          try {
            sourcePdfPath = `artwork-uploads/${itemId}/${placeholderId}-source.pdf`;
            await uploadToS3(sourcePdfPath, rawFile);
          } catch (err) {
            console.warn("[templated-artwork] original PDF upload failed", err);
            sourcePdfPath = null;
          }
        }
        const ph = placeholders.find((p) => p.id === placeholderId);
        const next: TemplatedImageValue = {
          placeholder_id: placeholderId,
          kind: "image",
          document_id: uploaded.documentId,
          storage_path: uploaded.storagePath,
          file_name: uploaded.fileName,
          mime_type: uploaded.mimeType,
          source_was_pdf: wasPdf,
          source_pdf_path: sourcePdfPath,
          source_width_px: uploaded.width,
          source_height_px: uploaded.height,
          fit: ph?.fit_mode ?? "fill",
          scale: 1,
          offset_x: 0,
          offset_y: 0,
          background_hex: ph?.background_hex ?? null,
          opacity: ph?.opacity ?? 1,
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

  // ── Pricing: pack ladder (with finishing options + paid extras) when the
  // family defines one, otherwise the legacy flat unit price.
  const priceDisplay = usePriceDisplay();
  const { region, baseCurrency, displayDefaultCurrency } = useRegionalPricing();
  const activeCurrency = region?.currency_code ?? displayDefaultCurrency ?? "ZAR";
  const { convert } = useCurrencyConverter(activeCurrency, baseCurrency);
  const { blocks: packBlocks, options: allPricingOptions, addons: pricingAddons } =
    useFamilyPackPricing(family as any);

  const { tier: pricingTier } = useCustomerPricingTier();
  const pricingOptions = useMemo(
    () => visibleOptions(allPricingOptions, pricingTier),
    [allPricingOptions, pricingTier],
  );

  const [pricingOption, setPricingOption] = useState<string | null>(null);
  useEffect(() => {
    if (pricingOptions.length === 0) {
      setPricingOption(null);
      return;
    }
    setPricingOption((cur) =>
      cur && pricingOptions.some((o) => o.slug === cur) ? cur : pricingOptions[0].slug,
    );
  }, [pricingOptions]);


  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  useEffect(() => {
    setSelectedAddons(pricingAddons.filter((a) => a.default_on).map((a) => a.slug));
  }, [pricingAddons]);

  // A file placed in a box flagged as "watermark image" forces the paid
  // watermark-printing extra on (extra ink), locked until the file is removed.
  const watermarkPlaced = useMemo(
    () => placeholders.some((p) => (p as any).is_watermark && !!values[p.id]),
    [placeholders, values],
  );
  const watermarkAddonSlug = useMemo(() => {
    const hit = pricingAddons.find(
      (a) =>
        a.slug.toLowerCase().includes("watermark") ||
        (a.label ?? "").toLowerCase().includes("watermark"),
    );
    return hit?.slug ?? null;
  }, [pricingAddons]);

  useEffect(() => {
    if (!watermarkAddonSlug) return;
    setSelectedAddons((prev) => {
      if (watermarkPlaced) {
        return prev.includes(watermarkAddonSlug) ? prev : [...prev, watermarkAddonSlug];
      }
      const isDefault = pricingAddons.find((a) => a.slug === watermarkAddonSlug)?.default_on;
      if (isDefault) return prev;
      return prev.filter((s) => s !== watermarkAddonSlug);
    });
  }, [watermarkAddonSlug, watermarkPlaced, pricingAddons]);



  const packOptions = useMemo(
    () => packQuantitiesForOption(packBlocks, pricingOption, pricingTier, allPricingOptions),
    [packBlocks, pricingOption, pricingTier, allPricingOptions],
  );

  const packMode = packOptions.length > 0;

  useEffect(() => {
    if (!packMode) return;
    if (!packOptions.some((o) => o.qty === quantity)) {
      setQuantity(snapQuantity(packOptions, quantity) ?? packOptions[0].qty);
    }
  }, [packMode, packOptions, quantity]);

  const activePack = packMode
    ? packOptions.find((o) => o.qty === quantity) ?? packOptions[0]
    : null;
  const baseUnit = Number((family?.printing_rules as any)?.templated_unit_price ?? 0);
  const baseNet = activePack
    ? convert(activePack.priceMinor / 100)
    : convert(baseUnit) * Math.max(quantity, 1);
  const priced = useMemo(
    () =>
      computePackPrice({
        baseNet,
        quantity: Math.max(quantity, 1),
        // Fixed / per-unit extras are authored in the base currency.
        addons: pricingAddons.map((a) =>
          a.kind === "percent" ? a : { ...a, amount: convert(a.amount) },
        ),
        selected: selectedAddons,
      }),
    [baseNet, quantity, pricingAddons, selectedAddons, convert],
  );
  const netTotal = priced.netTotal;
  const unitPrice = priced.unitPrice;

  // ── Validation + cart
  const missingRequired = placeholders.filter((p) => {
    if (!p.is_required) return false;
    // Colour boxes always carry a default ink build, so they can't be "missing".
    if (p.kind === "colour") return false;
    const v = values[p.id];
    if (!v) return true;
    if (v.kind === "text") return !v.value.trim();
    if (v.kind === "colour") return false;
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
          selected_options: {
            ...(pricingOption
              ? {
                  "Finishing Option":
                    pricingOptions.find((o) => o.slug === pricingOption)?.label ?? pricingOption,
                }
              : {}),
            ...Object.fromEntries(priced.addonLines.map((l) => [l.label, "Yes"])),
          },
          pricing_option: pricingOption,
          pricing_tier: pricingTier,
          pricing_addons: priced.addonLines,
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

  /** Expected geometry for the upload route: the published layout when there
   *  is one, otherwise the family's supplied-artwork settings. */
  const uploadGeometry = useMemo(() => {
    const t = templates[0] as any;
    if (t) {
      return {
        page_count: t.page_count ?? null,
        trim_width_mm: t.trim_width_mm ?? null,
        trim_height_mm: t.trim_height_mm ?? null,
        bleed_mm: t.bleed_mm ?? null,
      };
    }
    const f = family as any;
    if (!f) return null;
    return {
      page_count: f.expected_page_count ?? null,
      trim_width_mm: f.expected_trim_width_mm ?? null,
      trim_height_mm: f.expected_trim_height_mm ?? null,
      bleed_mm: null,
    };
  }, [templates, family]);

  if (familyLoading || templatesLoading) {
    return <Skeleton className="m-6 h-96" />;
  }

  // "Upload my own artwork" route — the customer supplies a finished PDF.
  if (uploadMode) {
    return (
      <UploadedArtworkBuilder
        ref={ref}
        family={family as any}
        reference={uploadGeometry}
        orderIdParam={orderIdParam}
        onSwitchToDesign={
          templates.length > 0 && !(family as any)?.supplied_artwork_only
            ? () => setSearchParams({}, { replace: true })
            : undefined
        }
      />
    );
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


  const sizeCaption = template
    ? `${family?.name ?? "Artwork"} (${Math.round(template.trim_width_mm)} × ${Math.round(
        template.trim_height_mm,
      )} mm)`
    : family?.name ?? "";

  return (
    <div ref={ref} className="flex h-full min-h-0 w-full flex-1 flex-col bg-muted/20">
      {/* Editor bar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <h1 className="text-base font-semibold">{family?.name ?? "Custom artwork"}</h1>
        {savedAt && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-primary" /> Saved
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {templates.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <LayoutTemplate className="mr-1.5 h-4 w-4" /> Change layout
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProofOpen(true)}
            disabled={pages.length === 0}
          >
            <Eye className="mr-1.5 h-4 w-4" /> Preview proof
          </Button>
          <Button
            size="sm"
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

      {/* Three-zone editor */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
        {/* Left rail — layout + placeholder controls */}
        <div className="min-h-0 space-y-3 overflow-y-auto border-b bg-background p-3 lg:border-b-0 lg:border-r">
          {templates.length > 1 && template && (
            <div className="space-y-1.5">
              <Label className="text-xs">Layout</Label>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex w-full items-center gap-3 rounded-lg border bg-background p-2 text-left transition hover:border-primary/60"
              >
                <TemplateThumb template={template} className="h-14 w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {template.page_count} pages · Change layout
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </div>
          )}

          {placeholders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This layout has no editable areas — it prints exactly as designed.
            </p>
          ) : (
            placeholders.map((p, i) => (
              <PlaceholderPanel
                key={p.id}
                placeholder={p}
                value={values[p.id]}
                busy={busyId === p.id}
                step={i + 1}
                active={activeId === p.id}

                onFocus={() => setActiveId(p.id)}
                onPickFile={(file) => handlePickFile(p.id, file)}
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

        {/* Stage */}
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="px-4 pt-3 text-xs text-muted-foreground">{sizeCaption}</div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
            {pagesLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <canvas
                ref={canvasRef}
                className="bg-white shadow-md"
                style={{ maxHeight: "100%", maxWidth: "100%", width: "auto", height: "auto" }}
              />
            )}
          </div>

          {/* Filmstrip */}
          <div className="flex items-center gap-2 border-t bg-background px-3 py-2">
            <Button
              size="icon"
              variant="ghost"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
              {pages.map((p) => (
                <button
                  key={p.index}
                  onClick={() => setPageIndex(p.index)}
                  className={`shrink-0 rounded border-2 p-0.5 ${
                    p.index === pageIndex ? "border-primary" : "border-transparent hover:border-border"
                  }`}
                >
                  <img src={p.dataUrl} alt={`Page ${p.index + 1}`} className="h-12 w-auto" />
                </button>
              ))}
              {pages.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Page {pageIndex + 1} of {pages.length || 1}
                </span>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              Page {pageIndex + 1} of {pages.length || 1}
            </span>
            <Button
              size="icon"
              variant="ghost"
              disabled={pageIndex >= pages.length - 1}
              onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="min-h-0 space-y-4 overflow-y-auto border-t bg-background p-4 lg:border-l lg:border-t-0">
          <h2 className="text-sm font-semibold">Order summary</h2>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Product</span>
            <span className="text-right font-medium">{family?.name ?? "—"}</span>
          </div>
          {pricingOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Finishing option</Label>
              <Select value={pricingOption ?? ""} onValueChange={(v) => setPricingOption(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pricingOptions.map((o) => (
                    <SelectItem key={o.slug} value={o.slug}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Quantity</Label>
            {packMode ? (
              <Select value={String(quantity)} onValueChange={(v) => setQuantity(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {packOptions.map((o) => (
                    <SelectItem key={o.qty} value={String(o.qty)}>
                      {o.qty.toLocaleString()} —{" "}
                      {formatPrice(
                        priceDisplay.toGross(convert(o.priceMinor / 100)),
                        activeCurrency,
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              />
            )}
          </div>

          {pricingAddons.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Optional extras</Label>
              <div className="space-y-1.5">
                {pricingAddons.map((a) => {
                  const line = priced.addonLines.find((l) => l.slug === a.slug);
                  const preview =
                    a.kind === "percent"
                      ? `+${a.amount}%`
                      : `+${formatPrice(
                          priceDisplay.toGross(
                            convert(a.amount) *
                              (a.kind === "per_unit" ? Math.max(quantity, 1) : 1),
                          ),
                          activeCurrency,
                        )}`;
                  const locked = watermarkPlaced && a.slug === watermarkAddonSlug;
                  return (
                    <label
                      key={a.slug}
                      className={`flex items-center justify-between gap-2 rounded-md border p-2 text-xs ${
                        locked ? "cursor-default bg-muted/50" : "cursor-pointer"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedAddons.includes(a.slug)}
                          disabled={locked}
                          onCheckedChange={(v) =>
                            setSelectedAddons((prev) =>
                              v === true ? [...prev, a.slug] : prev.filter((s) => s !== a.slug),
                            )
                          }
                        />
                        <span>
                          {a.label}
                          {locked && (
                            <span className="ml-1.5 text-[11px] text-muted-foreground">
                              (required — watermark image supplied)
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {line
                          ? `+${formatPrice(priceDisplay.toGross(line.amount), activeCurrency)}`
                          : preview}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-semibold">
              {netTotal > 0
                ? `${formatPrice(priceDisplay.toGross(netTotal), activeCurrency)} ${priceDisplay.inclSuffix}`.trim()
                : "On request"}
            </span>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setProofOpen(true)}
            disabled={pages.length === 0}
          >
            <Eye className="mr-1.5 h-4 w-4" /> Preview proof
          </Button>
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
          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            Your artwork repeats on every page. This is a proof — the final print file is produced
            at full resolution.
          </div>
        </div>
      </div>

      <TemplatePickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        templates={templates}
        selectedId={templateId}
        onSelect={setTemplateId}
        hasArtwork={Object.keys(values).length > 0}
      />

      <ArtworkProofModal
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        pages={pages}
        pageImages={pageImages}
        placedImages={placedImages}
        placeholders={placeholders}
        values={values}
        trimWidthMm={template?.trim_width_mm ?? 0}
        initialPage={pageIndex}
        title={`${family?.name ?? "Artwork"} proof`}
      />

    </div>
  );

});

export default TemplatedArtworkBuilder;
