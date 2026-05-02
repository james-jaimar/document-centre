import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOrderData, useUpdateOrderItemSpec, useAddSection, useUpdateSection, useDeleteSection } from "@/hooks/useOrderBuilder";
import { useAddItemToCart } from "@/hooks/useCart";
import { useProductOptions } from "@/hooks/useProductOptions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ItemSpec } from "@/lib/calculatePrice";
import { calculateItemPrice } from "@/lib/calculatePrice";
import { isStructuredValues, type StructuredOptionValue } from "@/lib/productOptionTypes";
import type { ProductPreviewType, PreviewEffects } from "@/components/preview/previewTypes";
import { DEFAULT_PREVIEW_EFFECTS } from "@/components/preview/previewTypes";
import OptionsPanel from "@/components/order/OptionsPanel";
import PreviewPanel from "@/components/order/PreviewPanel";
import PriceSummary from "@/components/order/PriceSummary";
import TabInsertDrawer from "@/components/order/TabInsertDrawer";
import SaveConfirmDialog from "@/components/order/SaveConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Settings2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { formatPrice } from "@/lib/formatCurrency";
import { selectedBindingArt } from "@/lib/orders/selectedBindingArt";

export default function OrderBuild() {
  const { id: orderId, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const { order, orderItem, documents, sections, loading } =
    useOrderData(orderId);
  const updateSpec = useUpdateOrderItemSpec();
  const addItemToCart = useAddItemToCart();
  const addSectionMut = useAddSection();
  const updateSectionMut = useUpdateSection();
  const deleteSectionMut = useDeleteSection();
  const { setCollapsed } = useSidebarCollapse();

  // Auto-collapse sidebar on this page for maximum preview space
  useEffect(() => {
    setCollapsed(true);
    return () => setCollapsed(false);
  }, [setCollapsed]);

  const productFamilyId = orderItem?.product_family_id ?? null;

  const { data: options = [] } = useProductOptions(productFamilyId);

  // Fetch product family to get slug for preview type
  const { data: productFamily } = useQuery({
    queryKey: ["product_family", productFamilyId],
    queryFn: async () => {
      if (!productFamilyId) return null;
      const { data, error } = await supabase
        .from("product_families")
        .select("*")
        .eq("id", productFamilyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!productFamilyId,
  });

  // Derive preview type from binding option metadata or product family slug
  const SLUG_TO_PREVIEW: Record<string, ProductPreviewType> = {
    wire_bound: "wire_bound",
    comb_bound: "comb_bound",
    saddle_stitched: "saddle_stitched",
    perfect_bound: "perfect_bound",
    ring_binder: "ring_binder",
    bi_fold: "bi_fold",
    tri_fold: "tri_fold",
    z_fold: "z_fold",
    gate_fold: "gate_fold",
    loose_sheets: "loose_sheets",
    poster: "poster",
    brochures: "bi_fold",
    booklets: "saddle_stitched",
    "business-cards": "business_cards",
    business_cards: "business_cards",
  };

  const BINDING_METHOD_TO_PREVIEW: Record<string, ProductPreviewType> = {
    comb: "comb_bound",
    spiral: "wire_bound",
    twin_loop: "wire_bound",
    wire: "wire_bound",
    ring_binder: "ring_binder",
    saddle_stitch: "saddle_stitched",
    perfect: "perfect_bound",
  };


  // Active region currency (geo-detected, with manual override support).
  const { region } = useRegionalPricing();
  const activeCurrency = region?.currency_code ?? "ZAR";

  // Fetch pricing rules for this product family in the active currency.
  const { data: pricingRules = [] } = useQuery({
    queryKey: ["pricing_rules", productFamilyId, activeCurrency],
    queryFn: async () => {
      if (!productFamilyId) return [];
      const { data, error } = await supabase
        .from("pricing_rules")
        .select("*")
        .eq("product_family_id", productFamilyId)
        .eq("is_active", true)
        .eq("currency_code", activeCurrency)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!productFamilyId,
  });

  // Local spec state derived from order item
  const [spec, setSpec] = useState<ItemSpec>({
    page_count: 0,
    quantity: 1,
    is_color: true,
    is_duplex: true,
    selected_options: {},
  });

  // Order reference / title
  const [reference, setReference] = useState("");

  // Dirty tracking
  const initialSpecRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Show save dialog state (replaces useBlocker which requires data router)
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const pendingNavigationRef = useRef<string | null>(null);

  // Warn on browser close/refresh when dirty
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Sync spec from DB on load
  useEffect(() => {
    if (orderItem?.spec) {
      const s = orderItem.spec as unknown as ItemSpec;
      const newSpec: ItemSpec = {
        page_count: s.page_count ?? 0,
        quantity: s.quantity ?? 1,
        is_color: s.is_color ?? true,
        is_duplex: s.is_duplex ?? true,
        selected_options: s.selected_options ?? {},
        binding_edge_override: s.binding_edge_override ?? null,
      };
      setSpec(newSpec);
      initialSpecRef.current = JSON.stringify(newSpec);
      setDirty(false);
    }
    if (orderItem?.title) {
      setReference(orderItem.title);
    }
  }, [orderItem?.spec, orderItem?.title]);

  // Track dirty state
  useEffect(() => {
    if (initialSpecRef.current === null) return;
    setDirty(JSON.stringify(spec) !== initialSpecRef.current);
  }, [spec]);

  // Calculate total page count from sections
  useEffect(() => {
    const totalPages = sections.reduce((sum, section) => {
      const doc = documents.find((d) => d.id === section.document_id);
      return sum + (doc?.page_count ?? 0);
    }, 0);
    setSpec((prev) => ({ ...prev, page_count: totalPages }));
  }, [sections, documents]);

  // Initialize defaults from product options
  // Track whether auto-size-match has fired so it only runs once PER unique
  // document-dimension signature. When the user scales a doc (e.g. to A4)
  // the signature changes and we re-run the auto-match so the configurator
  // reflects the new size instead of the original (e.g. US Letter).
  const autoSizeMatchedRef = useRef(false);
  const lastDimensionSigRef = useRef<string | null>(null);
  const initialAutoMatchDoneRef = useRef(false);
  const dimensionSig = useMemo(
    () =>
      documents
        .map((d) => `${d.id}:${d.page_width_mm ?? ""}x${d.page_height_mm ?? ""}`)
        .join("|"),
    [documents],
  );
  useEffect(() => {
    if (lastDimensionSigRef.current !== dimensionSig) {
      lastDimensionSigRef.current = dimensionSig;
      autoSizeMatchedRef.current = false;
    }
  }, [dimensionSig]);

  // Options whose values are derived per-section from the uploaded files list
  // (Print Colour / Print Sides). These must NEVER be seeded as defaults on
  // spec.selected_options — the per-section truth is the single source.
  const SECTION_CONTROLLED_OPTIONS = new Set(["Print Colour", "Print Sides"]);

  useEffect(() => {
    if (options.length === 0) return;
    setSpec((prev) => {
      const selected = { ...prev.selected_options };
      let changed = false;
      // Strip any legacy section-controlled keys that may already be persisted
      for (const key of Object.keys(selected)) {
        if (SECTION_CONTROLLED_OPTIONS.has(key)) {
          delete selected[key];
          changed = true;
        }
      }
      for (const opt of options) {
        if (SECTION_CONTROLLED_OPTIONS.has(opt.name)) continue;
        if (selected[opt.name]) continue;
        if (isStructuredValues(opt.values)) {
          const defaultVal = opt.values.find((v) => v.is_default);
          if (defaultVal) {
            selected[opt.name] = defaultVal.slug;
            changed = true;
          } else if (opt.values.length > 0) {
            selected[opt.name] = opt.values[0].slug;
            changed = true;
          }
        }
      }
      if (!changed) return prev;
      return { ...prev, selected_options: selected };
    });
  }, [options]);

  // Auto-match Document Size from uploaded document dimensions
  // Only fires when no Document Size is currently selected — preserves user choice across edit cycles
  useEffect(() => {
    if (autoSizeMatchedRef.current) return;
    if (options.length === 0 || documents.length === 0) return;

    const sizeOpt = options.find((o) => o.name.toLowerCase() === "document size");
    if (!sizeOpt || !isStructuredValues(sizeOpt.values)) return;

    // Respect any previously persisted Document Size choice (case-insensitive
    // key match) — but ONLY on the first run. If the dimensions later change
    // (e.g. user scaled US Letter → A4), override the stale selection.
    const existingKey = Object.keys(spec.selected_options).find(
      (k) => k.toLowerCase() === "document size"
    );
    if (
      !initialAutoMatchDoneRef.current &&
      existingKey &&
      spec.selected_options[existingKey]
    ) {
      autoSizeMatchedRef.current = true;
      initialAutoMatchDoneRef.current = true;
      return;
    }

    const doc = documents[0];
    const docW = doc.page_width_mm ? Number(doc.page_width_mm) : null;
    const docH = doc.page_height_mm ? Number(doc.page_height_mm) : null;
    if (!docW || !docH) return;

    const TOLERANCE = 3; // mm
    const matched = (sizeOpt.values as StructuredOptionValue[]).find((v) => {
      const meta = v.metadata as Record<string, any>;
      const w = Number(meta?.width_mm ?? 0);
      const h = Number(meta?.height_mm ?? 0);
      if (!w || !h) return false;
      // Check both portrait and landscape
      const portrait = Math.abs(docW - w) <= TOLERANCE && Math.abs(docH - h) <= TOLERANCE;
      const landscape = Math.abs(docW - h) <= TOLERANCE && Math.abs(docH - w) <= TOLERANCE;
      return portrait || landscape;
    });

    if (matched) {
      autoSizeMatchedRef.current = true;
      initialAutoMatchDoneRef.current = true;
      setSpec((prev) => ({
        ...prev,
        selected_options: { ...prev.selected_options, [sizeOpt.name]: matched.slug },
      }));
    }
  }, [options, documents, spec.selected_options]);

  // Derive preview type from binding option metadata or product family slug
  const productType: ProductPreviewType = useMemo(() => {
    // Case-insensitive lookup for "Binding" option
    const bindingOption = options.find((o) => o.name.toLowerCase() === "binding");
    // Try matching the option name exactly in selected_options, or case-insensitive
    const optionKey = bindingOption
      ? Object.keys(spec.selected_options).find(
          (k) => k.toLowerCase() === bindingOption.name.toLowerCase()
        ) || bindingOption.name
      : "Binding";
    const selectedBindingSlug = spec.selected_options[optionKey];

    if (import.meta.env.DEV) console.log("[PreviewType] options count:", options.length, "bindingOption:", bindingOption?.name, "selectedSlug:", selectedBindingSlug);

    if (bindingOption && selectedBindingSlug && isStructuredValues(bindingOption.values)) {
      const matchedValue = (bindingOption.values as StructuredOptionValue[]).find(
        (v) => v.slug === selectedBindingSlug
      );
      const bindingMethod = matchedValue?.metadata?.binding_method as string | undefined;
      if (import.meta.env.DEV) console.log("[PreviewType] matchedValue:", matchedValue?.label, "bindingMethod:", bindingMethod);
      if (bindingMethod && BINDING_METHOD_TO_PREVIEW[bindingMethod]) {
        return BINDING_METHOD_TO_PREVIEW[bindingMethod];
      }
    }
    // Check for Fold Type option (brochures / flyers)
    const foldOption = options.find((o) => o.name.toLowerCase() === "fold type");
    if (foldOption && isStructuredValues(foldOption.values)) {
      const foldKey = Object.keys(spec.selected_options).find(
        (k) => k.toLowerCase() === foldOption.name.toLowerCase()
      ) || foldOption.name;
      const selectedFoldSlug = spec.selected_options[foldKey];
      if (selectedFoldSlug) {
        const matchedFold = (foldOption.values as StructuredOptionValue[]).find(
          (v) => v.slug === selectedFoldSlug
        );
        // 1. metadata.fold_type (canonical)
        const metaFoldType = matchedFold?.metadata?.fold_type as string | undefined;
        if (metaFoldType && SLUG_TO_PREVIEW[metaFoldType]) {
          if (import.meta.env.DEV) console.log("[PreviewType] fold from metadata.fold_type:", metaFoldType);
          return SLUG_TO_PREVIEW[metaFoldType];
        }

        // 2. metadata.fold_style (e.g. "z", "gate")
        const foldStyle = matchedFold?.metadata?.fold_style as string | undefined;
        if (foldStyle) {
          const styleMap: Record<string, ProductPreviewType> = { z: "z_fold", gate: "gate_fold", c: "tri_fold", tri: "tri_fold", bi: "bi_fold", half: "bi_fold" };
          if (styleMap[foldStyle]) {
            if (import.meta.env.DEV) console.log("[PreviewType] fold from metadata.fold_style:", foldStyle, "→", styleMap[foldStyle]);
            return styleMap[foldStyle];
          }
        }

        // 3. Infer from slug or label keywords
        const textToSearch = `${selectedFoldSlug} ${matchedFold?.label ?? ""}`.toLowerCase();
        const inferFold = (text: string): ProductPreviewType | null => {
          if (/gate/i.test(text)) return "gate_fold";
          if (/z[\s-]?fold/i.test(text)) return "z_fold";
          if (/tri/i.test(text)) return "tri_fold";
          if (/bi|half/i.test(text)) return "bi_fold";
          return null;
        };
        const inferred = inferFold(textToSearch);
        if (inferred) {
          if (import.meta.env.DEV) console.log("[PreviewType] fold inferred from text:", textToSearch, "→", inferred);
          return inferred;
        }
      }
    }

    const slugResult = (productFamily?.slug && SLUG_TO_PREVIEW[productFamily.slug]) || "loose_sheets";
    if (import.meta.env.DEV) console.log("[PreviewType] falling back to slug:", productFamily?.slug, "→", slugResult);
    return slugResult;
  }, [options, spec.selected_options, productFamily?.slug]);

  // Derive visual finishing effects from selected options metadata
  const previewEffects: PreviewEffects = useMemo(() => {
    const fx = { ...DEFAULT_PREVIEW_EFFECTS };

    // Helper: find selected value metadata for an option by name (case-insensitive)
    const getMetadata = (optionName: string): Record<string, any> | null => {
      const opt = options.find((o) => o.name.toLowerCase() === optionName.toLowerCase());
      if (!opt || !isStructuredValues(opt.values)) return null;
      const key = Object.keys(spec.selected_options).find(
        (k) => k.toLowerCase() === opt.name.toLowerCase()
      ) || opt.name;
      const slug = spec.selected_options[key];
      if (!slug) return null;
      const val = (opt.values as StructuredOptionValue[]).find((v) => v.slug === slug);
      return (val?.metadata as Record<string, any>) ?? null;
    };

    // Print to Edge → bleed scope
    const edgeMeta = getMetadata("Print to Edge");
    if (edgeMeta?.bleed === true) {
      const scope = edgeMeta.scope as string | undefined;
      fx.bleed = (scope === "all" || scope === "front_cover" || scope === "covers") ? scope : "all";
    }

    // Covers → front + back
    const coverMeta = getMetadata("Covers");
    if (coverMeta) {
      if (coverMeta.front) fx.frontCover = coverMeta.front as PreviewEffects["frontCover"];
      if (coverMeta.back) fx.backCover = coverMeta.back as PreviewEffects["backCover"];
    }

    // Paper Stock → paper color
    const paperMeta = getMetadata("Paper Stock");
    if (paperMeta?.color) fx.paperColor = paperMeta.color as string;

    // Hole Punching → holes
    const holeMeta = getMetadata("Hole Punching");
    if (holeMeta?.holes) fx.holePunch = holeMeta.holes as 0 | 2 | 4;

    // Cover Lamination → lamination finish
    const lamMeta = getMetadata("Cover Lamination");
    if (lamMeta?.finish) fx.coverLamination = lamMeta.finish as PreviewEffects["coverLamination"];

    return fx;
  }, [options, spec.selected_options]);

  // Derive document orientation + binding edge from Document Size metadata.
  // Treats both `binding_edge: "top"` (legacy) and `binding_edge: "short"`
  // (current landscape default) as top-bound for the FlipBook layout. Pure
  // landscape orientation also implies top-bound when no override is set.
  const sizeMeta = useMemo(() => {
    const sizeOpt = options.find((o) => o.name.toLowerCase() === "document size");
    if (!sizeOpt || !isStructuredValues(sizeOpt.values)) return null;
    const key = Object.keys(spec.selected_options).find(
      (k) => k.toLowerCase() === sizeOpt.name.toLowerCase()
    ) || sizeOpt.name;
    const slug = spec.selected_options[key];
    if (!slug) return null;
    const val = (sizeOpt.values as StructuredOptionValue[]).find((v) => v.slug === slug);
    return (val?.metadata as Record<string, any>) ?? null;
  }, [options, spec.selected_options]);

  const isLandscapeSize = sizeMeta?.orientation === "landscape";
  const sizeBindingEdge = sizeMeta?.binding_edge as string | undefined;

  // Canvas size from selected Document Size option — drives preview scaling
  const canvasSizeMm = useMemo(() => {
    if (!sizeMeta) return undefined;
    const w = Number(sizeMeta.width_mm ?? 0);
    const h = Number(sizeMeta.height_mm ?? 0);
    if (!w || !h) return undefined;
    // Swap for landscape orientation
    if (isLandscapeSize) return { widthMm: Math.max(w, h), heightMm: Math.min(w, h) };
    return { widthMm: Math.min(w, h), heightMm: Math.max(w, h) };
  }, [sizeMeta, isLandscapeSize]);

  // Single source of truth — same helper is used by buildPreviewSnapshot
  // so live builder and saved/admin previews agree on binding artwork.
  const bindingArt = useMemo(
    () => selectedBindingArt(spec.selected_options, options),
    [options, spec.selected_options],
  );

  // Binding edge is determined by the actual page geometry of the uploaded
  // (and rotated, if applicable) document. The Document Size option only
  // acts as a fallback when no document is yet uploaded — once we have
  // authoritative width/height the document IS the source of truth.
  //
  // Why: a "Presentations" product is locked landscape, but if the user
  // uploads a portrait PDF (or we rotate a landscape one to portrait), the
  // physical book is portrait — its spine is on the LONG (left) edge.
  // Reading the size option after rotation would still say "landscape" and
  // we would request short-edge spine artwork that no longer matches the
  // page shape.
  const docPageOrientation: "portrait" | "landscape" | null = useMemo(() => {
    const doc = documents.find((d) => d.page_width_mm && d.page_height_mm);
    if (!doc || !doc.page_width_mm || !doc.page_height_mm) return null;
    return Number(doc.page_width_mm) > Number(doc.page_height_mm) ? "landscape" : "portrait";
  }, [documents]);

  const bindingEdge: "left" | "top" = useMemo(() => {
    // 1. If we know the actual page orientation, that wins.
    if (docPageOrientation === "landscape") return "top";
    if (docPageOrientation === "portrait") return "left";
    // 2. Otherwise fall back to the selected Document Size metadata.
    if (sizeBindingEdge === "top" || sizeBindingEdge === "short") return "top";
    if (isLandscapeSize) return "top";
    return "left";
  }, [docPageOrientation, sizeBindingEdge, isLandscapeSize]);

  const handleOptionChange = useCallback((optionName: string, slug: string) => {
    setSpec((prev) => ({
      ...prev,
      selected_options: { ...prev.selected_options, [optionName]: slug },
    }));
  }, []);

  const handleQuantityChange = useCallback((qty: number) => {
    setSpec((prev) => ({ ...prev, quantity: qty }));
  }, []);

  // Save spec back to DB
  const handleSave = useCallback(async () => {
    if (!orderItem) return;
    try {
      await updateSpec.mutateAsync({ id: orderItem.id, spec });
      toast.success("Configuration saved");
    } catch (err: any) {
      toast.error("Failed to save", { description: err.message });
    }
  }, [orderItem, spec, updateSpec]);

  // ── Add to Cart confirmation dialog state ──
  const [showCartDialog, setShowCartDialog] = useState(false);
  const [cartReference, setCartReference] = useState("");
  const [cartTotal, setCartTotal] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canAddToCart = !!order && !!orderItem && sections.length > 0 && (spec?.page_count ?? 0) > 0;

  const handleAddToCartClick = useCallback(() => {
    if (!orderItem || !order) {
      toast.error("Order data is still loading. Please wait.");
      return;
    }
    if (sections.length === 0 || (spec?.page_count ?? 0) === 0) {
      toast.error("Please upload and assign at least one file before adding to cart.");
      return;
    }
    try {
      const breakdown = calculateItemPrice(spec, options, pricingRules, activeCurrency);
      if (breakdown.lines.length === 0) {
        toast.error("No pricing rules configured", {
          description: "Please contact the administrator to set up pricing for this product.",
        });
        return;
      }
      setCartTotal(breakdown.total);
      setCartReference(reference.trim() || productFamily?.name || "Document");
      setShowCartDialog(true);
    } catch (err: any) {
      console.error("add_to_cart_failed", { orderId: order.id, orderItemId: orderItem.id, sections, spec, err });
      toast.error("Unable to calculate price", { description: err.message });
    }
  }, [orderItem, order, spec, options, pricingRules, reference, productFamily, sections]);

  const handleConfirmAddToCart = useCallback(async () => {
    if (!orderItem || !order || isSubmitting) return;
    const ref = cartReference.trim();
    if (!ref) {
      toast.error("Please enter a reference name");
      return;
    }
    setIsSubmitting(true);
    try {
      const breakdown = calculateItemPrice(spec, options, pricingRules, activeCurrency);
      // Check if this draft was created by editing a cart item
      const replacesCartItemId = (order.metadata as any)?.replaces_cart_item_id;
      await addItemToCart.mutateAsync({
        orderItemId: orderItem.id,
        draftOrderId: order.id,
        title: ref,
        unitPrice: breakdown.subtotal_per_unit,
        quantity: spec.quantity,
        totalPrice: breakdown.total,
        spec: spec as any,
        replacesCartItemId: replacesCartItemId || undefined,
        currencyCode: activeCurrency,
      });
      setShowCartDialog(false);
      toast.success("Added to cart!");
      navigate(`/t/${slug}/cart`);
    } catch (err: any) {
      console.error("handleAddToCart failed", err);
      toast.error("Failed to add to cart", { description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  }, [orderItem, order, isSubmitting, cartReference, spec, options, pricingRules, addItemToCart, navigate, slug]);

  // Navigation guard — show dialog when dirty
  const guardedNavigate = useCallback((path: string) => {
    if (dirty) {
      pendingNavigationRef.current = path;
      setShowSaveDialog(true);
    } else {
      navigate(path);
    }
  }, [dirty, navigate]);

  const handleBackToFiles = useCallback(() => {
    guardedNavigate(`/t/${slug}/orders/${orderId}/files`);
  }, [orderId, slug, guardedNavigate]);

  const handleSaveAndLeave = useCallback(async (ref: string) => {
    if (!orderItem) return;
    try {
      await updateSpec.mutateAsync({ id: orderItem.id, spec });
      await supabase.from("order_items").update({ title: ref.trim() || null, build_status: "building" } as any).eq("id", orderItem.id);
      setShowSaveDialog(false);
      const dest = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      if (dest) navigate(dest);
    } catch (err: any) {
      toast.error("Failed to save", { description: err.message });
    }
  }, [orderItem, spec, updateSpec, navigate]);

  const handleDiscardAndLeave = useCallback(() => {
    setShowSaveDialog(false);
    const dest = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (dest) navigate(dest);
  }, [navigate]);

  // ── Drawer state ──
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hasOpenedDrawer, setHasOpenedDrawer] = useState(false);
  const prevTabInsertRef = useRef<{ hadTabs: boolean; hadInserts: boolean }>({ hadTabs: false, hadInserts: false });

  // ── Derive tab info from product options ──
  const tabInfo = useMemo(() => {
    const tabOpt = options.find((o) => o.name.toLowerCase().includes("tab"));
    if (!tabOpt || !isStructuredValues(tabOpt.values)) return null;
    const key = Object.keys(spec.selected_options).find(
      (k) => k.toLowerCase() === tabOpt.name.toLowerCase()
    ) || tabOpt.name;
    const slug = spec.selected_options[key];
    if (!slug || slug === "none") return null;
    const val = (tabOpt.values as StructuredOptionValue[]).find((v) => v.slug === slug);
    if (!val) return null;
    const count = (val.metadata as any)?.tab_count ?? 0;
    const multiColor = (val.metadata as any)?.color === "multi";
    return count > 0 ? { count, multiColor } : null;
  }, [options, spec.selected_options]);

  // ── Derive insert info from product options ──
  const insertEnabled = useMemo(() => {
    const insertOpt = options.find((o) => o.name.toLowerCase().includes("insert") || o.name.toLowerCase().includes("divider"));
    if (!insertOpt || !isStructuredValues(insertOpt.values)) return false;
    const key = Object.keys(spec.selected_options).find(
      (k) => k.toLowerCase() === insertOpt.name.toLowerCase()
    ) || insertOpt.name;
    const slug = spec.selected_options[key];
    return !!slug && slug !== "none" && slug !== "no-inserts" && slug !== "no_inserts";
  }, [options, spec.selected_options]);

  // Auto-open drawer when tabs or inserts become enabled
  useEffect(() => {
    const prev = prevTabInsertRef.current;
    const nowHasTabs = !!tabInfo;
    const nowHasInserts = insertEnabled;
    // If tabs or inserts were just enabled, auto-open the drawer
    if ((nowHasTabs && !prev.hadTabs) || (nowHasInserts && !prev.hadInserts)) {
      setDrawerOpen(true);
      setHasOpenedDrawer(true);
    }
    prev.hadTabs = nowHasTabs;
    prev.hadInserts = nowHasInserts;
  }, [tabInfo, insertEnabled]);

  const orderItemId = orderItem?.id ?? "";

  // ── Tab/Insert callbacks using page_range_start as anchor ──
  const handleAddTab = useCallback(async (afterPage: number) => {
    if (!orderItemId) return;
    const maxSort = sections.reduce((max, s) => Math.max(max, s.sort_order), 0);
    await addSectionMut.mutateAsync({
      order_item_id: orderItemId,
      section_type: "tab",
      sort_order: maxSort + 1,
      document_id: null,
      page_range_start: afterPage,
    } as any);
  }, [orderItemId, addSectionMut, sections]);

  const handleDeleteTab = useCallback(async (sectionId: string) => {
    if (!orderItemId) return;
    await deleteSectionMut.mutateAsync({ id: sectionId, orderItemId });
  }, [orderItemId, deleteSectionMut]);

  const handleMoveTab = useCallback(async (sectionId: string, afterPage: number) => {
    await updateSectionMut.mutateAsync({ id: sectionId, page_range_start: afterPage } as any);
  }, [updateSectionMut]);

  const handleUpdateTabLabel = useCallback(async (sectionId: string, label: string) => {
    await updateSectionMut.mutateAsync({ id: sectionId, label } as any);
  }, [updateSectionMut]);

  const handleAddInsert = useCallback(async (afterPage: number, color: string) => {
    if (!orderItemId) return;
    const maxSort = sections.reduce((max, s) => Math.max(max, s.sort_order), 0);
    const section = await addSectionMut.mutateAsync({
      order_item_id: orderItemId,
      section_type: "insert",
      sort_order: maxSort + 1,
      document_id: null,
      page_range_start: afterPage,
    } as any);
    await supabase.from("document_sections").update({ color } as any).eq("id", section.id);
  }, [orderItemId, addSectionMut, sections]);

  const handleDeleteInsert = useCallback(async (sectionId: string) => {
    if (!orderItemId) return;
    await deleteSectionMut.mutateAsync({ id: sectionId, orderItemId });
  }, [orderItemId, deleteSectionMut]);

  const handleMoveInsert = useCallback(async (sectionId: string, afterPage: number) => {
    await updateSectionMut.mutateAsync({ id: sectionId, page_range_start: afterPage } as any);
  }, [updateSectionMut]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-[320px_1fr] gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  // Empty state: no files uploaded yet
  if (!loading && documents.length === 0 && sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <p className="text-muted-foreground text-lg">No files uploaded yet</p>
        <p className="text-muted-foreground text-sm">Upload your documents first, then come back to configure options.</p>
        <Button onClick={() => navigate(`/t/${slug}/orders/${orderId}/files`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Go to Upload Files
        </Button>
      </div>
    );
  }

  return (
    <div className="-m-6 xl:-m-8 p-3 xl:p-4 h-[calc(100%+3rem)] xl:h-[calc(100%+4rem)] flex flex-col space-y-2 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-foreground leading-tight">
            {productFamily?.name ? `${productFamily.name} — ` : ""}Configure Your Document
          </h1>
          <p className="text-muted-foreground text-xs">
            Step 2 of 2 — Select your options and review the preview
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToFiles}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Files
        </Button>
      </div>

      {/* Split panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[420px_1fr] 2xl:grid-cols-[460px_1fr] gap-3 xl:gap-4 min-h-0">
        {/* Left: Options */}
        <div className="flex flex-col overflow-auto border border-border rounded-lg bg-card">
          <div className="p-3 border-b border-border shrink-0 space-y-2">
            <h2 className="font-semibold text-foreground text-sm">Options</h2>
            <Input
              placeholder="Order reference (e.g. Marketing Brochure Q2)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="text-xs h-8"
            />
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-3">
            <OptionsPanel
              options={options}
              selectedOptions={spec.selected_options}
              onOptionChange={handleOptionChange}
            />

            {/* Manage Tabs & Inserts button */}
            {(tabInfo || insertEnabled) && (
              <Button
                variant="outline"
                size="sm"
                className={`w-full text-xs ${
                  !hasOpenedDrawer && !drawerOpen
                    ? "animate-pulse ring-2 ring-primary ring-offset-2 ring-offset-card"
                    : ""
                }`}
                onClick={() => {
                  setDrawerOpen(true);
                  setHasOpenedDrawer(true);
                }}
              >
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Manage Tabs & Inserts
              </Button>
            )}
          </div>
          <div className="p-3 shrink-0">
            <PriceSummary
              spec={spec}
              options={options}
              rules={pricingRules}
              onQuantityChange={handleQuantityChange}
              onAddToCart={handleAddToCartClick}
              disabled={!canAddToCart}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>

        {/* Right: Preview */}
        <div className="border border-border rounded-lg bg-card p-2 overflow-auto flex flex-col gap-2">
          <PreviewPanel
            documents={documents}
            sections={sections}
            productType={productType}
            effects={previewEffects}
            bindingEdge={bindingEdge}
            bindingArt={bindingArt}
            canvasSizeMm={canvasSizeMm}
            scaleMode={spec.scale_mode ?? "fit"}
            onScaleModeChange={(mode) => setSpec((prev) => ({ ...prev, scale_mode: mode }))}
            productFamilySlug={productFamily?.slug ?? undefined}
          />
        </div>
      </div>
      {/* Tab/Insert Drawer — only mount after user clicks the button */}
      {hasOpenedDrawer && (
      <TabInsertDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        sections={sections}
        documents={documents}
        orderItemId={orderItemId}
        isDuplex={spec.is_duplex}
        tabEnabled={!!tabInfo}
        tabCount={tabInfo?.count ?? 0}
        isMultiColor={tabInfo?.multiColor ?? false}
        onAddTab={handleAddTab}
        onDeleteTab={handleDeleteTab}
        onMoveTab={handleMoveTab}
        onUpdateTabLabel={handleUpdateTabLabel}
        insertEnabled={insertEnabled}
        onAddInsert={handleAddInsert}
        onDeleteInsert={handleDeleteInsert}
        onMoveInsert={handleMoveInsert}
      />
      )}

      <SaveConfirmDialog
        open={showSaveDialog}
        defaultReference={reference}
        onSave={handleSaveAndLeave}
        onDiscard={handleDiscardAndLeave}
        onCancel={() => setShowSaveDialog(false)}
      />

      {/* Add to Cart confirmation dialog */}
      <Dialog open={showCartDialog} onOpenChange={(open) => !isSubmitting && setShowCartDialog(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Order</DialogTitle>
            <DialogDescription>
              Give this item a reference name and confirm to add it to your cart.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Reference</label>
              <Input
                value={cartReference}
                onChange={(e) => setCartReference(e.target.value)}
                placeholder="e.g. Marketing Brochure Q2"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3 bg-muted/50">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-bold text-foreground">{formatPrice(cartTotal, activeCurrency)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCartDialog(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleConfirmAddToCart} disabled={isSubmitting || !cartReference.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing…
                </>
              ) : (
                "Confirm & Add to Cart"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
