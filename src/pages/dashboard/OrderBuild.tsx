import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOrderData, useUpdateOrderItemSpec, useAddSection, useUpdateSection, useDeleteSection } from "@/hooks/useOrderBuilder";
import { useAddItemToCart } from "@/hooks/useCart";
import { useCatalogBackedOptions } from "@/hooks/useCatalogBackedOptions";
import { useProductVariantLinks } from "@/hooks/useCatalogVariants";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ItemSpec, ItemSpecSection } from "@/lib/calculatePrice";
import { calculateItemPrice, calculatePriceFromRateCard } from "@/lib/calculatePrice";
import { isStructuredValues, isValueActive, type StructuredOptionValue } from "@/lib/productOptionTypes";
import type { ProductPreviewType, PreviewEffects } from "@/components/preview/previewTypes";
import { DEFAULT_PREVIEW_EFFECTS } from "@/components/preview/previewTypes";
import OptionsPanel, { MULTI_SECTION_FAMILIES, SECTION_CONTROLLED_OPTION_NAMES } from "@/components/order/OptionsPanel";
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
import { useMeasurementUnit } from "@/hooks/useMeasurementUnit";
import { useCurrencyConverter } from "@/hooks/useCurrencyProfiles";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useProductPriceOverrides } from "@/hooks/useProductPriceOverrides";
import { useDerivedProductRecipe } from "@/hooks/useDerivedProductRecipe";
import {
  useResolvedRateCardClicks as useRateCardClicks,
  useResolvedRateCardPapers as useRateCardPapers,
  useResolvedRateCardFinishing as useRateCardFinishing,
  useResolvedRateCardPhotoPrints as useRateCardPhotoPrints,
  useResolvedRateCardBusinessCards as useRateCardBusinessCards,
  useResolvedRateCardPriceBreaksBundle as useRateCardPriceBreaksBundle,
} from "@/hooks/useResolvedRateCard";
import { useBindingSpecifications } from "@/hooks/useBindingSpecifications";
import { useBranch } from "@/contexts/BranchContext";
import { formatPrice } from "@/lib/formatCurrency";
import { selectedBindingArt } from "@/lib/orders/selectedBindingArt";
import {
  planCoverSplit,
  printedCoverStock,
  coverStockLabel,
  matchesSplit,
  isWholeDocumentBody,
} from "@/lib/orders/autoCoverSplit";

import { blockMatchesField, type QuantityBlock } from "@/hooks/useProductFamilies";
import { usePackPricingOverridesForFamily } from "@/hooks/useProductPackPricingOverrides";
import { resolvePackPricing } from "@/lib/pricing/resolvePackPricing";
import { getFamilyKind, isSaddleStitchedKind, isSingleSheetKind } from "@/lib/products/familyKind";


