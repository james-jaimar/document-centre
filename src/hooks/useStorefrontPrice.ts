import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { useCurrencyConverter } from "@/hooks/useCurrencyProfiles";
import { formatPrice } from "@/lib/formatCurrency";
import { usePriceDisplay } from "@/lib/tax/usePriceDisplay";

export function storefrontGrossAmount(
  majorAmount: number,
  convert: (amount: number) => number,
  toGross: (amount: number) => number,
) {
  return toGross(convert(majorAmount));
}

/**
 * Formats catalogue prices (authored in the pivot currency) for the
 * storefront's active display currency.
 */
export function useStorefrontPrice() {
  const { region, baseCurrency } = useRegionalPricing();
  const currency = region?.currency_code ?? baseCurrency ?? "ZAR";
  const { convert } = useCurrencyConverter(currency, baseCurrency);
  const { toGross, inclSuffix, showVatBreakdown } = usePriceDisplay();

  return {
    currency,
    convert,
    inclSuffix,
    showVatBreakdown,
    format: (majorAmount: number | null | undefined) =>
      majorAmount == null
        ? null
        : formatPrice(storefrontGrossAmount(majorAmount, convert, toGross), currency),
  };
}
