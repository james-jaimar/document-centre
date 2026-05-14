import { useBranch } from "@/contexts/BranchContext";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateOrder, useOrderData } from "@/hooks/useOrderBuilder";
import { useAddItemToCart } from "@/hooks/useCart";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";

import { useTenantContext } from "@/hooks/useTenantContext";
import { resolveUrls } from "@/lib/thumbnailUtils";
import { invalidateUserOrderCaches } from "@/lib/queryInvalidation";
import {
  PHOTO_FINISH_OPTIONS,
  PHOTO_BORDER_OPTIONS,
  getPhotoPrintSize,
  derivePhotoPrintSizesFromRateCard,
} from "@/lib/photoPrints/sizes";
import { resolvePhotoPrintPrice } from "@/lib/photoPrints/pricing";
import { useRateCardPhotoPrints } from "@/hooks/useRateCard";
import type { PhotoPrintEntry, PhotoPrintsSpec } from "@/lib/photoPrints/types";
import PhotoUploader from "@/components/photo/PhotoUploader";
import QRUploadModal from "@/components/order/QRUploadModal";
import PhotoTile from "@/components/photo/PhotoTile";
import PhotoEditorModal from "@/components/photo/PhotoEditorModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { ArrowLeft, ImagePlus, Loader2, ShoppingCart, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { formatPrice } from "@/lib/formatCurrency";

const PHOTO_FAMILY_SLUG = "photo-prints";

interface ProductFamilyRow {
  id: string;
  slug: string;
  name: string;
}

