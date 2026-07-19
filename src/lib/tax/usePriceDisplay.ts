/**
 * Shared VAT-aware display helper.
 *
 * ── System of record ──────────────────────────────────────────────
 * Every price computed by the pricing engine, stored on orders /
 * order_items / quote_items, and shown in admin/branch editors is
 * held in the **net (ex-VAT)** currency amount. VAT is applied at
 * display time for customer-facing surfaces (configurator price
 * summary, cart, checkout, confirmation, invoices).
 *
 * ── Rounding rules ────────────────────────────────────────────────
 * Per-line VAT uses banker-style 2dp rounding for display.
 * Order-level totals are computed from the sum of net lines *first*
 * so the header total never drifts from the sum of its rows.
 */
import { useQuery } from "@tanstack/react-query";
import { resolveBranchTax, computeVat, DEFAULT_TAX, type ResolvedTax } from "./resolveBranchTax";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";

export interface PriceDisplay {
  tax: ResolvedTax;
  /** Convert an engine (net) amount to the gross amount shown to customers. */
  toGross: (net: number) => number;
  /** Convert a gross amount back to the underlying net amount. */
  toNet: (gross: number) => number;
  /** VAT portion for a given net amount. */
  vatOf: (net: number) => number;
  /** True when VAT is being charged and should be shown as a breakdown line. */
  showVatBreakdown: boolean;
  /**
   * Suffix appended after customer-facing prices, e.g. "incl. VAT" or "".
   * Empty when tax is disabled.
   */
  inclSuffix: string;
  /** Suffix for admin/net contexts, e.g. "ex VAT". */
  exSuffix: string;
  /** Human label for the VAT row ("VAT (15%)"). */
  vatLineLabel: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function buildDisplay(tax: ResolvedTax): PriceDisplay {
  const enabled = tax.enabled && tax.rate > 0;
  const rate = tax.rate / 100;

  const toGross = (net: number) => {
    if (!enabled) return net;
    if (tax.inclusive) return net; // net already IS the gross customer sees
    return round2(net * (1 + rate));
  };

  const toNet = (gross: number) => {
    if (!enabled) return gross;
    if (tax.inclusive) return round2(gross / (1 + rate));
    return gross;
  };

  const vatOf = (net: number) => (enabled ? computeVat(tax.inclusive ? toGross(net) : net, tax) : 0);

  return {
    tax,
    toGross,
    toNet,
    vatOf,
    showVatBreakdown: enabled,
    inclSuffix: enabled ? `incl. ${tax.label}` : "",
    exSuffix: enabled ? `ex ${tax.label}` : "",
    vatLineLabel: enabled ? `${tax.label} (${tax.rate}%)` : tax.label,
  };
}

/**
 * Hook: resolve the effective tax config for the customer's active branch
 * (falls back to tenant defaults, then to DEFAULT_TAX) and expose helpers
 * for formatting VAT-aware prices.
 */
export function usePriceDisplay(): PriceDisplay {
  const { tenantId } = useTenantContext();
  const { activeBranch } = useBranch();
  const { data } = useQuery({
    queryKey: ["resolved-tax", tenantId, activeBranch?.id ?? null],
    queryFn: () => resolveBranchTax(tenantId ?? null, activeBranch?.id ?? null),
    enabled: !!tenantId,
    staleTime: 60_000,
  });
  return buildDisplay(data ?? DEFAULT_TAX);
}

/**
 * Non-hook variant: build a display helper from an already-resolved
 * ResolvedTax object. Used by non-React code paths and by admin surfaces
 * that resolve tax against a specific branch, not the active one.
 */
export function priceDisplayFromTax(tax: ResolvedTax): PriceDisplay {
  return buildDisplay(tax);
}
