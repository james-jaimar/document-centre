import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { useOrderData, useUpdateOrderItemSpec, useConfirmOrderItem, useAddSection, useUpdateSection, useDeleteSection } from "@/hooks/useOrderBuilder";
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
import { ArrowLeft, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse";

export default function OrderBuild() {
  const { id: orderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { order, orderItem, documents, sections, loading } =
    useOrderData(orderId);
  const updateSpec = useUpdateOrderItemSpec();
  const confirmItem = useConfirmOrderItem();
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


  // Fetch pricing rules for this product family
  const { data: pricingRules = [] } = useQuery({
    queryKey: ["pricing_rules", productFamilyId],
    queryFn: async () => {
      if (!productFamilyId) return [];
      const { data, error } = await supabase
        .from("pricing_rules")
        .select("*")
        .eq("product_family_id", productFamilyId)
        .eq("is_active", true)
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

  // useBlocker intercepts ALL navigation (sidebar, back button, etc.) when dirty
  const blocker = useBlocker(dirty);

  // Sync spec from DB on load
  useEffect(() => {
    if (orderItem?.spec) {
      const s = orderItem.spec as unknown as ItemSpec;
      const newSpec = {
        page_count: s.page_count ?? 0,
        quantity: s.quantity ?? 1,
        is_color: s.is_color ?? true,
        is_duplex: s.is_duplex ?? true,
        selected_options: s.selected_options ?? {},
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
  useEffect(() => {
    if (options.length === 0) return;
    setSpec((prev) => {
      const selected = { ...prev.selected_options };
      let changed = false;
      for (const opt of options) {
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

    console.log("[PreviewType] options count:", options.length, "bindingOption:", bindingOption?.name, "selectedSlug:", selectedBindingSlug);

    if (bindingOption && selectedBindingSlug && isStructuredValues(bindingOption.values)) {
      const matchedValue = (bindingOption.values as StructuredOptionValue[]).find(
        (v) => v.slug === selectedBindingSlug
      );
      const bindingMethod = matchedValue?.metadata?.binding_method as string | undefined;
      console.log("[PreviewType] matchedValue:", matchedValue?.label, "bindingMethod:", bindingMethod);
      if (bindingMethod && BINDING_METHOD_TO_PREVIEW[bindingMethod]) {
        return BINDING_METHOD_TO_PREVIEW[bindingMethod];
      }
    }
    const slugResult = (productFamily?.slug && SLUG_TO_PREVIEW[productFamily.slug]) || "loose_sheets";
    console.log("[PreviewType] falling back to slug:", productFamily?.slug, "→", slugResult);
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

  const handleAddToCart = useCallback(async () => {
    if (!orderItem || !order) return;
    await handleSave();
    try {
      const breakdown = calculateItemPrice(spec, options, pricingRules);
      await confirmItem.mutateAsync({
        orderItemId: orderItem.id,
        orderId: order.id,
        title: reference.trim() || productFamily?.name || "Document",
        unitPrice: breakdown.subtotal_per_unit,
        quantity: spec.quantity,
        totalPrice: breakdown.total,
      });
      toast.success("Added to cart!");
      navigate("/dashboard/orders");
    } catch (err: any) {
      toast.error("Failed to add to cart", { description: err.message });
    }
  }, [handleSave, navigate, orderItem, order, spec, options, pricingRules, productFamily, confirmItem, reference]);

  // Navigation guard — intercept all navigation via useBlocker
  const handleBackToFiles = useCallback(() => {
    navigate(`/dashboard/orders/${orderId}/files`);
  }, [orderId, navigate]);

  const handleSaveAndLeave = useCallback(async (ref: string) => {
    if (!orderItem) return;
    try {
      await updateSpec.mutateAsync({ id: orderItem.id, spec });
      await supabase.from("order_items").update({ title: ref.trim() || null } as any).eq("id", orderItem.id);
      blocker.proceed?.();
    } catch (err: any) {
      toast.error("Failed to save", { description: err.message });
    }
  }, [orderItem, spec, updateSpec, blocker]);

  const handleDiscardAndLeave = useCallback(() => {
    blocker.proceed?.();
  }, [blocker]);

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

  // Track whether tabs/inserts have been enabled (for pulse highlight on button)
  useEffect(() => {
    const prev = prevTabInsertRef.current;
    prev.hadTabs = !!tabInfo;
    prev.hadInserts = insertEnabled;
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

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Configure Your Document
          </h1>
          <p className="text-muted-foreground mt-1">
            Step 2 of 2 — Select your options and review the preview
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={handleBackToFiles}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Files
        </Button>
      </div>

      {/* Split panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_1fr] xl:grid-cols-[340px_1fr] gap-4 xl:gap-6 min-h-0">
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
              onAddToCart={handleAddToCart}
            />
          </div>
        </div>

        {/* Right: Preview */}
        <div className="border border-border rounded-lg bg-card p-4 overflow-auto">
          <PreviewPanel documents={documents} sections={sections} productType={productType} effects={previewEffects} />
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
        open={blocker.state === "blocked"}
        defaultReference={reference}
        onSave={handleSaveAndLeave}
        onDiscard={handleDiscardAndLeave}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  );
}
