import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { useCurrencyConverter } from "@/hooks/useCurrencyProfiles";
import { formatPrice } from "@/lib/formatCurrency";

/**
 * Formats catalogue prices (authored in the pivot currency) for the
 * storefront's active display currency.
 */
export function useStorefrontPrice() {
  const { region, baseCurrency } = useRegionalPricing();
  const currency = region?.currency_code ?? baseCurrency ?? "ZAR";
  const { convert } = useCurrencyConverter(currency, baseCurrency);

  return {
    currency,
    convert,
    format: (majorAmount: number | null | undefined) =>
      majorAmount == null ? null : formatPrice(convert(majorAmount), currency),
  };
}
