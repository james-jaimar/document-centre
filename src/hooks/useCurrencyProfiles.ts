import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  makeConverter,
  PIVOT_CURRENCY,
  type CurrencyProfile,
} from "@/lib/pricing/convertCurrency";

/**
 * FX rates + buying-power multipliers used to convert rate-card prices
 * (authored in the base currency) into the storefront's display currency.
 */
export function useCurrencyProfiles() {
  return useQuery({
    queryKey: ["pricing_currency_profiles"],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_currency_profiles")
        .select("*")
        .order("currency_code");
      if (error) throw error;
      return (data ?? []) as unknown as CurrencyProfile[];
    },
  });
}

/**
 * Converter from the rate-card base currency into `targetCurrency`.
 * Returns the identity function whenever no conversion is required, so it is
 * always safe to wrap a price in `convert(...)`.
 */
export function useCurrencyConverter(
  targetCurrency: string | null | undefined,
  baseCurrency: string = PIVOT_CURRENCY,
) {
  const { data: profiles = [] } = useCurrencyProfiles();
  const target = (targetCurrency || baseCurrency || PIVOT_CURRENCY).toUpperCase();
  const base = (baseCurrency || PIVOT_CURRENCY).toUpperCase();

  return useMemo(() => {
    const convert = makeConverter(base, target, profiles);
    return {
      convert,
      isConverting: base !== target && profiles.length > 0,
      profiles,
      baseCurrency: base,
      targetCurrency: target,
    };
  }, [base, target, profiles]);
}