export default function PhotoPrintsBuilder() {
  const { id: orderIdParam } = useParams<{ id?: string }>();
  const { slug: tenantSlug, tenantPath } = useTenantSlug();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { tenantId } = useTenantContext();
  const { activeBranch } = useBranch();

  const createOrder = useCreateOrder();
  const addItemToCart = useAddItemToCart();
  const { region } = useRegionalPricing();
  const activeCurrency = region?.currency_code ?? "ZAR";

  const { data: family } = useQuery<ProductFamilyRow | null>({
    queryKey: ["product_family_by_slug", PHOTO_FAMILY_SLUG],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_families")
        .select("id, slug, name")
        .eq("slug", PHOTO_FAMILY_SLUG)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const effectiveOrderId = orderIdParam ?? createdOrderId ?? undefined;

  const { order, orderItem, documents, loading } = useOrderData(effectiveOrderId);

  const ensureOrder = useCallback(async (): Promise<string> => {
    if (orderItem?.id) return orderItem.id;
    if (!family?.id) throw new Error("Photo Prints product is not configured.");

   const newOrder = await createOrder.mutateAsync({
     productFamilyId: family.id,
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
  }, [orderItem?.id, family?.id, createOrder]);

  // QR mobile upload state
  const [qrOpen, setQrOpen] = useState(false);
  const [qrOrderItemId, setQrOrderItemId] = useState<string | undefined>(undefined);

  const handlePhoneUpload = useCallback(async () => {
    try {
      const itemId = await ensureOrder();
      setQrOrderItemId(itemId);
      setQrOpen(true);
    } catch (err) {
      console.error("[PhotoPrintsBuilder] Failed to create order for phone upload:", err);
      toast.error("Could not start phone upload. Please try again.");
    }
  }, [ensureOrder]);

  const { uploads, uploadPhotos, clearUploads } = usePhotoUpload(orderItem?.id);

  const initialSpec: PhotoPrintsSpec = useMemo(
    () => ({
      print_size_slug: DEFAULT_PHOTO_PRINT_SIZE_SLUG,
      finish_slug: PHOTO_FINISH_OPTIONS.find((o) => o.is_default)!.slug,
      border_slug: PHOTO_BORDER_OPTIONS.find((o) => o.is_default)!.slug,
      photos: [],
    }),
    [],
  );
  const [photoSpec, setPhotoSpec] = useState<PhotoPrintsSpec>(initialSpec);

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    const spec = orderItem?.spec as any;
    if (spec?.photo_prints?.photos) {
      setPhotoSpec({
        print_size_slug: spec.photo_prints.print_size_slug || DEFAULT_PHOTO_PRINT_SIZE_SLUG,
        finish_slug: spec.photo_prints.finish_slug || initialSpec.finish_slug,
        border_slug: spec.photo_prints.border_slug || initialSpec.border_slug,
        photos: spec.photo_prints.photos as PhotoPrintEntry[],
      });
      hydratedRef.current = true;
    }
  }, [orderItem?.spec, initialSpec.finish_slug, initialSpec.border_slug]);

  const persistTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!orderItem?.id) return;
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(async () => {
      const totalQty = photoSpec.photos.reduce((s, p) => s + p.quantity, 0);
      const baseSpec = (orderItem.spec as any) || {};
      const nextSpec = {
        ...baseSpec,
        page_count: photoSpec.photos.length,
        quantity: Math.max(totalQty, 1),
        is_color: true,
        is_duplex: false,
        selected_options: {
          ...(baseSpec.selected_options || {}),
          "Print Size": photoSpec.print_size_slug,
          "Finish": photoSpec.finish_slug,
          "Border": photoSpec.border_slug,
        },
        photo_prints: photoSpec,
      };
      await supabase
        .from("order_items")
        .update({ spec: nextSpec, quantity: Math.max(totalQty, 1) })
        .eq("id", orderItem.id);
    }, 600);
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [photoSpec, orderItem?.id, orderItem?.spec]);

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = photoSpec.photos
      .map((p) => p.original_storage_path)
      .filter((p) => p && !signedUrls[p]);
    if (paths.length === 0) return;
    let cancelled = false;
    resolveUrls(paths).then((urls) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      paths.forEach((p, i) => {
        if (urls[i]) next[p] = urls[i];
      });
      setSignedUrls((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [photoSpec.photos, signedUrls]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const targetItemId = await ensureOrder();
      const uploaded = await uploadPhotos(files, targetItemId);
      if (uploaded.length === 0) return;

      const currentSize = photoSpec.print_size_slug;

      const newEntries: PhotoPrintEntry[] = uploaded.map((u) => ({
        id: crypto.randomUUID(),
        document_id: u.documentId,
        file_name: u.fileName,
        original_storage_path: u.storagePath,
        source_width_px: u.width,
        source_height_px: u.height,
        mime_type: u.mimeType,
        print_size_slug: currentSize,
        crop: { x: 0, y: 0 },
        zoom: 1,
        rotation: 0,
        fit_mode: "fill",
        croppedAreaPixels: null,
        quantity: 1,
      }));

      setPhotoSpec((prev) => ({ ...prev, photos: [...prev.photos, ...newEntries] }));
      toast.success(`Added ${uploaded.length} photo${uploaded.length === 1 ? "" : "s"}`);
      clearUploads();
    },
    [ensureOrder, uploadPhotos, photoSpec.print_size_slug, clearUploads],
  );

  const updatePhoto = (id: string, patch: Partial<PhotoPrintEntry>) => {
    setPhotoSpec((prev) => ({
      ...prev,
      photos: prev.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  const removePhoto = async (id: string) => {
    const photo = photoSpec.photos.find((p) => p.id === id);
    setPhotoSpec((prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== id) }));
    if (photo) {
      try {
        await supabase.from("documents").delete().eq("id", photo.document_id);
        const { deleteFromS3 } = await import("@/lib/s3Storage");
        await deleteFromS3([photo.original_storage_path]);
      } catch (e) {
        console.warn("[photo] remove cleanup failed", e);
      }
    }
  };

  const duplicatePhoto = (id: string) => {
    setPhotoSpec((prev) => {
      const idx = prev.photos.findIndex((p) => p.id === id);
      if (idx === -1) return prev;
      const next = { ...prev.photos[idx], id: crypto.randomUUID() };
      const photos = [...prev.photos];
      photos.splice(idx + 1, 0, next);
      return { ...prev, photos };
    });
  };

  const handlePrintSizeChange = (slug: string) => {
    setPhotoSpec((prev) => ({
      ...prev,
      print_size_slug: slug,
      photos: prev.photos.map((p) => ({
        ...p,
        print_size_slug: slug,
        crop: { x: 0, y: 0 },
        zoom: 1,
        croppedAreaPixels: null,
      })),
    }));
  };

  const [editorPhotoId, setEditorPhotoId] = useState<string | null>(null);
  const editorPhoto = photoSpec.photos.find((p) => p.id === editorPhotoId) ?? null;

  const { data: photoRateCard = [] } = useRateCardPhotoPrints({
    scope: "tenant",
    tenantId: tenantId ?? undefined,
  });

  const totals = useMemo(() => {
    const size = getPhotoPrintSize(photoSpec.print_size_slug);
    const totalPhotos = photoSpec.photos.length;
    const totalPrints = photoSpec.photos.reduce((s, p) => s + p.quantity, 0);
    const border = PHOTO_BORDER_OPTIONS.find((o) => o.slug === photoSpec.border_slug);
    const unitPrice = resolvePhotoPrintPrice(photoRateCard, {
      size_slug: photoSpec.print_size_slug,
      finish: photoSpec.finish_slug,
      border_mm: border?.border_mm ?? 0,
    });
    const totalPrice = totalPrints * unitPrice;
    return { size, totalPhotos, totalPrints, totalPrice, unitPrice };
  }, [photoSpec, photoRateCard]);

  const [showCartDialog, setShowCartDialog] = useState(false);
  const [cartReference, setCartReference] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleAddToCartClick = () => {
    if (photoSpec.photos.length === 0) {
      toast.error("Add at least one photo before checking out.");
      return;
    }
    setPhotoSpec((prev) => ({
      ...prev,
      photos: prev.photos.map((p) =>
        p.croppedAreaPixels ? p : applyDefaultCrop(p),
      ),
    }));
    setCartReference(`Photo Prints (${photoSpec.photos.length})`);
    setShowCartDialog(true);
  };

  const handleConfirmAddToCart = async () => {
    if (!order || !orderItem || isSubmitting) return;
    const ref = cartReference.trim() || `Photo Prints (${photoSpec.photos.length})`;
    setIsSubmitting(true);
    setShowCartDialog(false);

    try {
      // Apply default crops where missing so the server-side render has a box.
      const photosWithCrops = photoSpec.photos.map((p) =>
        p.croppedAreaPixels ? p : applyDefaultCrop(p),
      );

      const replacesCartItemId = (order.metadata as any)?.replaces_cart_item_id;
      const totalQty = photosWithCrops.reduce((s, p) => s + p.quantity, 0);

      const finalSpec: PhotoPrintsSpec = {
        ...photoSpec,
        photos: photosWithCrops,
      };

      // 1. Persist the spec and add to cart immediately. The customer goes
      //    straight to the cart — no "preparing" modal.
      await addItemToCart.mutateAsync({
        orderItemId: orderItem.id,
        draftOrderId: order.id,
        title: ref,
        unitPrice: totals.unitPrice,
        quantity: totalQty,
        totalPrice: totalQty * totals.unitPrice,
        spec: {
          page_count: photosWithCrops.length,
          quantity: totalQty,
          is_color: true,
          is_duplex: false,
          selected_options: {
            "Print Size": photoSpec.print_size_slug,
            "Finish": photoSpec.finish_slug,
            "Border": photoSpec.border_slug,
          },
          photo_prints: finalSpec,
        } as any,
        replacesCartItemId: replacesCartItemId || undefined,
        currencyCode: activeCurrency,
      });

      invalidateUserOrderCaches(qc);
      toast.success("Added to cart!");
      navigate(tenantPath("cart"));
    } catch (err: any) {
      console.error("[photo] add to cart failed", err);
      toast.error("Failed to add to cart", { description: err?.message });
    } finally {
      setIsSubmitting(false);
    }
  };



  if (!family && !loading) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Photo Prints product hasn't been configured for this tenant yet.
        </p>
        <Button variant="outline" onClick={() => navigate(tenantPath("orders/new"))}>
          Back to products
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-32 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(tenantPath("orders/new"))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Photo Prints</h1>
            <p className="text-sm text-muted-foreground">
              Upload your photos, choose a print size, and we'll do the rest.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Print Size</Label>
          <Select value={photoSpec.print_size_slug} onValueChange={handlePrintSizeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHOTO_PRINT_SIZES.map((s) => {
                const border = PHOTO_BORDER_OPTIONS.find((o) => o.slug === photoSpec.border_slug);
                const price = resolvePhotoPrintPrice(photoRateCard, {
                  size_slug: s.slug,
                  finish: photoSpec.finish_slug,
                  border_mm: border?.border_mm ?? 0,
                });
                return (
                  <SelectItem key={s.slug} value={s.slug}>
                    {s.label} — {formatPrice(price, activeCurrency)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Finish</Label>
          <Select
            value={photoSpec.finish_slug}
            onValueChange={(v) => setPhotoSpec((p) => ({ ...p, finish_slug: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHOTO_FINISH_OPTIONS.map((o) => (
                <SelectItem key={o.slug} value={o.slug}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Border</Label>
          <Select
            value={photoSpec.border_slug}
            onValueChange={(v) => setPhotoSpec((p) => ({ ...p, border_slug: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHOTO_BORDER_OPTIONS.map((o) => (
                <SelectItem key={o.slug} value={o.slug}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {photoSpec.photos.length === 0 ? (
        <PhotoUploader
          onFiles={handleFiles}
          disabled={createOrder.isPending}
          orderItemId={orderItem?.id}
          onPhoneUpload={handlePhoneUpload}
        />
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const files = Array.from(e.dataTransfer.files).filter(
              (f) =>
                /^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type) ||
                /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name),
            );
            if (files.length > 0) handleFiles(files);
          }}
          className={`flex items-center justify-between gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors ${
            isDragging
              ? "border-primary bg-primary/10"
              : "border-border bg-muted/20"
          }`}
        >
          <p className="text-sm text-muted-foreground">
            {isDragging
              ? "Drop photos to add them"
              : `${photoSpec.photos.length} photo${photoSpec.photos.length === 1 ? "" : "s"} added — drag more here or click`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => document.getElementById("photo-uploader-trigger")?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Add more photos
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handlePhoneUpload}
            >
              <Smartphone className="h-3.5 w-3.5" />
              Upload from Phone
            </Button>
          </div>
          <input
            id="photo-uploader-trigger"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) handleFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
      )}

      {Object.values(uploads).some((u) => u.status !== "done" && u.status !== "error") && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-2 text-xs text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading {Object.values(uploads).filter((u) => u.status !== "done" && u.status !== "error").length} photo(s)…
        </div>
      )}

      {loading && photoSpec.photos.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="aspect-[3/2] rounded-xl" />
          ))}
        </div>
      ) : photoSpec.photos.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photoSpec.photos.map((p) => (
            <PhotoTile
              key={p.id}
              photo={p}
              signedUrl={signedUrls[p.original_storage_path] ?? null}
              borderSlug={photoSpec.border_slug}
              onEdit={() => setEditorPhotoId(p.id)}
              onDuplicate={() => duplicatePhoto(p.id)}
              onRemove={() => removePhoto(p.id)}
              onQuantityChange={(qty) => updatePhoto(p.id, { quantity: qty })}
            />
          ))}
        </div>
      ) : null}

      {photoSpec.photos.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="text-sm">
              <p className="font-semibold text-foreground">
                {totals.totalPhotos} photo{totals.totalPhotos === 1 ? "" : "s"} · {totals.totalPrints} print{totals.totalPrints === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                {totals.size.label}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-xl font-bold text-foreground tabular-nums">
                {formatPrice(totals.totalPrice, activeCurrency)}
              </p>
              <Button
                size="lg"
                onClick={handleAddToCartClick}
                disabled={isSubmitting}
                className="gap-2"
              >
                <ShoppingCart className="h-4 w-4" />
                Add to Cart
              </Button>
            </div>
          </div>
        </div>
      )}

      <PhotoEditorModal
        open={!!editorPhoto}
        photo={editorPhoto}
        signedUrl={editorPhoto ? signedUrls[editorPhoto.original_storage_path] ?? null : null}
        borderSlug={photoSpec.border_slug}
        onClose={() => setEditorPhotoId(null)}
        onSave={(next) => {
          if (editorPhotoId) updatePhoto(editorPhotoId, next);
          setEditorPhotoId(null);
        }}
      />

      <Dialog open={showCartDialog} onOpenChange={(o) => !isSubmitting && setShowCartDialog(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Cart</DialogTitle>
            <DialogDescription>
              Give your order a reference name so you can find it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="photo-ref">Reference</Label>
              <Input
                id="photo-ref"
                value={cartReference}
                onChange={(e) => setCartReference(e.target.value)}
                placeholder="e.g. Holiday photos"
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{totals.totalPrints} × {totals.size.label}</span>
                <span className="tabular-nums">{formatPrice(totals.totalPrice, activeCurrency)}</span>
              </div>
              <div className="flex justify-between font-semibold text-foreground pt-1 border-t border-border">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(totals.totalPrice, activeCurrency)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCartDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmAddToCart} disabled={isSubmitting}>
              Confirm & Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR mobile upload modal */}
      <QRUploadModal
        open={qrOpen}
        onOpenChange={setQrOpen}
        orderItemId={qrOrderItemId ?? orderItem?.id}
        onFilesReceived={async (fileIds) => {
          if (!fileIds.length) return;
          const { data: docs } = await supabase
            .from("documents")
            .select("id, file_name, file_path, mime_type, preflight_data")
            .in("id", fileIds);
          if (!docs?.length) return;
          const currentSize = photoSpec.print_size_slug;
          const newEntries: PhotoPrintEntry[] = docs.map((d: any) => ({
            id: crypto.randomUUID(),
            document_id: d.id,
            file_name: d.file_name,
            original_storage_path: d.file_path,
            source_width_px: d.preflight_data?.source_width_px ?? 0,
            source_height_px: d.preflight_data?.source_height_px ?? 0,
            mime_type: d.mime_type || "image/jpeg",
            print_size_slug: currentSize,
            crop: { x: 0, y: 0 },
            zoom: 1,
            rotation: 0,
            fit_mode: "fill" as const,
            croppedAreaPixels: null,
            quantity: 1,
          }));
          setPhotoSpec((prev) => ({
            ...prev,
            photos: [...prev.photos, ...newEntries],
          }));
          qc.invalidateQueries({ queryKey: ["order_data"] });
        }}
      />
    </div>
  );
}

function applyDefaultCrop(p: PhotoPrintEntry): PhotoPrintEntry {
  if (!p.source_width_px || !p.source_height_px) return p;
  const size = getPhotoPrintSize(p.print_size_slug);
  const srcAspect = p.source_width_px / p.source_height_px;
  let cropW = p.source_width_px;
  let cropH = p.source_height_px;
  if (srcAspect > size.aspect) {
    cropH = p.source_height_px;
    cropW = cropH * size.aspect;
  } else {
    cropW = p.source_width_px;
    cropH = cropW / size.aspect;
  }
  const x = Math.round((p.source_width_px - cropW) / 2);
  const y = Math.round((p.source_height_px - cropH) / 2);
  return {
    ...p,
    croppedAreaPixels: {
      x,
      y,
      width: Math.round(cropW),
      height: Math.round(cropH),
    },
  };
}
