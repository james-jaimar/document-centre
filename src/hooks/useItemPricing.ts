/**
 * Shared pricing wiring used by BOTH the customer configurator
 * (OrderBuild → PriceSummary) and the admin/branch spec quote builder.
 *
 * Consolidates the "cascade branch → tenant → master + pick new rate-card
 * engine when available" logic in one place so a quote for spec X prices
 * identically to the customer-facing configurator for spec X.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateItemPrice,
  calculatePriceFromRateCard,
  type ItemSpec,
  type PriceBreakdown,
} from "@/lib/calculatePrice";
import { useProductPriceOverrides } from "@/hooks/useProductPriceOverrides";
import { useDerivedProductRecipe } from "@/hooks/useDerivedProductRecipe";
import {
  useResolvedRateCardClicks,
  useResolvedRateCardPapers,
  useResolvedRateCardFinishing,
  useResolvedRateCardPhotoPrints,
  useResolvedRateCardBusinessCards,
  useResolvedRateCardPriceBreaksBundle,
} from "@/hooks/useResolvedRateCard";
import { useBindingSpecifications } from "@/hooks/useBindingSpecifications";
import { useCurrencyConverter } from "@/hooks/useCurrencyProfiles";
import type { Tables } from "@/integrations/supabase/types";

type ProductOption = Tables<"product_options">;

interface Args {
  tenantId: string | null | undefined;
  branchId: string | null | undefined;
  productFamilyId: string | null | undefined;
  currency: string;
  spec: ItemSpec;
  options: ProductOption[];
  /**
   * Currency the rate cards are authored in. Rate-card prices carry no
   * currency of their own, so when the storefront is displaying a different
   * currency they are converted with the platform FX + buying-power profile.
   */
  baseCurrency?: string;
}

export interface ItemPricingResult {
  breakdown: PriceBreakdown | null;
  useNewEngine: boolean;
  unitPrice: number;
  total: number;
  rulesCount: number;
}

export function useItemPricing({
  tenantId,
  branchId,
  productFamilyId,
  currency,
  spec,
  options,
  baseCurrency = "ZAR",
}: Args): ItemPricingResult {
  const effectiveBranchId = branchId ?? null;

  // Layer 3 cascade: branch overrides take priority over tenant overrides.
  const { data: branchOverrides = [] } = useProductPriceOverrides(
    tenantId ?? undefined,
    productFamilyId ?? undefined,
    currency,
    effectiveBranchId,
  );
  const { data: tenantOverrides = [] } = useProductPriceOverrides(
    tenantId ?? undefined,
    productFamilyId ?? undefined,
    currency,
    null,
  );
  const cascadedOverrides = useMemo(
    () => [...branchOverrides, ...tenantOverrides],
    [branchOverrides, tenantOverrides],
  );

  // Rate-card engine sources
  const { data: recipe = null } = useDerivedProductRecipe(productFamilyId);
  const rcArgs = {
    tenantId: tenantId ?? undefined,
    branchId: effectiveBranchId ?? undefined,
  };
  const { data: rcClicks = [] } = useResolvedRateCardClicks(rcArgs);
  const { data: rcPapers = [] } = useResolvedRateCardPapers(rcArgs);
  const { data: rcFinishing = [] } = useResolvedRateCardFinishing(rcArgs);
  const { data: rcPhotoPrints = [] } = useResolvedRateCardPhotoPrints(rcArgs);
  const { data: rcBusinessCards = [] } = useResolvedRateCardBusinessCards(rcArgs);
  const { data: bindingSpecs = [] } = useBindingSpecifications();
  const { data: rcPriceBreaks = [] } = useResolvedRateCardPriceBreaksBundle(rcArgs);

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
    [
      rcClicks,
      rcPapers,
      rcFinishing,
      rcPhotoPrints,
      rcBusinessCards,
      bindingSpecs,
      rcPriceBreaks,
    ],
  );

  const useNewEngine =
    !!recipe &&
    (rcClicks.length > 0 ||
      rcPhotoPrints.length > 0 ||
      rcBusinessCards.length > 0);

  // Branch-scoped pricing rules (legacy engine).
  const { data: pricingRules = [] } = useQuery({
    queryKey: [
      "pricing_rules",
      productFamilyId,
      currency,
      effectiveBranchId ?? null,
    ],
    queryFn: async () => {
      if (!productFamilyId) return [];
      let q = supabase
        .from("pricing_rules")
        .select("*")
        .eq("product_family_id", productFamilyId)
        .eq("is_active", true)
        .eq("currency_code", currency)
        .order("sort_order", { ascending: true });
      if (effectiveBranchId) {
        q = q.eq("branch_id", effectiveBranchId);
      } else {
        q = q.is("branch_id", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!productFamilyId,
  });

  // Rate-card tables are single-currency; convert their output when the
  // storefront is showing something other than the base currency.
  const { convert } = useCurrencyConverter(currency, baseCurrency);

  const breakdown = useMemo<PriceBreakdown | null>(() => {
    if (!productFamilyId) return null;
    try {
      if (useNewEngine && recipe) {
        const raw = calculatePriceFromRateCard(spec, recipe, rateCard, options);
        if (!raw) return raw;
        return {
          ...raw,
          lines: raw.lines.map((l) => ({
            ...l,
            unit_price: typeof (l as any).unit_price === "number" ? convert((l as any).unit_price) : (l as any).unit_price,
            amount: typeof (l as any).amount === "number" ? convert((l as any).amount) : (l as any).amount,
          })) as typeof raw.lines,
          subtotal_per_unit: convert(raw.subtotal_per_unit),
          total: convert(raw.total),
        };
      }
      return calculateItemPrice(
        spec,
        options,
        pricingRules as any,
        currency,
        cascadedOverrides,
      );
    } catch {
      return null;
    }
  }, [
    productFamilyId,
    useNewEngine,
    recipe,
    spec,
    rateCard,
    options,
    pricingRules,
    currency,
    cascadedOverrides,
    convert,
  ]);

  return {
    breakdown,
    useNewEngine,
    unitPrice: breakdown?.subtotal_per_unit ?? 0,
    total: breakdown?.total ?? 0,
    rulesCount: (pricingRules as any[]).length,
  };
}
