import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOrderData, useUpdateOrderItemSpec } from "@/hooks/useOrderBuilder";
import { useProductOptions } from "@/hooks/useProductOptions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ItemSpec } from "@/lib/calculatePrice";
import { isStructuredValues, type StructuredOptionValue } from "@/lib/productOptionTypes";
import type { ProductPreviewType } from "@/components/preview/previewTypes";
import OptionsPanel from "@/components/order/OptionsPanel";
import PreviewPanel from "@/components/order/PreviewPanel";
import PriceSummary from "@/components/order/PriceSummary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function OrderBuild() {
  const { id: orderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { order, orderItem, documents, sections, loading } =
    useOrderData(orderId);
  const updateSpec = useUpdateOrderItemSpec();

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

  // Sync spec from DB on load
  useEffect(() => {
    if (orderItem?.spec) {
      const s = orderItem.spec as unknown as ItemSpec;
      setSpec({
        page_count: s.page_count ?? 0,
        quantity: s.quantity ?? 1,
        is_color: s.is_color ?? true,
        is_duplex: s.is_duplex ?? true,
        selected_options: s.selected_options ?? {},
      });
    }
  }, [orderItem?.spec]);

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
    const bindingOption = options.find((o) => o.name === "Binding");
    const selectedBindingSlug = spec.selected_options["Binding"];
    if (bindingOption && selectedBindingSlug && isStructuredValues(bindingOption.values)) {
      const matchedValue = (bindingOption.values as StructuredOptionValue[]).find(
        (v) => v.slug === selectedBindingSlug
      );
      const bindingMethod = matchedValue?.metadata?.binding_method as string | undefined;
      if (bindingMethod && BINDING_METHOD_TO_PREVIEW[bindingMethod]) {
        return BINDING_METHOD_TO_PREVIEW[bindingMethod];
      }
    }
    return (productFamily?.slug && SLUG_TO_PREVIEW[productFamily.slug]) || "loose_sheets";
  }, [options, spec.selected_options, productFamily?.slug]);

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
    await handleSave();
    toast.success("Added to cart!");
    navigate("/dashboard/orders");
  }, [handleSave, navigate]);

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
          onClick={() => navigate(`/dashboard/orders/${orderId}/files`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Files
        </Button>
      </div>

      {/* Split panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 min-h-0">
        {/* Left: Options */}
        <div className="flex flex-col overflow-auto border border-border rounded-lg bg-card">
          <div className="p-4 border-b border-border shrink-0">
            <h2 className="font-semibold text-foreground">Options</h2>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <OptionsPanel
              options={options}
              selectedOptions={spec.selected_options}
              onOptionChange={handleOptionChange}
            />
          </div>
          <div className="p-4 shrink-0">
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
          <PreviewPanel documents={documents} sections={sections} productType={productType} />
        </div>
      </div>
    </div>
  );
}
