/**
 * Upload-your-own-artwork route for editable-artwork products (e.g. deskpads).
 *
 * The customer supplies a finished, print-ready PDF instead of designing in the
 * template editor. We rasterise the pages purely as a proof, hard-block files
 * that don't match the published layout's page count / trim size, and require
 * an explicit approval tick before Add to cart.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  ShoppingCart,
  Trash2,
  Upload,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useBranch } from "@/contexts/BranchContext";
import { useCreateOrder, useOrderData } from "@/hooks/useOrderBuilder";
import { useAddItemToCart } from "@/hooks/useCart";
import { invalidateUserOrderCaches } from "@/lib/queryInvalidation";
import { downloadFromS3, uploadToS3 } from "@/lib/s3Storage";
import { rasterisePdfPages, loadImage, type RasterisedPage } from "@/lib/artworkTemplates/pdfPages";
import ArtworkProofModal from "@/components/artwork/ArtworkProofModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { usePriceDisplay } from "@/lib/tax/usePriceDisplay";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { useCurrencyConverter } from "@/hooks/useCurrencyProfiles";
import { formatPrice } from "@/lib/formatCurrency";
import type { ArtworkTemplate } from "@/lib/artworkTemplates/types";

/** How far the uploaded trim may differ from the expected trim, in mm. */
const TRIM_TOLERANCE_MM = 2;

export interface UploadedArtworkSpec {
  storage_path: string;
  file_name: string;
  page_count: number;
  trim_width_mm: number;
  trim_height_mm: number;
  approved_at: string | null;
}

interface Props {
  family: { id: string; name?: string | null } | null;
  /** Published layout used only as the geometry yardstick for the checks. */
  reference: ArtworkTemplate | null;
  orderIdParam?: string;
  /** Switch back to the design-online editor. */
  onSwitchToDesign?: () => void;
}

