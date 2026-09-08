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
import StockImagePicker from "@/components/artwork/StockImagePicker";
import { usePhotoLibraryForProduct } from "@/hooks/usePhotoLibrarySettings";
import { fetchStockPhotoFile, type StockPhoto } from "@/lib/stockImages/pexels";
import { forgetBlob, getCachedBlobUrl, pinBlobPaths, registerBlob, unpinBlobPaths } from "@/lib/photoPrints/photoBlobCache";
import { rasterisePdfPageOneToPng } from "@/lib/canvasPrints/pdfToImage";
import { rasterisePdfPages, pdfPageCount, loadImage, type RasterisedPage } from "@/lib/artworkTemplates/pdfPages";
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
  ArtworkPlaceholder,
  TemplatedArtworkSpec,
  TemplatedImageValue,
  StockImageSource,
  TemplatedPlaceholderValue,
} from "@/lib/artworkTemplates/types";
import {
  DEFAULT_CMYK,
  keyBelongsTo,
  normaliseCmyk,
  pickForPage,
  placeholdersForPage,
  valueKey,
} from "@/lib/artworkTemplates/types";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";



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
    tenantId,
  });

  const [templateId, setTemplateId] = useState<string | null>(null);
  const template = templates.find((t) => t.id === templateId) ?? null;
  useEffect(() => {
    if (!templateId && templates.length > 0) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  const { data: placeholders = [] } = useArtworkPlaceholders(templateId, { tenantId });


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
  /** Keyed by placeholder id, or `id@pageIndex` for per-page pictures. */
  const [values, setValues] = useState<Record<string, TemplatedPlaceholderValue>>({});
  /** Boxes the customer switched to "a different picture on every page". */
  const [perPageIds, setPerPageIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const hydrated = useRef(false);

  /** Watermark boxes may never print above 10% — enforced wherever a value lands. */
  const capWatermark = (
    p: { is_watermark?: boolean } | undefined,
    v: TemplatedPlaceholderValue,
  ): TemplatedPlaceholderValue =>
    p?.is_watermark ? ({ ...v, opacity: Math.min((v as any).opacity ?? 0.1, 0.1) } as any) : v;


  useEffect(() => {
    if (hydrated.current) return;
    const s = (orderItem?.spec as any)?.templated_artwork as TemplatedArtworkSpec | undefined;
    if (!s) return;
    hydrated.current = true;
    if (s.template_id) setTemplateId(s.template_id);
    const map: Record<string, TemplatedPlaceholderValue> = {};
    for (const v of s.placeholders ?? []) {
      const def = (s.placeholder_defs ?? []).find((d) => d.id === v.placeholder_id);
      const page = v.kind === "image" ? (v.page_index ?? null) : null;
      map[valueKey(v.placeholder_id, page)] = capWatermark(def, v);
    }
    setValues(map);
    setPerPageIds(s.per_page_placeholder_ids ?? []);
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

      placeholders: placeholders.flatMap((p) => {
        // Every value belonging to this box: the page-agnostic one and/or a
        // per-page picture for each page the customer filled in.
        const own = Object.entries(values)
          .filter(([k]) => keyBelongsTo(k, p.id))
          .map(([, v]) => v);
        if (own.length > 0) return own;
        // Colour boxes always ship a value so the composer paints the default.
        if (p.kind === "colour") {
          return [
            {
              placeholder_id: p.id,
              kind: "colour" as const,
              cmyk: normaliseCmyk(p.default_cmyk ?? DEFAULT_CMYK),
              opacity: p.opacity ?? 1,
            },
          ];
        }
        return [];
      }) as TemplatedPlaceholderValue[],

      per_page_placeholder_ids: perPageIds,

      // Geometry snapshot for the print-ready composer.
      placeholder_defs: placeholders,
    }),
    [templateId, template, placeholders, values, perPageIds],
  );

  // Debounced persist onto the order item.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const persistTimer = useRef<NodeJS.Timeout | null>(null);
  /** Latest spec + basket item, so a long upload run can force a save. */
  const specRef = useRef<TemplatedArtworkSpec | null>(null);
  const persistCtxRef = useRef<{ id?: string; spec?: any }>({});
  useEffect(() => {
    specRef.current = specForSave;
    persistCtxRef.current = { id: orderItem?.id, spec: orderItem?.spec };
  }, [specForSave, orderItem?.id, orderItem?.spec]);

  /** Write the current artwork straight away (used after a batch placement). */
  const persistNow = useCallback(async () => {
    const { id, spec } = persistCtxRef.current;
    const current = specRef.current;
    if (!id || !current?.template_id) return;
    const base = (spec as any) || {};
    const { error } = await supabase
      .from("order_items")
      .update({
        spec: {
          ...base,
          page_count: template?.page_count ?? 1,
          quantity,
          is_color: true,
          is_duplex: false,
          selected_options: base.selected_options || {},
          templated_artwork: current,
        },
        quantity,
      })
      .eq("id", id);
    if (error) console.error("[templated-artwork] save failed", error);
    else setSavedAt(Date.now());
  }, [template?.page_count, quantity]);

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
          cropTo: "bleed",
          bleedMm: template.bleed_mm ?? 3,
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
    template?.bleed_mm,
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
  /** Boxes whose stored image could not be displayed — surfaced in the rail. */
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  /** Bumped to force another attempt at the images that failed. */
  const [imageRetry, setImageRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const [phId, value] of Object.entries(values)) {
        if (value.kind !== "image") continue;
        if (placedImages[phId]?.dataset?.path === value.storage_path) continue;
        const path = (value as TemplatedImageValue).storage_path;
        if (!path) continue;
        // Two attempts: the cached blob first, then a clean re-download in
        // case the cached copy was revoked or arrived corrupt.
        let img: HTMLImageElement | null = null;
        for (let attempt = 0; attempt < 2 && !img; attempt++) {
          try {
            if (attempt === 1) forgetBlob(path);
            let url = getCachedBlobUrl(path);
            if (!url) {
              const blob = await downloadFromS3(path);
              registerBlob(path, blob);
              url = getCachedBlobUrl(path);
            }
            if (!url) continue;
            const loaded = await loadImage(url);
            loaded.dataset.path = path;
            img = loaded;
          } catch (err) {
            console.warn("[templated-artwork] image load failed", path, "attempt", attempt, err);
          }
        }
        if (cancelled) return;
        if (img) {
          const ready = img;
          setPlacedImages((prev) => ({ ...prev, [phId]: ready }));
          setImageErrors((prev) => {
            if (!prev[phId]) return prev;
            const next = { ...prev };
            delete next[phId];
            return next;
          });
        } else {
          setImageErrors((prev) => ({ ...prev, [phId]: true }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, imageRetry]);

  /** Keep every image currently placed in this artwork out of the cache's
   *  eviction path — a long proofing session must not lose a picture. */
  useEffect(() => {
    const paths = Object.values(values)
      .filter((v): v is TemplatedImageValue => v?.kind === "image")
      .map((v) => v.storage_path)
      .filter(Boolean);
    pinBlobPaths(paths);
    return () => unpinBlobPaths(paths);
  }, [values]);

  const retryImage = useCallback((placeholderId: string) => {
    setImageErrors((prev) => {
      const next = { ...prev };
      delete next[placeholderId];
      return next;
    });
    setImageRetry((n) => n + 1);
  }, []);


  // ── Preview canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  /** Boxes shown for the page being viewed (global boxes + this page's own). */
  const pagePlaceholders = useMemo(
    () => placeholdersForPage(placeholders, pages[pageIndex]?.index ?? pageIndex),
    [placeholders, pages, pageIndex],
  );

  /** Every box that shares a value with this one (itself included). */
  const siblingsOf = useCallback(
    (p: { id: string; field_key?: string | null }) => {
      const key = (p.field_key ?? "").trim();
      if (!key) return placeholders.filter((d) => d.id === p.id);
      return placeholders.filter((d) => (d.field_key ?? "").trim() === key);
    },
    [placeholders],
  );

  /** Write a value to a box and to every box sharing its field name.
   *  `page` is set when the picture applies to one page only. */
  const applyValue = useCallback(
    (p: ArtworkPlaceholder, v: TemplatedPlaceholderValue | null, page?: number | null) => {
      const targets = siblingsOf(p);
      setValues((prev) => {
        const next = { ...prev };
        for (const t of targets) {
          const k = valueKey(t.id, page ?? null);
          if (v == null) delete next[k];
          else
            next[k] = capWatermark(t, {
              ...v,
              placeholder_id: t.id,
              ...(page == null ? {} : { page_index: page }),
            } as TemplatedPlaceholderValue);
        }
        return next;
      });
    },
    [siblingsOf],
  );

  /** Switch a box between "same picture everywhere" and "one per page". */
  const setPerPage = useCallback(
    (p: ArtworkPlaceholder, on: boolean) => {
      const ids = siblingsOf(p).map((t) => t.id);
      setPerPageIds((prev) =>
        on ? Array.from(new Set([...prev, ...ids])) : prev.filter((id) => !ids.includes(id)),
      );
      // Keep the first picture, drop the rest, so switching back and forth
      // never leaves stray artwork behind.
      setValues((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          const own = Object.entries(prev).filter(([k]) => keyBelongsTo(k, id));
          const keep = own.find(([, v]) => !!v)?.[1];
          for (const [k] of own) delete next[k];
          if (keep) {
            const k = valueKey(id, on ? 0 : null);
            next[k] = { ...keep, ...(on ? { page_index: 0 } : { page_index: null }) } as TemplatedPlaceholderValue;
          }
        }
        return next;
      });
    },
    [siblingsOf],
  );

  /** One rail entry per shared field name on this page. */
  const railPlaceholders = useMemo(() => {
    const seen = new Set<string>();
    return pagePlaceholders.filter((p) => {
      const key = (p.field_key ?? "").trim();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [pagePlaceholders]);

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
      trimHeightMm: template.trim_height_mm || page.heightMm,
      bleedLeftMm: page.bleedLeftMm,
      bleedTopMm: page.bleedTopMm,
      canvasWidthMm: page.canvasWidthMm,
      showTrimLine: true,

      placeholders,
      pageIndex: page.index,
      values,
      images: placedImages,
      showBoxes: true,
      activeId,
    });
  }, [pages, pageIndex, pageImages, placedImages, placeholders, values, template, activeId]);

  // ── Uploads
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Set while a multi-page PDF is being spread across the pages. */
  const [placing, setPlacing] = useState<{
    done: number;
    total: number;
    label: string;
    failed: number[];
  } | null>(null);
  const cancelPlacing = useRef(false);

  /** In-app replacement for the old browser confirm box. */
  const [spreadAsk, setSpreadAsk] = useState<{
    fileName: string;
    filePages: number;
    totalPages: number;
  } | null>(null);
  const spreadAnswer = useRef<((v: "spread" | "single" | null) => void) | null>(null);
  const askSpread = useCallback(
    (fileName: string, filePages: number, totalPages: number) =>
      new Promise<"spread" | "single" | null>((resolve) => {
        spreadAnswer.current = resolve;
        setSpreadAsk({ fileName, filePages, totalPages });
      }),
    [],
  );
  const answerSpread = useCallback((v: "spread" | "single" | null) => {
    setSpreadAsk(null);
    const fn = spreadAnswer.current;
    spreadAnswer.current = null;
    fn?.(v);
  }, []);

  const handlePickFile = useCallback(
    async (
      placeholderId: string,
      rawFile: File,
      source?: StockImageSource | null,
      page?: number | null,
    ) => {
      setBusyId(valueKey(placeholderId, page ?? null));
      try {
        const isPdf = rawFile.type === "application/pdf" || /\.pdf$/i.test(rawFile.name);
        const wasPdf = isPdf;
        const itemId = await ensureOrder();
        const ph = placeholders.find((p) => p.id === placeholderId);
        const totalPages = template?.page_count ?? pages.length ?? 1;

        // How many pages does the customer's file actually have?
        let filePages = 1;
        if (isPdf) {
          try {
            filePages = await pdfPageCount(rawFile);
          } catch (err) {
            console.warn("[templated-artwork] could not read PDF page count", err);
          }
        }

        const allowsPerPage = ph?.kind === "image" && !!(ph as any).allow_per_page_artwork;
        let targetPage = page ?? null;
        let spread = false;

        if (isPdf && filePages > 1 && allowsPerPage && totalPages > 1) {
          if (targetPage != null) {
            spread = true;
          } else {
            const answer = await askSpread(rawFile.name, filePages, totalPages);
            if (answer == null) return; // customer backed out
            if (answer === "spread") {
              spread = true;
              if (ph) setPerPage(ph, true);
              targetPage = 0;
            }
          }
        }

        const buildValue = (
          uploaded: { documentId?: string | null; storagePath: string; fileName: string; mimeType: string; width: number; height: number },
          pdfPage?: number,
          pdfPath?: string | null,
        ): TemplatedImageValue => ({
          placeholder_id: placeholderId,
          kind: "image",
          document_id: uploaded.documentId,
          storage_path: uploaded.storagePath,
          file_name: uploaded.fileName,
          mime_type: uploaded.mimeType,
          source_was_pdf: wasPdf,
          source_pdf_path: pdfPath ?? null,
          ...(pdfPage ? { source_pdf_page: pdfPage } : {}),
          source_width_px: uploaded.width,
          source_height_px: uploaded.height,
          fit: ph?.fit_mode ?? "fill",
          scale: 1,
          offset_x: 0,
          offset_y: 0,
          background_hex: ph?.background_hex ?? null,
          opacity: ph?.is_watermark ? Math.min(ph?.opacity ?? 0.1, 0.1) : (ph?.opacity ?? 1),
          source: source ?? null,
        });

        // A multi-page PDF dropped onto a per-page box fills one page each:
        // page 1 → first month, page 2 → second, and so on. Each page is
        // rendered, uploaded and placed before the next one starts, so a single
        // failure never discards the pages that already went through.
        if (spread) {
          const count = Math.min(filePages, totalPages);
          cancelPlacing.current = false;
          // Show the panel straight away — the customer must never sit in front
          // of a silent screen while the file is being read.
          setPlacing({ done: 0, total: count, label: "Reading your file…", failed: [] });

          // The original vector PDF is kept for the print composer, but it is a
          // big file: upload it alongside the page work instead of making the
          // customer wait for it before anything visible happens.
          const sourcePdfPath = `artwork-uploads/${itemId}/${placeholderId}-multi-source.pdf`;
          const sourceUpload = uploadToS3(sourcePdfPath, rawFile).then(
            () => sourcePdfPath,
            (err) => {
              console.warn("[templated-artwork] original PDF upload failed", err);
              return null;
            },
          );

          const failed: number[] = [];
          const baseName = rawFile.name.replace(/\.pdf$/i, "");

          /** Upload one page, retrying once, and never hanging forever. */
          const uploadPage = async (file: File) => {
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                const up = await Promise.race([
                  uploadPhoto(file, itemId),
                  new Promise<never>((_, rej) =>
                    setTimeout(() => rej(new Error("the upload timed out")), 120_000),
                  ),
                ]);
                if (up) return up;
                throw new Error("the upload did not complete");
              } catch (err) {
                if (attempt === 2) throw err;
                console.warn("[templated-artwork] retrying page upload", err);
              }
            }
            return null;
          };

          await rasterisePdfPages(rawFile, {
            targetLongPx: 1800,
            maxPages: count,
            onPage: async (rp) => {
              const i = rp.index;
              if (cancelPlacing.current) return;
              setPlacing({
                done: i,
                total: count,
                label: `Adding page ${i + 1} of ${count}…`,
                failed: [...failed],
              });
              try {
                const blob = await (await fetch(rp.dataUrl)).blob();
                const pageFile = new File([blob], `${baseName}-p${i + 1}.png`, {
                  type: "image/png",
                });
                const up = await uploadPage(pageFile);
                if (!up) throw new Error("the upload did not complete");
                const v = buildValue(up, i + 1, sourcePdfPath);
                if (ph) applyValue(ph, v, i);
                else setValues((prev) => ({ ...prev, [valueKey(placeholderId, i)]: v }));
              } catch (err: any) {
                console.error(`[templated-artwork] page ${i + 1} of ${count} failed`, err);
                failed.push(i + 1);
                toast.error(`Page ${i + 1} could not be added`, {
                  description: err?.message ?? undefined,
                });
              }
              setPlacing({
                done: i + 1,
                total: count,
                label: `Adding page ${i + 2 <= count ? i + 2 : count} of ${count}…`,
                failed: [...failed],
              });
            },
          });

          setPlacing((p) => (p ? { ...p, label: "Saving your artwork…" } : p));
          await sourceUpload;
          // Let the state updates settle, then write immediately rather than
          // relying on the delayed background save.
          await new Promise((r) => setTimeout(r, 120));
          await persistNow();

          const placed = count - failed.length;
          if (placed > 0) toast.success(`Placed ${placed} of ${count} pages of your file`);
          if (failed.length)
            toast.error(
              `Could not place page${failed.length > 1 ? "s" : ""} ${failed.join(", ")} — please add ${
                failed.length > 1 ? "them" : "it"
              } again.`,
            );
          return;
        }

        // Keep the original vector PDF too — the print composer places it as a
        // form XObject (with a transparency group when opacity < 1) instead of
        // using the rasterised proof image.
        let sourcePdfPath: string | null = null;
        if (isPdf) {
          try {
            sourcePdfPath = `artwork-uploads/${itemId}/${placeholderId}-${targetPage ?? "all"}-source.pdf`;
            await uploadToS3(sourcePdfPath, rawFile);
          } catch (err) {
            console.warn("[templated-artwork] original PDF upload failed", err);
            sourcePdfPath = null;
          }
        }

        // PNG, not JPEG: keeps alpha so white-only vector artwork stays
        // transparent instead of arriving as a solid white block.
        const file = isPdf ? await rasterisePdfPageOneToPng(rawFile) : rawFile;
        const uploaded = await uploadPhoto(file, itemId);
        if (!uploaded) return;
        const next = buildValue(uploaded, isPdf ? 1 : undefined, sourcePdfPath);
        if (ph) applyValue(ph, next, targetPage ?? null);
        else setValues((prev) => ({ ...prev, [valueKey(placeholderId, targetPage ?? null)]: next }));
      } catch (err: any) {
        console.error("[templated-artwork] upload failed", err);
        toast.error(err?.message ?? "Upload failed");
      } finally {
        setPlacing(null);
        setBusyId(null);
      }
    },
    [
      ensureOrder,
      uploadPhoto,
      placeholders,
      applyValue,
      setPerPage,
      askSpread,
      persistNow,
      template?.page_count,
      pages.length,
    ],
  );



  // ── Stock photo library (Pexels)
  const { settings: photoLibrary } = usePhotoLibraryForProduct(family as any);
  const [libraryFor, setLibraryFor] = useState<string | null>(null);
  /** `libraryFor` is a value key — it may carry a page suffix. */
  const libraryTarget = useMemo(() => {
    if (!libraryFor) return null;
    const [id, pg] = libraryFor.split("@");
    return { id, page: pg == null ? null : Number(pg) };
  }, [libraryFor]);
  const libraryPlaceholder = useMemo(
    () => placeholders.find((p) => p.id === libraryTarget?.id) ?? null,
    [placeholders, libraryTarget],
  );
  const usedStockIds = useMemo(
    () =>
      Object.values(values)
        .filter((v): v is TemplatedImageValue => v?.kind === "image" && !!v.source)
        .map((v) => String(v.source!.photo_id)),
    [values],
  );

  const handlePickStock = useCallback(
    async (photo: StockPhoto) => {
      if (!libraryTarget) return;
      const placeholderId = libraryTarget.id;
      setBusyId(libraryFor);
      try {
        const file = await fetchStockPhotoFile(photo);
        await handlePickFile(
          placeholderId,
          file,
          {
            provider: "pexels",
            photo_id: String(photo.id),
            photographer: photo.photographer,
            photographer_url: photo.photographer_url,
            photo_url: photo.page_url,
          },
          libraryTarget.page,
        );
        // Licence record — best effort, never blocks the customer.
        try {
          await supabase.from("stock_image_uses").insert({
            tenant_id: tenantId ?? null,
            branch_id: activeBranch?.id ?? null,
            placeholder_id: placeholderId,
            provider: "pexels",
            photo_id: String(photo.id),
            photographer: photo.photographer,
            photographer_url: photo.photographer_url,
            photo_url: photo.page_url,
          } as any);
        } catch (err) {
          console.warn("[templated-artwork] stock use log failed", err);
        }
        setLibraryFor(null);
      } catch (err: any) {
        console.error("[templated-artwork] stock photo failed", err);
        toast.error(err?.message ?? "Could not add that photo");
      } finally {
        setBusyId(null);
      }
    },
    [libraryFor, libraryTarget, handlePickFile, tenantId, activeBranch?.id],
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
  const totalPageCount = template?.page_count ?? pages.length ?? 1;
  const missingRequired = placeholders.filter((p) => {
    if (!p.is_required) return false;
    // Colour boxes always carry a default ink build, so they can't be "missing".
    if (p.kind === "colour") return false;
    // Per-page pictures must be filled in for every page.
    if (p.kind === "image" && perPageIds.includes(p.id)) {
      for (let i = 0; i < totalPageCount; i++) {
        const pv = values[valueKey(p.id, i)] as TemplatedImageValue | undefined;
        if (!pv?.storage_path) return true;
      }
      return false;
    }
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
    const brokenBoxes = placeholders.filter((p) => imageErrors[p.id]);
    if (brokenBoxes.length > 0) {
      toast.error(
        `These pictures could not be loaded — please replace them: ${brokenBoxes
          .map((p) => p.name)
          .join(", ")}`,
      );
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
        <div
          className={`min-h-0 space-y-3 overflow-y-auto border-b bg-background p-3 lg:border-b-0 lg:border-r ${
            placing ? "pointer-events-none opacity-60" : ""
          }`}
        >
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
          ) : pagePlaceholders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to fill in on this page — use the pager to move to another page.
            </p>
          ) : (
            railPlaceholders.map((p, i) => {
              const curPage = pages[pageIndex]?.index ?? pageIndex;
              const perPage = p.kind === "image" && perPageIds.includes(p.id);
              const slot = perPage ? curPage : null;
              const key = valueKey(p.id, slot);
              const filledPages = perPage
                ? Array.from({ length: totalPageCount }, (_, n) =>
                    values[valueKey(p.id, n)] ? 1 : 0,
                  ).reduce((a: number, b: number) => a + b, 0)
                : 0;
              return (
                <div key={p.id} className="space-y-1">
                  <PlaceholderPanel
                    placeholder={p}
                    value={values[key]}
                    busy={busyId === key}
                    step={i + 1}
                    active={activeId === p.id}
                    onFocus={() => setActiveId(p.id)}
                    onPickFile={(file) => handlePickFile(p.id, file, null, slot)}
                    onBrowseLibrary={
                      photoLibrary.enabled && p.kind === "image"
                        ? () => setLibraryFor(key)
                        : undefined
                    }
                    loadError={!!imageErrors[key]}
                    onRetryImage={() => retryImage(key)}
                    onChange={(v) => applyValue(p, v, slot)}
                    onClear={() => applyValue(p, null, slot)}
                    nameOverride={perPage ? `${p.name} — page ${curPage + 1}` : undefined}
                    headerExtra={
                      p.kind === "image" && p.allow_per_page_artwork ? (
                        <div className="flex items-start justify-between gap-3 rounded-md bg-muted/50 p-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium">
                              Same picture on every page
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {perPage
                                ? `Switched off — add a picture for each of the ${totalPageCount} pages (${filledPages} done). A multi-page PDF fills them all at once.`
                                : "One picture repeats throughout. Switch off to use a different picture on each page."}
                            </p>
                          </div>
                          <Switch
                            checked={!perPage}
                            onCheckedChange={(on) => setPerPage(p, !on)}
                            aria-label="Same picture on every page"
                          />
                        </div>
                      ) : undefined
                    }
                  />
                  {!perPage && siblingsOf(p).length > 1 && (
                    <p className="px-1 text-[11px] text-muted-foreground">
                      Used in {siblingsOf(p).length} places across the calendar — upload once.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Stage */}
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="px-4 pt-3 text-xs text-muted-foreground">{sizeCaption}</div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
            {pagesLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <canvas
                ref={canvasRef}
                className="bg-white shadow-md"
                style={{ maxHeight: "100%", maxWidth: "100%", width: "auto", height: "auto" }}
              />
            )}
            {placing && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm font-medium">{placing.label}</p>
                <p className="max-w-xs text-center text-xs text-muted-foreground">
                  Please stay on this screen — your pages are being added one by one.
                </p>
                <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round((placing.done / Math.max(1, placing.total)) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {placing.done} of {placing.total} added
                  {placing.failed.length > 0 && ` — page ${placing.failed.join(", ")} failed`}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    cancelPlacing.current = true;
                    toast.message("Stopping after this page — anything already added is kept.");
                  }}
                >
                  Stop
                </Button>
              </div>
            )}

          </div>

          {/* Filmstrip */}
          <div className="flex items-center gap-2 border-t bg-background px-3 py-2">
            <Button
              size="icon"
              variant="ghost"
              disabled={pageIndex === 0 || !!placing}
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
              {pages.map((p) => (
                <button
                  key={p.index}
                  disabled={!!placing}
                  onClick={() => setPageIndex(p.index)}
                  className={`shrink-0 rounded border-2 p-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
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
              disabled={pageIndex >= pages.length - 1 || !!placing}
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
            <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <Label className="text-sm font-semibold text-foreground">Finishing option</Label>
              <Select value={pricingOption ?? ""} onValueChange={(v) => setPricingOption(v)}>
                <SelectTrigger className="h-auto min-h-10 border-2 border-primary/60 bg-background py-2 font-medium [&>span]:line-clamp-none [&>span]:whitespace-normal">
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
              {pricingOptions.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  {pricingOptions.length} options available
                </p>
              )}
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
                      ? ""
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

      <StockImagePicker
        open={!!libraryFor}
        onOpenChange={(o) => !o && setLibraryFor(null)}
        boxWidthMm={libraryPlaceholder?.width_mm ?? 0}
        boxHeightMm={libraryPlaceholder?.height_mm ?? 0}
        usedIds={usedStockIds}
        busy={!!busyId}
        onPick={handlePickStock}
      />

      <AlertDialog open={!!spreadAsk} onOpenChange={(o) => !o && answerSpread(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Your file has {spreadAsk?.filePages} pages</AlertDialogTitle>
            <AlertDialogDescription>
              “{spreadAsk?.fileName}” contains {spreadAsk?.filePages} pages and this product has{" "}
              {spreadAsk?.totalPages}. Would you like a different page on each one, or the first page
              repeated throughout?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => answerSpread(null)}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => answerSpread("single")}>
              Use page 1 everywhere
            </Button>
            <AlertDialogAction onClick={() => answerSpread("spread")}>
              A different page on each
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>

  );

});

export default TemplatedArtworkBuilder;