export default function OrderBuild() {
  const { id: orderId } = useParams<{ id: string }>();
  const { slug, tenantPath } = useTenantSlug();
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
  const orderItemId = orderItem?.id ?? "";

  // Compute effective branch up-front so it can feed both the resolved-options
  // hook and the pricing cascade further below.
  const { tenantId, branchId: membershipBranchId } = useTenantContext();
  const { activeBranch } = useBranch();
  const effectiveBranchId = activeBranch?.id ?? membershipBranchId ?? null;

  // Resolved = legacy product_options skeleton with values for Paper / Cover /
  // Document Size overlaid from the master catalogue (catalog_papers,
  // catalog_sizes) so what the customer sees matches what admins curate.
  const { data: options = [] } = useCatalogBackedOptions(productFamilyId, effectiveBranchId);
  const { data: variantLinks = [] } = useProductVariantLinks(productFamilyId);

  // Catalog-linked sizes for this family (drives auto-seed of Document Size
  // for products that have no explicit product_options row — e.g. large-format
  // pull-up banners which only expose a Variant selector to customers).
  const { data: familyCatalogLinks = [] } = useQuery({
    queryKey: ["product_catalog_links_size", productFamilyId],
    queryFn: async () => {
      if (!productFamilyId) return [] as { item_code: string }[];
      const { data, error } = await supabase
        .from("product_catalog_links")
        .select("item_code")
        .eq("product_family_id", productFamilyId)
        .eq("catalog", "size");
      if (error) throw error;
      return (data ?? []) as { item_code: string }[];
    },
    enabled: !!productFamilyId,
  });

  const variantOptions = useMemo(
    () =>
      (variantLinks ?? [])
        .filter((l) => l.variant?.is_active)
        .map((l) => ({
          code: l.variant!.code,
          label: l.variant!.label,
          description: l.variant?.description,
        })),
    [variantLinks],
  );
  const defaultVariantCode = useMemo(() => {
    const defaultLink = (variantLinks ?? []).find((l) => l.is_default && l.variant?.is_active);
    return defaultLink?.variant?.code ?? variantOptions[0]?.code ?? null;
  }, [variantLinks, variantOptions]);

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

  // Specialised-builder redirect: canvas_wrap and photo_print orders must
  // never render in the generic build view.
  useEffect(() => {
    if (!orderId || !productFamily?.kind) return;
    if (productFamily.kind === "canvas_wrap") {
      navigate(tenantPath(`orders/${orderId}/canvas-prints`), { replace: true });
    } else if (productFamily.kind === "photo_print") {
      navigate(tenantPath(`orders/${orderId}/photo-prints`), { replace: true });
    } else if (productFamily.supports_editable_artwork || productFamily.kind === "templated_artwork") {
      navigate(tenantPath(`orders/${orderId}/custom-artwork`), { replace: true });
    }
  }, [orderId, productFamily?.kind, productFamily?.supports_editable_artwork, navigate, tenantPath]);

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
    posters: "poster",
    "stapled-loose-pages": "loose_sheets",
    stapled_loose_pages: "loose_sheets",
    flyers: "loose_sheets",
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
  const { region, baseCurrency } = useRegionalPricing();
  const { unit } = useMeasurementUnit();
  const activeCurrency = region?.currency_code ?? "ZAR";
  const { convert: convertPrice } = useCurrencyConverter(activeCurrency, baseCurrency);

  // tenantId / effectiveBranchId already computed above (needed by useResolvedProductOptions).

  // Layer 3 cascade: branch overrides take priority over tenant overrides.
  const { data: branchOverrides = [] } = useProductPriceOverrides(
    tenantId,
    productFamilyId,
    activeCurrency,
    effectiveBranchId,
  );
  const { data: tenantOverrides = [] } = useProductPriceOverrides(
    tenantId,
    productFamilyId,
    activeCurrency,
    null,
  );
  const cascadedOverrides = useMemo(
    () => [...branchOverrides, ...tenantOverrides],
    [branchOverrides, tenantOverrides],
  );

  // New rate-card engine: recipe + tenant rate card. If both are present,
  // PriceSummary will use the new calculator and ignore the legacy rules path.
  const { data: recipe = null } = useDerivedProductRecipe(productFamilyId);
  const rcArgs = { tenantId: tenantId ?? undefined, branchId: effectiveBranchId ?? undefined };
  const { data: rcClicks = [] } = useRateCardClicks(rcArgs);
  const { data: rcPapers = [] } = useRateCardPapers(rcArgs);
  const { data: rcFinishing = [] } = useRateCardFinishing(rcArgs);
  const { data: rcPhotoPrints = [] } = useRateCardPhotoPrints(rcArgs);
  const { data: rcBusinessCards = [] } = useRateCardBusinessCards(rcArgs);
  const { data: bindingSpecs = [] } = useBindingSpecifications();
  const { data: rcPriceBreaks = [] } = useRateCardPriceBreaksBundle(rcArgs);
  const rateCard = useMemo(
    () => ({
      clicks: rcClicks,
      papers: rcPapers,
      finishing: rcFinishing,
      photoPrints: rcPhotoPrints,
      businessCards: rcBusinessCards,
      bindingSpecs,
      priceBreaks: rcPriceBreaks,
    }),
    [rcClicks, rcPapers, rcFinishing, rcPhotoPrints, rcBusinessCards, bindingSpecs, rcPriceBreaks],
  );
  const useNewEngine =
    !!recipe &&
    (rcClicks.length > 0 ||
      rcPhotoPrints.length > 0 ||
      rcBusinessCards.length > 0);

  // Fetch pricing rules for this product family in the active currency.
  // When a branch is selected, use that branch's own pricebook; otherwise the
  // tenant-wide rules (branch_id IS NULL).
  const { data: pricingRules = [] } = useQuery({
    queryKey: ["pricing_rules", productFamilyId, activeCurrency, effectiveBranchId ?? null],
    queryFn: async () => {
      if (!productFamilyId) return [];
      let q = supabase
        .from("pricing_rules")
        .select("*")
        .eq("product_family_id", productFamilyId)
        .eq("is_active", true)
        .eq("currency_code", activeCurrency)
        .order("sort_order", { ascending: true });
      if (effectiveBranchId) {
        q = q.eq("branch_id", effectiveBranchId);
      } else {
        q = q.is("branch_id", null);
      }
      const { data, error } = await q;
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

  // Behaviour driven by product_families.kind (admin-configurable template),
  // with a slug fallback for legacy rows. See src/lib/products/familyKind.ts.
  const familyKind = useMemo(
    () => getFamilyKind(productFamily as { kind?: string | null; slug?: string | null } | null | undefined),
    [productFamily?.kind, productFamily?.slug]
  );
  const isSaddleStitchedFamily = isSaddleStitchedKind(familyKind);
  const isSingleSheetFamily = isSingleSheetKind(familyKind);


  // Sync spec from DB on load
  useEffect(() => {
    if (orderItem?.spec) {
      const s = orderItem.spec as unknown as ItemSpec;
      const newSpec: ItemSpec = {
        page_count: s.page_count ?? 0,
        quantity: s.quantity ?? 1,
        is_color: s.is_color ?? true,
        is_duplex: isSaddleStitchedFamily ? true : (s.is_duplex ?? true),
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
  }, [orderItem?.spec, orderItem?.title, isSaddleStitchedFamily]);

  // Defensive: if the family is saddle-stitched and spec drifts to simplex
  // (legacy carts, manual edits), clamp it back to duplex.
  useEffect(() => {
    if (isSaddleStitchedFamily && !spec.is_duplex) {
      setSpec((prev) => ({ ...prev, is_duplex: true }));
    }
  }, [isSaddleStitchedFamily, spec.is_duplex]);

  // Track dirty state
  useEffect(() => {
    if (initialSpecRef.current === null) return;
    setDirty(JSON.stringify(spec) !== initialSpecRef.current);
  }, [spec]);

  // Calculate total page count from sections.
  // CRITICAL: dedupe by document_id so loose-sheet products (flyers, posters,
  // brochures) that reference the SAME PDF from both `front_cover` and
  // `back_cover` sections aren't counted twice. Counting twice inflates
  // `spec.page_count` and causes the pricing engine — when it falls back to
  // the spec-level page_count (no per-section list saved) — to bill double
  // the clicks (e.g. a 2-page duplex flyer billed as 4 pages = 2 clicks
  // instead of 1).
  useEffect(() => {
    const seenDocs = new Set<string>();
    const totalPages = sections.reduce((sum, section) => {
      const docId = section.document_id;
      if (!docId || seenDocs.has(docId)) return sum;
      seenDocs.add(docId);
      const doc = documents.find((d) => d.id === docId);
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

  // Options whose values mirror onto each document section's is_color /
  // is_duplex. For multi-section bound families they're owned per section
  // in the upload UI; for single-section families (posters, flyers,
  // brochures, booklets, business cards, loose sheets) they sit on the
  // global OptionsPanel and must seed a default + propagate to the body
  // section row (handled by the effect further down).
  const familySlugLower = (productFamily?.slug ?? "").toLowerCase();
  const isMultiSectionFamily = MULTI_SECTION_FAMILIES.has(familySlugLower);

  // Flyers: infer Print Sides from the uploaded page count so the customer
  // never sees (or is defaulted to) double-sided pricing on a 1-page file.
  // null = no inference (keep existing ladder behaviour).
  const isFlyersFamily = familySlugLower === "flyers";
  const uploadedPageTotal = useMemo(
    () => documents.reduce((sum, d) => sum + (d.page_count ?? 0), 0),
    [documents],
  );
  const preferredSides: "single" | "double" | null = useMemo(() => {
    if (!isFlyersFamily || uploadedPageTotal <= 0) return null;
    return uploadedPageTotal >= 2 ? "double" : "single";
  }, [isFlyersFamily, uploadedPageTotal]);
  const allowedSides: string[] | undefined = preferredSides ? [preferredSides] : undefined;

  useEffect(() => {
    if (options.length === 0) return;
    setSpec((prev) => {
      const selected = { ...prev.selected_options };
      let changed = false;
      // For multi-section families, strip any persisted Print Colour /
      // Print Sides keys — per-section state is the only truth.
      if (isMultiSectionFamily) {
        for (const key of Object.keys(selected)) {
          if (SECTION_CONTROLLED_OPTION_NAMES.has(key)) {
            delete selected[key];
            changed = true;
          }
        }
      }
      for (const opt of options) {
        if (isMultiSectionFamily && SECTION_CONTROLLED_OPTION_NAMES.has(opt.name)) continue;
        // Document Size is owned by the PDF auto-detect effect below; do not
        // pre-seed it with the catalogue's first entry, otherwise the
        // detected size never gets a chance to win (the auto-detect bails
        // out as soon as it sees an existing selection).
        if (opt.name.toLowerCase() === "document size") continue;
        if (!isStructuredValues(opt.values)) continue;
        const activeValues = opt.values.filter(isValueActive);
        const current = selected[opt.name];
        const currentExists =
          current && activeValues.some((v) => v.slug === current);
        if (currentExists) continue;
        // Stale or missing selection — reset to default / first active so the
        // customer doesn't see a label that no longer maps to an option.
        const defaultVal = activeValues.find((v) => v.is_default);
        if (defaultVal) {
          selected[opt.name] = defaultVal.slug;
          changed = true;
        } else if (activeValues.length > 0) {
          selected[opt.name] = activeValues[0].slug;
          changed = true;
        } else if (current) {
          delete selected[opt.name];
          changed = true;
        }
      }
      if (!changed) return prev;
      return { ...prev, selected_options: selected };
    });
  }, [options, isMultiSectionFamily]);

  // Seed default variant when the family has variants configured.
  useEffect(() => {
    if (variantOptions.length === 0 || !defaultVariantCode) return;
    setSpec((prev) => {
      const current = prev.selected_options["Variant"];
      if (current && variantOptions.some((v) => v.code === current)) return prev;
      return {
        ...prev,
        selected_options: { ...prev.selected_options, Variant: defaultVariantCode },
      };
    });
  }, [variantOptions, defaultVariantCode]);

  // Seed Document Size from catalog links when the family has NO Document Size
  // product_option row (large-format / custom products). Without this seed the
  // pricing engine falls back to "A4" and picks the wrong click-charge row.
  useEffect(() => {
    if (familyCatalogLinks.length === 0) return;
    const hasSizeOption = options.some(
      (o) => o.name.toLowerCase() === "document size",
    );
    if (hasSizeOption) return;
    const firstCode = familyCatalogLinks[0]?.item_code;
    if (!firstCode) return;
    setSpec((prev) => {
      const existing =
        prev.selected_options["Document Size"] ??
        prev.selected_options["size"];
      if (existing) return prev;
      return {
        ...prev,
        selected_options: {
          ...prev.selected_options,
          "Document Size": firstCode,
        },
      };
    });
  }, [familyCatalogLinks, options]);


  // ── Mirror Print Colour / Print Sides → body section is_color / is_duplex.
  // Only applies to single-section families. The pricing engine reads
  // section-level flags (so per-section mixed-colour bound documents work);
  // for single-section products the global picker is the source of truth and
  // must propagate down to the section row, otherwise picking "Full Colour"
  // or "Black & White" never changes the resolved click rate.
  useEffect(() => {
    if (isMultiSectionFamily) return;
    if (!orderItemId) return;
    if (sections.length === 0) return;
    const colourSlug = spec.selected_options["Print Colour"];
    const sidesSlug = spec.selected_options["Print Sides"];
    const PRINTABLE = new Set(["body", "front_cover", "back_cover"]);
    for (const s of sections) {
      if (!PRINTABLE.has(s.section_type as string)) continue;
      const patch: { id: string; is_color?: boolean; is_duplex?: boolean } = { id: s.id };
      if (colourSlug) {
        const wantColor = colourSlug.toLowerCase() === "colour" || colourSlug.toLowerCase() === "color";
        if (!!s.is_color !== wantColor) patch.is_color = wantColor;
      }
      if (sidesSlug) {
        const sl = sidesSlug.toLowerCase();
        const wantDuplex = sl === "duplex" || sl === "double" || sl === "double_sided";
        if (!!s.is_duplex !== wantDuplex) patch.is_duplex = wantDuplex;
      }
      if (patch.is_color !== undefined || patch.is_duplex !== undefined) {
        updateSectionMut.mutate(patch as any);
      }
    }
    // intentionally exclude updateSectionMut + sections from deps to avoid
    // ping-ponging; we react to the picker values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMultiSectionFamily,
    orderItemId,
    spec.selected_options["Print Colour"],
    spec.selected_options["Print Sides"],
    sections.length,
  ]);

  // ── Auto-split a single multi-page upload into Cover / Body / Cover ──────
  // When the customer picks a *printed* cover for a single uploaded PDF, the
  // print shop needs the first two and last two pages as their own components
  // (heavyweight stock, imposed separately). Fully automatic and silent — the
  // customer never has to slice the file themselves. Reverting to a non-printed
  // cover collapses the sections back to one whole-document body.
  const coverSplitBusyRef = useRef(false);
  useEffect(() => {
    if (!orderItemId) return;
    if (documents.length !== 1) return;
    if (coverSplitBusyRef.current) return;
    const doc = documents[0];
    const pages = doc.page_count ?? 0;
    if (pages <= 0) return;

    const coverOpt = options.find(
      (o) => /cover/i.test(o.name) && !/lamination/i.test(o.name),
    );
    const selectedSlug = coverOpt ? spec.selected_options[coverOpt.name] : undefined;
    const selectedValue =
      coverOpt && isStructuredValues(coverOpt.values)
        ? coverOpt.values.find((v) => v.slug === selectedSlug)
        : undefined;
    const stock = printedCoverStock(selectedValue?.metadata);
    const plan = planCoverSplit(pages);
    if (!plan) return;

    const bodySection = sections.find(
      (s) => s.document_id === doc.id && s.section_type === "body",
    );

    const run = async (fn: () => Promise<void>) => {
      coverSplitBusyRef.current = true;
      try {
        await fn();
      } catch (err) {
        console.error("auto_cover_split_failed", err);
      } finally {
        coverSplitBusyRef.current = false;
      }
    };

    if (stock) {
      if (matchesSplit(sections, doc.id, plan)) return;
      if (!isWholeDocumentBody(sections, doc.id, pages)) return;
      if (!bodySection) return;
      const paperStock = coverStockLabel(stock);
      const coverColour = bodySection.is_color ?? true;
      void run(async () => {
        await updateSectionMut.mutateAsync({
          id: bodySection.id,
          page_range_start: plan.body.start,
          page_range_end: plan.body.end,
          sort_order: 1,
          label: "Body",
        } as any);
        await addSectionMut.mutateAsync({
          order_item_id: orderItemId,
          document_id: doc.id,
          section_type: "front_cover",
          sort_order: 0,
          page_range_start: plan.front.start,
          page_range_end: plan.front.end,
          is_duplex: true,
          is_color: coverColour,
          label: "Front Cover",
          ...(paperStock ? { paper_stock: paperStock } : {}),
          ...(stock.weight_gsm ? { paper_weight_gsm: stock.weight_gsm } : {}),
        } as any);
        await addSectionMut.mutateAsync({
          order_item_id: orderItemId,
          document_id: doc.id,
          section_type: "back_cover",
          sort_order: 2,
          page_range_start: plan.back.start,
          page_range_end: plan.back.end,
          is_duplex: !plan.backIsSimplex,
          is_color: coverColour,
          label: "Back Cover",
          ...(paperStock ? { paper_stock: paperStock } : {}),
          ...(stock.weight_gsm ? { paper_weight_gsm: stock.weight_gsm } : {}),
        } as any);
      });
      return;
    }

    // Non-printed cover selected — undo a previous auto split.
    if (!matchesSplit(sections, doc.id, plan)) return;
    const covers = sections.filter(
      (s) =>
        s.document_id === doc.id &&
        (s.section_type === "front_cover" || s.section_type === "back_cover"),
    );
    if (!bodySection) return;
    void run(async () => {
      for (const c of covers) {
        await deleteSectionMut.mutateAsync({ id: c.id, orderItemId });
      }
      await updateSectionMut.mutateAsync({
        id: bodySection.id,
        page_range_start: 0,
        page_range_end: pages - 1,
        sort_order: 0,
        label: null,
      } as any);
    });
    // Reacts to the cover picker + the uploaded file only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderItemId, documents, sections, options, spec.selected_options]);




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
    const docIsLandscape = docW > docH;
    type Cand = { v: StructuredOptionValue; sameOrientation: boolean };
    const candidates: Cand[] = [];
    for (const v of sizeOpt.values as StructuredOptionValue[]) {
      const meta = (v.metadata ?? {}) as Record<string, any>;
      const w = Number(meta?.width_mm ?? 0);
      const h = Number(meta?.height_mm ?? 0);
      if (!w || !h) continue;
      const portrait = Math.abs(docW - w) <= TOLERANCE && Math.abs(docH - h) <= TOLERANCE;
      const landscape = Math.abs(docW - h) <= TOLERANCE && Math.abs(docH - w) <= TOLERANCE;
      if (!portrait && !landscape) continue;
      // A row's stored orientation: explicit metadata, otherwise inferred
      // from its w/h. Prefer rows whose orientation matches the uploaded
      // PDF (landscape PDF → "a4-landscape", not "a4").
      const rowOrientation = String(meta.orientation ?? (w > h ? "landscape" : "portrait")).toLowerCase();
      const sameOrientation = (docIsLandscape && rowOrientation === "landscape") ||
        (!docIsLandscape && rowOrientation === "portrait");
      candidates.push({ v, sameOrientation });
    }
    const matched = candidates.find((c) => c.sameOrientation)?.v ?? candidates[0]?.v;

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

    // Kind-first fallback (admin-configurable), then slug for legacy rows.
    const kind = getFamilyKind(productFamily as { kind?: string | null; slug?: string | null } | null);
    const KIND_TO_PREVIEW: Record<string, ProductPreviewType> = {
      flat_sheet: "loose_sheets",
      folded_leaflet: "bi_fold",
      saddle_stitched: "saddle_stitched",
      bound_document: "wire_bound",
      business_card: "business_cards",
      large_format: "poster",
      photo_print: "loose_sheets",
      custom: "loose_sheets",
    };
    const slugResult = (productFamily?.slug && SLUG_TO_PREVIEW[productFamily.slug])
      || KIND_TO_PREVIEW[kind]
      || "loose_sheets";
    if (import.meta.env.DEV) console.log("[PreviewType] fallback slug:", productFamily?.slug, "kind:", kind, "→", slugResult);
    return slugResult;
  }, [options, spec.selected_options, productFamily?.slug, productFamily?.kind]);

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

  // Canvas size from selected Document Size option — drives preview scaling.
  // When we already know the uploaded document's true page orientation, prefer
  // that over the option metadata. This lets posters/flyers/business cards
  // honour a landscape upload even when only portrait-flavoured size option
  // values exist (e.g. DOC_SIZE_POSTER has no `a2-landscape` slug).
  const docOrientationForCanvas: "portrait" | "landscape" | null = useMemo(() => {
    const doc = documents.find((d) => d.page_width_mm && d.page_height_mm);
    if (!doc || !doc.page_width_mm || !doc.page_height_mm) return null;
    return Number(doc.page_width_mm) > Number(doc.page_height_mm) ? "landscape" : "portrait";
  }, [documents]);

  const canvasSizeMm = useMemo(() => {
    if (!sizeMeta) return undefined;
    const w = Number(sizeMeta.width_mm ?? 0);
    const h = Number(sizeMeta.height_mm ?? 0);
    if (!w || !h) return undefined;
    const effectiveLandscape = docOrientationForCanvas
      ? docOrientationForCanvas === "landscape"
      : isLandscapeSize;
    if (effectiveLandscape) return { widthMm: Math.max(w, h), heightMm: Math.min(w, h) };
    return { widthMm: Math.min(w, h), heightMm: Math.max(w, h) };
  }, [sizeMeta, isLandscapeSize, docOrientationForCanvas]);

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

  // Block-quantity config (e.g. flyers sold in packs of 50/100/250…)
  // Blocks are keyed by size + paper + sides + qty. We derive the spec's
  // sides from Print Sides (falls back to is_duplex) and filter the ladder
  // to entries matching the current combo — that filtered list is what
  // drives snapping, pricing, and the dropdown in PriceSummary.
  // Master ladder from the family row
  const masterBlocks = useMemo(() => {
    const raw = (productFamily as any)?.quantity_blocks;
    return Array.isArray(raw) ? (raw as QuantityBlock[]) : [];
  }, [productFamily]);

  // Tenant + branch overrides — cascade branch > tenant > master
  const { data: packOverrides = [] } = usePackPricingOverridesForFamily(
    productFamilyId,
    tenantId,
  );
  const tenantOverrideBlocks = useMemo(() => {
    const row = packOverrides.find((r) => r.branch_id === null);
    return (row?.quantity_blocks ?? null) as QuantityBlock[] | null;
  }, [packOverrides]);
  const branchOverrideBlocks = useMemo(() => {
    if (!effectiveBranchId) return null;
    const row = packOverrides.find((r) => r.branch_id === effectiveBranchId);
    return (row?.quantity_blocks ?? null) as QuantityBlock[] | null;
  }, [packOverrides, effectiveBranchId]);

  const allBlocks = useMemo(
    () =>
      resolvePackPricing({
        master: masterBlocks,
        tenant: tenantOverrideBlocks,
        branch: branchOverrideBlocks,
      }),
    [masterBlocks, tenantOverrideBlocks, branchOverrideBlocks],
  );
  const quantityMode = ((productFamily as any)?.quantity_mode ?? "free") as "free" | "blocks";

  const specSize = spec.selected_options?.["Document Size"] ?? null;
  const specPaper = spec.selected_options?.["Paper"] ?? null;
  const specSidesSlug = spec.selected_options?.["Print Sides"] ?? null;
  const specSides: "single" | "double" = useMemo(() => {
    if (specSidesSlug) {
      const s = specSidesSlug.toLowerCase();
      if (s === "duplex" || s === "double" || s === "double_sided") return "double";
      return "single";
    }
    return spec.is_duplex ? "double" : "single";
  }, [specSidesSlug, spec.is_duplex]);

  const quantityBlocks = useMemo(
    () =>
      allBlocks
        .filter(
          (b) =>
            b.sides === specSides &&
            blockMatchesField(b.size, specSize) &&
            blockMatchesField(b.paper, specPaper),
        )
        .slice()
        .sort((a, b) => a.qty - b.qty),
    [allBlocks, specSize, specPaper, specSides, blockMatchesField],
  );
  const blocksActive = quantityMode === "blocks" && quantityBlocks.length > 0;
  // `blocksMode` is broader than `blocksActive`: it stays true whenever the
  // family sells in packs and has ANY ladder rows, even if the current
  // size/paper/sides combo doesn't match a row yet. Used to drive the
  // pack-derived Size/Paper/Sides selectors in OptionsPanel.
  const blocksMode = quantityMode === "blocks" && allBlocks.length > 0;

  const handleQuantityChange = useCallback((qty: number) => {
    if (blocksActive) {
      const snapped =
        quantityBlocks.find((b) => b.qty === qty)?.qty ??
        quantityBlocks.find((b) => b.qty >= qty)?.qty ??
        quantityBlocks[quantityBlocks.length - 1].qty;
      setSpec((prev) => ({ ...prev, quantity: snapped }));
      return;
    }
    setSpec((prev) => ({ ...prev, quantity: qty }));
  }, [blocksActive, quantityBlocks]);

  // Snap to first block if the current quantity isn't a valid block for
  // this size/paper/sides combo (fires on load AND when the customer
  // changes any of those axes).
  useEffect(() => {
    if (!blocksActive) return;
    const valid = quantityBlocks.some((b) => b.qty === spec.quantity);
    if (!valid) {
      const next = quantityBlocks[0].qty;
      setSpec((prev) => ({ ...prev, quantity: next }));
    }
  }, [blocksActive, quantityBlocks, spec.quantity]);

  // Seed Document Size / Paper / Print Sides from the pack ladder for
  // blocks-mode families. When the current selection is missing or doesn't
  // match any ladder row, snap to the first valid value so pricing + the
  // quantity dropdown are never empty on load.
  useEffect(() => {
    if (!blocksMode) return;
    setSpec((prev) => {
      const next = { ...prev.selected_options };
      let changed = false;

      const currentSize = next["Document Size"] ?? null;
      const sizes = Array.from(
        new Set(allBlocks.map((b) => b.size).filter((s) => s && s !== "*")),
      );
      if (sizes.length > 0 && (!currentSize || !sizes.includes(currentSize))) {
        next["Document Size"] = sizes[0];
        changed = true;
      }

      const effSize = next["Document Size"] ?? null;
      const papers = Array.from(
        new Set(
          allBlocks
            .filter((b) => !effSize || b.size === "*" || b.size === effSize)
            .map((b) => b.paper)
            .filter((p) => p && p !== "*"),
        ),
      );
      const currentPaper = next["Paper"] ?? null;
      if (papers.length > 0 && (!currentPaper || !papers.includes(currentPaper))) {
        next["Paper"] = papers[0];
        changed = true;
      }

      const effPaper = next["Paper"] ?? null;
      const sides = Array.from(
        new Set(
          allBlocks
            .filter(
              (b) =>
                (!effSize || b.size === "*" || b.size === effSize) &&
                (!effPaper || b.paper === "*" || b.paper === effPaper),
            )
            .map((b) => b.sides),
        ),
      );
      const currentSides = next["Print Sides"] ?? null;
      const mappedCurrent =
        currentSides === "duplex" || currentSides === "double" || currentSides === "double_sided"
          ? "double"
          : currentSides === "single" || currentSides === "single_sided"
          ? "single"
          : null;
      if (sides.length > 0) {
        const inferred = preferredSides && sides.includes(preferredSides) ? preferredSides : null;
        const target =
          inferred ??
          (mappedCurrent && sides.includes(mappedCurrent) ? mappedCurrent : sides[0]);
        if (currentSides !== target) {
          next["Print Sides"] = target;
          changed = true;
        }
      }

      return changed ? { ...prev, selected_options: next } : prev;
    });
  }, [blocksMode, allBlocks, preferredSides]);


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

  // Build a pricing-aware spec that includes per-section colour/sides for
  // mixed bound documents. Only printable sections (body/cover) feed the
  // click+paper math; tabs and inserts are priced via their own finishing
  // recipe entries.
  const pricingSpec = useMemo<ItemSpec>(() => {
    const PRINTABLE = new Set(["body", "front_cover", "back_cover"]);
    const docPages = (id: string | null | undefined) =>
      documents.find((d) => d.id === id)?.page_count ?? 0;
    // Pages actually consumed by a section. When the section carries an
    // explicit page range (auto cover split slices ONE document into
    // cover/body/cover) we must bill only that slice — otherwise the same
    // 28-page PDF is billed three times over.
    const sectionPages = (s: (typeof sections)[number]) => {
      const total = docPages(s.document_id);
      const start = (s as any).page_range_start as number | null | undefined;
      const end = (s as any).page_range_end as number | null | undefined;
      if (start == null && end == null) return total;
      const from = Math.max(0, start ?? 0);
      const to = Math.min(total - 1, end ?? total - 1);
      return Math.max(0, to - from + 1);
    };
    // "250gsm Silk" → "250gsm-silk" (catalog_papers.code)
    const paperCodeOf = (s: (typeof sections)[number]) => {
      const raw = (s as any).paper_stock as string | null | undefined;
      if (!raw) return null;
      return String(raw).trim().toLowerCase().replace(/\s+/g, "-");
    };
    const specSections = sections
      .filter((s) => PRINTABLE.has(s.section_type as string))
      .map((s) => ({
        label:
          s.section_type === "front_cover"
            ? "Cover"
            : s.section_type === "back_cover"
            ? "Back Cover"
            : "Body",
        page_count: sectionPages(s),
        is_color: !!s.is_color,
        is_duplex: !!s.is_duplex,
        paper_code: paperCodeOf(s),
        paper_weight_gsm: ((s as any).paper_weight_gsm ?? null) as number | null,
      }))
      .filter((s) => s.page_count > 0);

    // Append tab dividers as zero-page sections labelled "Tab" so the
    // pricing engine can count them toward binding spine selection
    // (each tab is treated as ~2 sheets of bulk) without affecting
    // click/paper billing (which filters out page_count === 0).
    const tabSections = sections
      .filter((s) => s.section_type === "tab")
      .map(() => ({ label: "Tab", page_count: 0, is_color: false, is_duplex: false }));

    // Single-sheet products (flyers/posters/handouts): collapse Front + Back
    // into ONE duplex section so the calculator bills 1 sheet, not 2.
    // Front face uses page 1 of its assigned doc, Back face uses page 1 of
    // its assigned doc — the physical sheet is one piece of paper either way.
    let finalSections: ItemSpecSection[] = specSections;
    if (isSingleSheetFamily && specSections.length > 0) {
      const front = specSections.find((s) => s.label === "Cover");
      const back = specSections.find((s) => s.label === "Back Cover");
      const hasBack = !!back;
      const collapsed: ItemSpecSection = {
        label: undefined,
        page_count: hasBack ? 2 : 1,
        is_color: !!(front?.is_color || back?.is_color),
        is_duplex: hasBack,
      };
      finalSections = [collapsed];
    }


    const all = [...finalSections, ...tabSections];
    return all.length > 0 ? { ...spec, sections: all } : spec;
  }, [spec, sections, documents, isSingleSheetFamily]);



  const computeBreakdown = useCallback(() => {
    const rawEngine = useNewEngine && recipe && rateCard
      ? calculatePriceFromRateCard(pricingSpec, recipe, rateCard, options)
      : null;
    // Rate-card prices are authored in the base currency and carry no
    // currency of their own — convert them for the active currency. Rules
    // based prices already exist per currency.
    const engine = rawEngine
      ? {
          ...rawEngine,
          lines: rawEngine.lines.map((l) => ({
            ...l,
            unit_amount: convertPrice(l.unit_amount),
            total: convertPrice(l.total),
          })),
          subtotal_per_unit: convertPrice(rawEngine.subtotal_per_unit),
          total: convertPrice(rawEngine.total),
        }
      : calculateItemPrice(pricingSpec, options, pricingRules, activeCurrency, cascadedOverrides);
    if (blocksActive) {
      const block =
        quantityBlocks.find((b) => b.qty === pricingSpec.quantity) ??
        quantityBlocks[0];
      const total = convertPrice(block.price_minor / 100);
      const perUnit = total / Math.max(1, block.qty);
      return {
        ...engine,
        subtotal_per_unit: perUnit,
        total,
        lines: [
          {
            label: `Pack of ${block.qty} · ${block.sides === "double" ? "Double-sided" : "Single-sided"}`,
            type: "fixed" as const,
            unit_amount: total,
            multiplier: 1,
            total,
          },
        ],
      };
    }
    return engine;
  }, [useNewEngine, recipe, rateCard, pricingSpec, options, pricingRules, activeCurrency, cascadedOverrides, blocksActive, quantityBlocks, convertPrice]);


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
      const breakdown = computeBreakdown();
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
  }, [orderItem, order, spec, reference, productFamily, sections, computeBreakdown]);

  const handleConfirmAddToCart = useCallback(async () => {
    if (!orderItem || !order || isSubmitting) return;
    const ref = cartReference.trim();
    if (!ref) {
      toast.error("Please enter a reference name");
      return;
    }
    setIsSubmitting(true);
    try {
      const breakdown = computeBreakdown();
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
      navigate(tenantPath("cart"));
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
    guardedNavigate(tenantPath(`orders/${orderId}/files`));
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
  // A row counts as "tabs enabled" when it belongs to the tab_dividers
  // catalogue category (or its slug starts with "tab-") and isn't the
  // explicit "none" row. tab_count / pack_count / colour fall back to
  // sensible defaults so the drawer still opens on rows that haven't been
  // fully annotated in the master catalogue yet.
  const tabInfo = useMemo(() => {
    const tabOpt = options.find((o) => o.name.toLowerCase().includes("tab"));
    if (!tabOpt || !isStructuredValues(tabOpt.values)) return null;
    const key = Object.keys(spec.selected_options).find(
      (k) => k.toLowerCase() === tabOpt.name.toLowerCase()
    ) || tabOpt.name;
    const slug = spec.selected_options[key];
    if (!slug) return null;
    const val = (tabOpt.values as StructuredOptionValue[]).find((v) => v.slug === slug);
    if (!val) return null;
    const meta = (val.metadata ?? {}) as Record<string, any>;
    const isNone =
      meta.none === true ||
      slug === "none" ||
      /(^|[-_])none([-_]|$)/i.test(slug) ||
      /^no[-_ ]/i.test(val.label ?? "");
    if (isNone) return null;
    const looksLikeTab =
      meta.category === "tab_dividers" ||
      /^tab[-_]/i.test(slug) ||
      /tab/i.test(val.label ?? "");
    if (!looksLikeTab) return null;
    const packSize = Number(meta.pack_size ?? 10) || 10;
    const packCount = Number(meta.pack_count ?? 1) || 1;
    const count = Number(meta.tab_count ?? packSize * packCount) || packSize;
    const multiColor = String(meta.color ?? "").toLowerCase() === "multi";
    // Pre-made tab banks are a physical product at one fixed sheet size.
    const sheetSize =
      (typeof meta.sheet_size === "string" && meta.sheet_size.trim()) ||
      (unit === "imperial" ? "Letter" : "A4");
    return { count, packCount, multiColor, sheetSize };
  }, [options, spec.selected_options, unit]);

  // ── Tab dividers pin the document size ──
  // Resolve the Document Size value that matches the tab bank's sheet size
  // (portrait only — the tab protrusion sits on the long edge).
  const tabSizeLock = useMemo(() => {
    if (!tabInfo) return null;
    const sizeOpt = options.find((o) => o.name.toLowerCase() === "document size");
    if (!sizeOpt || !isStructuredValues(sizeOpt.values)) return null;
    const target = tabInfo.sheetSize.toLowerCase().replace(/\s+/g, "-");
    const match = (sizeOpt.values as StructuredOptionValue[]).find((v) => {
      const meta = (v.metadata ?? {}) as Record<string, any>;
      const slug = (v.slug ?? "").toLowerCase();
      const iso = String(meta.iso ?? "").toLowerCase();
      const isLandscape =
        meta.orientation === "landscape" || /landscape/.test(slug) || /landscape/i.test(v.label ?? "");
      if (isLandscape) return false;
      return slug === target || iso === target || slug.replace(/-portrait$/, "") === target;
    });
    if (!match) return { optionName: sizeOpt.name, slug: null, label: tabInfo.sheetSize };
    return { optionName: sizeOpt.name, slug: match.slug, label: match.label };
  }, [tabInfo, options]);

  // Coerce the selected size to the tab-compatible one when tabs turn on.
  const tabSizeToastRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tabSizeLock?.slug) return;
    const key =
      Object.keys(spec.selected_options).find((k) => k.toLowerCase() === "document size") ||
      tabSizeLock.optionName;
    const current = spec.selected_options[key];
    if (current === tabSizeLock.slug) return;
    setSpec((prev) => ({
      ...prev,
      selected_options: { ...prev.selected_options, [key]: tabSizeLock.slug as string },
    }));
    if (current && tabSizeToastRef.current !== tabSizeLock.slug) {
      tabSizeToastRef.current = tabSizeLock.slug;
      toast.info(
        `Document size set to ${tabSizeLock.label} — pre-made tab dividers are only available at that size.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabSizeLock, spec.selected_options]);


  // ── Derive insert info from product options ──
  const insertEnabled = useMemo(() => {
    // Match "Inserts" specifically — never "Tab Dividers" (which also
    // contains the word "divider"). Prefer exact-ish names, then a
    // contains-"insert" fallback that excludes anything tab-related.
    const lower = (s: string) => s.toLowerCase();
    const insertOpt =
      options.find((o) => lower(o.name) === "inserts") ||
      options.find((o) => lower(o.name) === "insert") ||
      options.find((o) => lower(o.name).includes("insert") && !lower(o.name).includes("tab"));
    if (!insertOpt || !isStructuredValues(insertOpt.values)) return false;
    const key = Object.keys(spec.selected_options).find(
      (k) => k.toLowerCase() === insertOpt.name.toLowerCase()
    ) || insertOpt.name;
    const slug = spec.selected_options[key];
    if (!slug) return false;
    const val = (insertOpt.values as StructuredOptionValue[]).find((v) => v.slug === slug);
    const meta = (val?.metadata ?? {}) as Record<string, any>;
    if (meta.none === true) return false;
    if (slug === "none" || slug === "no-inserts" || slug === "no_inserts") return false;
    if (/(^|[-_])none([-_]|$)/i.test(slug)) return false;
    return true;
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

  

  // ── Cleanup: when tabs/inserts are turned off, remove their sections so the preview matches ──
  useEffect(() => {
    if (!orderItemId) return;
    if (!tabInfo) {
      const stale = sections.filter((s) => s.section_type === "tab");
      if (stale.length > 0) {
        stale.forEach((s) => {
          deleteSectionMut.mutate({ id: s.id, orderItemId });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabInfo, orderItemId]);

  useEffect(() => {
    if (!orderItemId) return;
    if (!insertEnabled) {
      const stale = sections.filter((s) => s.section_type === "insert");
      if (stale.length > 0) {
        stale.forEach((s) => {
          deleteSectionMut.mutate({ id: s.id, orderItemId });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertEnabled, orderItemId]);



  // ── Tab/Insert callbacks using page_range_start as anchor ──
  const handleAddTab = useCallback(async (afterPage: number, label?: string, bankPosition?: number) => {
    if (!orderItemId) return;
    const maxSort = sections.reduce((max, s) => Math.max(max, s.sort_order), 0);
    // Auto-assign the next free physical slot (1..10) when caller doesn't
    // specify one, so we always honour the pre-made pack ordering.
    const used = new Set(
      sections
        .filter((s) => s.section_type === "tab")
        .map((s) => (s as any).bank_position)
        .filter((v): v is number => typeof v === "number"),
    );
    let resolvedPos = bankPosition;
    if (resolvedPos == null) {
      for (let i = 1; i <= 50; i++) {
        if (!used.has(i)) { resolvedPos = i; break; }
      }
    }
    await addSectionMut.mutateAsync({
      order_item_id: orderItemId,
      section_type: "tab",
      sort_order: maxSort + 1,
      document_id: null,
      page_range_start: afterPage,
      bank_position: resolvedPos ?? null,
      ...(label ? { label } : {}),
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

  const handleUpdateTabBankPosition = useCallback(async (sectionId: string, bankPosition: number) => {
    await updateSectionMut.mutateAsync({ id: sectionId, bank_position: bankPosition } as any);
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
        <Button onClick={() => navigate(tenantPath(`orders/${orderId}/files`))}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Go to Upload Files
        </Button>
      </div>
    );
  }

  return (
    <div className="md:-m-6 xl:-m-8 md:p-3 xl:p-4 md:h-[calc(100%+3rem)] xl:h-[calc(100%+4rem)] flex flex-col space-y-3 md:space-y-2 min-h-0">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h1 className="text-base md:text-lg font-bold text-foreground leading-tight">
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
          className="self-start sm:self-auto"
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
              familySlug={productFamily?.slug ?? undefined}
              packBlocks={allBlocks}
              blocksActive={blocksMode}
              allowedSides={allowedSides}
              variants={variantOptions}
              suppressPriceDeltaFor={(() => {
                const slug = (productFamily?.slug ?? "").toLowerCase();
                if (slug === "business-cards" || slug === "business_cards") {
                  return ["Lamination", "Corner Style", "Paper Stock", "Pack Size"];
                }
                return undefined;
              })()}
              lockedDisplay={(() => {
                // Tab dividers pin the sheet size for every family that offers them.
                if (tabSizeLock?.slug) {
                  return {
                    [tabSizeLock.optionName]: {
                      label: tabSizeLock.label,
                      helper: `Locked to ${tabSizeLock.label} — pre-made tab dividers are only available at this size. Remove tabs to change the size.`,
                    },
                  };
                }
                const slug = (productFamily?.slug ?? "").toLowerCase();
                if (slug !== "business-cards" && slug !== "business_cards") return undefined;
                const doc = documents.find((d) => d.page_width_mm && d.page_height_mm);
                if (!doc) return undefined;
                const w = Math.round(Number(doc.page_width_mm));
                const h = Math.round(Number(doc.page_height_mm));
                const sizeOpt = options.find((o) => o.name.toLowerCase() === "document size");
                if (!sizeOpt) return undefined;
                return {
                  [sizeOpt.name]: {
                    label: `${w} × ${h} mm`,
                    helper:
                      "Detected from your uploaded PDF. Business cards are produced at the file's trim size to avoid scaling artefacts.",
                  },
                };
              })()}
            />

            {tabInfo && tabSizeLock && !tabSizeLock.slug && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                Pre-made tab dividers are supplied at {tabInfo.sheetSize}. This product has no{" "}
                {tabInfo.sheetSize} size option, so please confirm the tabs will fit before ordering.
              </p>
            )}






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
              spec={pricingSpec}
              options={options}
              rules={pricingRules}
              overrides={cascadedOverrides}
              recipe={useNewEngine ? recipe : null}
              rateCard={useNewEngine ? rateCard : null}
              quantityMode={quantityMode}
              quantityBlocks={quantityBlocks}
              allowedSides={allowedSides}
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
        packCount={tabInfo?.packCount ?? 0}
        isMultiColor={tabInfo?.multiColor ?? false}
        onAddTab={handleAddTab}
        onDeleteTab={handleDeleteTab}
        onMoveTab={handleMoveTab}
        onUpdateTabLabel={handleUpdateTabLabel}
        onUpdateTabBankPosition={handleUpdateTabBankPosition}
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
