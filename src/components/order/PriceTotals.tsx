/**
 * Shared VAT-aware totals block used by Cart, Checkout, Order
 * Confirmation, Order Detail and the Quote detail pages.
 *
 * Inputs are always **net** (ex-VAT). The component adds the VAT
 * breakdown line and the incl-VAT grand total when the branch has
 * VAT enabled.
 */
import { formatPrice } from "@/lib/formatCurrency";
import { usePriceDisplay } from "@/lib/tax/usePriceDisplay";

interface Props {
  currency: string;
  /** Sum of net line totals (unit_price * qty), before delivery/discount. */
  subtotalNet: number;
  /** Delivery is added AFTER the item subtotal, VAT applied on top. */
  deliveryNet?: number;
  /** Positive number — subtracted from the item subtotal before VAT. */
  discountNet?: number;
  /** Optional extra rows rendered above the VAT/Total split. */
  extras?: React.ReactNode;
  /** Compact mode for small side-panels (Checkout). */
  compact?: boolean;
}

export default function PriceTotals({
  currency,
  subtotalNet,
  deliveryNet = 0,
  discountNet = 0,
  extras,
  compact = false,
}: Props) {
  const { tax, showVatBreakdown, vatOf, vatLineLabel, inclSuffix } = usePriceDisplay();

  const itemsAfterDiscount = Math.max(0, subtotalNet - discountNet);
  const netTotal = itemsAfterDiscount + deliveryNet;
  const vatAmount = showVatBreakdown ? vatOf(netTotal) : 0;
  // When the tenant runs VAT-inclusive, the engine's "net" already IS the
  // gross number, so the grand total equals netTotal. When exclusive, add
  // VAT on top.
  const grandTotal = tax.inclusive ? netTotal : netTotal + vatAmount;

  const rowCls = compact ? "text-sm" : "text-sm";
  const totalCls = compact ? "text-base" : "text-lg";

  return (
    <div className="space-y-1.5">
      <div className={`flex justify-between ${rowCls}`}>
        <span className="text-muted-foreground">
          Subtotal {showVatBreakdown && <span className="text-[11px]">(ex {tax.label})</span>}
        </span>
        <span className="font-mono text-foreground">{formatPrice(subtotalNet, currency)}</span>
      </div>

      {extras}

      {deliveryNet > 0 && (
        <div className={`flex justify-between ${rowCls}`}>
          <span className="text-muted-foreground">Delivery</span>
          <span className="font-mono text-foreground">{formatPrice(deliveryNet, currency)}</span>
        </div>
      )}

      {discountNet > 0 && (
        <div className={`flex justify-between ${rowCls}`}>
          <span className="text-emerald-700 dark:text-emerald-400">Discount</span>
          <span className="font-mono text-emerald-700 dark:text-emerald-400">
            −{formatPrice(discountNet, currency)}
          </span>
        </div>
      )}

      {showVatBreakdown && (
        <div className={`flex justify-between ${rowCls}`}>
          <span className="text-muted-foreground">{vatLineLabel}</span>
          <span className="font-mono text-foreground">{formatPrice(vatAmount, currency)}</span>
        </div>
      )}

      <div className={`flex justify-between pt-1.5 border-t border-border font-bold ${totalCls}`}>
        <span className="text-foreground">Total {showVatBreakdown && <span className="text-[11px] font-normal text-muted-foreground">{inclSuffix}</span>}</span>
        <span className="font-mono text-foreground">{formatPrice(grandTotal, currency)}</span>
      </div>
    </div>
  );
}