const UploadedArtworkBuilder = forwardRef<HTMLDivElement, Props>(function UploadedArtworkBuilder(
  { family, reference, orderIdParam, onSwitchToDesign },
  ref,
) {
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeBranch } = useBranch();

  const createOrder = useCreateOrder();
  const addItemToCart = useAddItemToCart();

  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const effectiveOrderId = orderIdParam ?? createdOrderId ?? undefined;
  const { order, orderItem } = useOrderData(effectiveOrderId);
  const familyId = family?.id ?? null;

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

  // ── State
  const [spec, setSpec] = useState<UploadedArtworkSpec | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [approved, setApproved] = useState(false);
  const [pages, setPages] = useState<RasterisedPage[]>([]);
  const [pageImages, setPageImages] = useState<Record<number, HTMLImageElement>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const hydrated = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const expectedPages = reference?.page_count ?? null;
  const expectedW = reference?.trim_width_mm ?? null;
  const expectedH = reference?.trim_height_mm ?? null;

  // ── Hydrate from a saved order item
  useEffect(() => {
    if (hydrated.current) return;
    const s = (orderItem?.spec as any)?.uploaded_artwork as UploadedArtworkSpec | undefined;
    if (!s) return;
    hydrated.current = true;
    setSpec(s);
    setApproved(!!s.approved_at);
    const q = (orderItem?.spec as any)?.quantity;
    if (typeof q === "number" && q > 0) setQuantity(q);
  }, [orderItem?.spec]);

  // Re-render a previously uploaded file (page proofs are not persisted).
  useEffect(() => {
    let cancelled = false;
    if (!spec?.storage_path || pages.length > 0) return;
    (async () => {
      try {
        setBusy(true);
        const blob = await downloadFromS3(spec.storage_path);
        const rendered = await rasterisePdfPages(blob, {
          targetLongPx: 1400,
          knockoutWhite: false,
        });
        if (!cancelled) setPages(rendered);
      } catch (err) {
        console.error("[uploaded-artwork] re-render failed", err);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.storage_path]);

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

  // ── Persist
  const persistTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!orderItem?.id || !spec) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      const base = (orderItem.spec as any) || {};
      await supabase
        .from("order_items")
        .update({
          spec: {
            ...base,
            page_count: spec.page_count,
            quantity,
            is_color: true,
            is_duplex: false,
            selected_options: base.selected_options || {},
            uploaded_artwork: { ...spec, approved_at: approved ? new Date().toISOString() : null },
          },
          quantity,
        })
        .eq("id", orderItem.id);
      setSavedAt(Date.now());
    }, 600);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [spec, quantity, approved, orderItem?.id, orderItem?.spec]);

  // ── Upload + hard-block checks
  const handleFile = useCallback(
    async (file: File) => {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (!isPdf) {
        setRejection("Please upload a print-ready PDF. Images and Office files aren't accepted here.");
        return;
      }
      setBusy(true);
      setRejection(null);
      try {
        const rendered = await rasterisePdfPages(file, {
          targetLongPx: 1400,
          knockoutWhite: false,
        });
        if (rendered.length === 0) {
          setRejection("We couldn't read any pages from that PDF.");
          return;
        }
        const first = rendered[0];

        if (expectedPages && rendered.length !== expectedPages) {
          setRejection(
            `This product needs exactly ${expectedPages} pages — your file has ${rendered.length}. Please upload a ${expectedPages}-page PDF.`,
          );
          return;
        }

        if (expectedW && expectedH) {
          const fitsUpright =
            Math.abs(first.widthMm - expectedW) <= TRIM_TOLERANCE_MM &&
            Math.abs(first.heightMm - expectedH) <= TRIM_TOLERANCE_MM;
          const fitsRotated =
            Math.abs(first.widthMm - expectedH) <= TRIM_TOLERANCE_MM &&
            Math.abs(first.heightMm - expectedW) <= TRIM_TOLERANCE_MM;
          if (!fitsUpright && !fitsRotated) {
            setRejection(
              `The finished (trim) size should be ${Math.round(expectedW)} × ${Math.round(
                expectedH,
              )} mm — your file measures ${Math.round(first.widthMm)} × ${Math.round(
                first.heightMm,
              )} mm. Please re-export at the correct size.`,
            );
            return;
          }
        }

        const itemId = await ensureOrder();
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `artwork-uploads/${itemId}/print-ready-${Date.now()}-${safeName}`;
        await uploadToS3(path, file);

        setPages(rendered);
        setPageIndex(0);
        setApproved(false);
        setSpec({
          storage_path: path,
          file_name: file.name,
          page_count: rendered.length,
          trim_width_mm: first.widthMm,
          trim_height_mm: first.heightMm,
          approved_at: null,
        });
      } catch (err: any) {
        console.error("[uploaded-artwork] upload failed", err);
        setRejection(err?.message ?? "We couldn't process that file.");
      } finally {
        setBusy(false);
      }
    },
    [ensureOrder, expectedPages, expectedW, expectedH],
  );

  const clearFile = () => {
    setSpec(null);
    setPages([]);
    setPageImages({});
    setApproved(false);
    setRejection(null);
  };

  // ── Pricing (matches the design-online route)
  const priceDisplay = usePriceDisplay();
  const { region, baseCurrency, displayDefaultCurrency } = useRegionalPricing();
  const activeCurrency = region?.currency_code ?? displayDefaultCurrency ?? "ZAR";
  const { convert } = useCurrencyConverter(activeCurrency, baseCurrency);
  const baseUnit = Number((family as any)?.printing_rules?.templated_unit_price ?? 0);
  const unitPrice = convert(baseUnit);
  const netTotal = unitPrice * Math.max(quantity, 1);

  const pageLabels = useMemo(() => pages.map((p) => `Page ${p.index + 1}`), [pages]);

  const [submitting, setSubmitting] = useState(false);
  const handleAddToCart = async () => {
    if (!order || !orderItem || !spec || submitting) return;
    if (!approved) {
      toast.error("Please confirm you've reviewed your artwork.");
      return;
    }
    setSubmitting(true);
    try {
      const replacesCartItemId = (order.metadata as any)?.replaces_cart_item_id;
      await addItemToCart.mutateAsync({
        orderItemId: orderItem.id,
        draftOrderId: order.id,
        title: `${family?.name ?? "Custom artwork"} — supplied artwork`,
        unitPrice,
        quantity: Math.max(quantity, 1),
        totalPrice: netTotal,
        spec: {
          page_count: spec.page_count,
          quantity: Math.max(quantity, 1),
          is_color: true,
          is_duplex: false,
          selected_options: {},
          uploaded_artwork: { ...spec, approved_at: new Date().toISOString() },
        } as any,
        replacesCartItemId: replacesCartItemId || undefined,
      });
      invalidateUserOrderCaches(qc);
      toast.success("Added to cart");
      navigate(tenantPath("cart"));
    } catch (e: any) {
      console.error("[uploaded-artwork] add to cart failed", e);
      toast.error(e?.message ?? "Failed to add to cart");
    } finally {
      setSubmitting(false);
    }
  };

  const canAdd = !!spec && approved && !submitting && !busy;

  return (
    <div ref={ref} className="flex min-h-0 w-full flex-1 flex-col bg-muted/20">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <h1 className="text-base font-semibold">
          {family?.name ?? "Custom artwork"} — upload artwork
        </h1>
        {savedAt && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-primary" /> Saved
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onSwitchToDesign && (
            <Button variant="outline" size="sm" onClick={onSwitchToDesign}>
              Design online instead
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProofOpen(true)}
            disabled={pages.length === 0}
          >
            <Eye className="mr-1.5 h-4 w-4" /> Review all pages
          </Button>
          <Button size="sm" onClick={handleAddToCart} disabled={!canAdd}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="mr-1.5 h-4 w-4" />
            )}
            Add to cart
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
        {/* Left rail — file */}
        <div className="min-h-0 space-y-3 overflow-y-auto border-b bg-background p-3 lg:border-b-0 lg:border-r">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Artwork requirements</p>
            <ul className="mt-1.5 space-y-1">
              <li>Print-ready PDF only</li>
              {expectedPages && <li>Exactly {expectedPages} pages</li>}
              {expectedW && expectedH && (
                <li>
                  Finished size {Math.round(expectedW)} × {Math.round(expectedH)} mm
                </li>
              )}
              {!!reference?.bleed_mm && <li>{reference.bleed_mm} mm bleed with crop marks</li>}
            </ul>
          </div>

          {spec ? (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{spec.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {spec.page_count} pages · {Math.round(spec.trim_width_mm)} ×{" "}
                    {Math.round(spec.trim_height_mm)} mm
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={clearFile}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Remove file
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => !busy && fileInputRef.current?.click()}
              className="flex min-h-[150px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 p-6 transition hover:border-primary/60 hover:bg-primary/5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
            >
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <Upload className="h-6 w-6 text-primary" />
              )}
              <span className="text-sm font-medium">
                {busy ? "Checking your file…" : "Drop your print-ready PDF"}
              </span>
              <span className="text-xs text-muted-foreground">or click to browse</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleFile(f);
            }}
          />

          {rejection && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{rejection}</span>
            </div>
          )}
        </div>

        {/* Stage */}
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="px-4 pt-3 text-xs text-muted-foreground">
            {spec
              ? `${family?.name ?? "Artwork"} (${Math.round(spec.trim_width_mm)} × ${Math.round(
                  spec.trim_height_mm,
                )} mm)`
              : family?.name ?? ""}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
            {busy && pages.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : pages[pageIndex] ? (
              <img
                src={pages[pageIndex].dataUrl}
                alt={`Page ${pageIndex + 1}`}
                className="max-h-full max-w-full bg-white object-contain shadow-md"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Upload your PDF to see a proof of every page.
              </p>
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

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setProofOpen(true)}
            disabled={pages.length === 0}
          >
            <Eye className="mr-1.5 h-4 w-4" /> Review all pages
          </Button>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs">
            <Checkbox
              checked={approved}
              disabled={!spec}
              onCheckedChange={(v) => setApproved(v === true)}
              className="mt-0.5"
            />
            <span>I have reviewed my artwork and approve it for print.</span>
          </label>

          <Button className="w-full" onClick={handleAddToCart} disabled={!canAdd}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="mr-1.5 h-4 w-4" />
            )}
            Add to cart
          </Button>

          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            We print your supplied file exactly as uploaded — no layout changes are made.
          </div>
        </div>
      </div>

      <ArtworkProofModal
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        pages={pages}
        pageImages={pageImages}
        placedImages={{}}
        placeholders={[]}
        values={{}}
        trimWidthMm={spec?.trim_width_mm ?? pages[0]?.widthMm ?? 0}
        initialPage={pageIndex}
        pageLabels={pageLabels}
        title={`${family?.name ?? "Artwork"} proof`}
      />
    </div>
  );
});

export default UploadedArtworkBuilder;
