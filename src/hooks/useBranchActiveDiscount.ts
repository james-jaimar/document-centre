import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BranchSubscription } from "./useBranchSubscriptions";

export interface ResolvedDiscount {
  label: string;                 // "R250.00 off/month for the first 3 months"
  firstPeriodPrice: number | null; // discounted monthly price in plan currency
  standardPrice: number;         // full monthly price
  currency: string;              // ISO code, e.g. "ZAR"
  currencySymbol: string;        // e.g. "R"
  durationMonths: number | null; // null = forever, 1 = once, N = repeating
  code?: string | null;
  source: "promo" | "stripe";
}

function fmtMoney(n: number, symbol: string, code: string) {
  return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`.trim();
}

function buildLabel(input: {
  percentOff?: number | null;
  amountOff?: number | null; // in plan currency (not minor units)
  currencySymbol: string;
  currencyCode: string;
  durationMonths: number | null;
}) {
  const { percentOff, amountOff, currencySymbol, currencyCode, durationMonths } = input;
  const off = percentOff
    ? `${percentOff}% off`
    : amountOff
    ? `${fmtMoney(amountOff, currencySymbol, currencyCode)} off`
    : "Discount";
  if (durationMonths == null) return `${off} every month — forever`;
  if (durationMonths === 1) return `${off} — first month only`;
  return `${off}/month for the first ${durationMonths} months`;
}

export function useBranchActiveDiscount(
  subscription: BranchSubscription | null | undefined,
  assignedPlan: any | null | undefined,
) {
  const planPrice = assignedPlan?.price != null ? Number(assignedPlan.price) : null;
  const currencyCode: string = assignedPlan?.region?.currency_code || "ZAR";
  const currencySymbol: string = assignedPlan?.region?.currency_symbol || "R";
  const tenantId = subscription?.tenant_id;

  // Subscription-level promo (tenant-admin-assigned) takes precedence.
  const subDiscountType = subscription?.discount_type || null;
  const subDiscountValue = subscription?.discount_value != null ? Number(subscription.discount_value) : null;
  const hasSubDiscount = !!subDiscountType && !!subDiscountValue && subDiscountValue > 0;

  // Otherwise, look up the plan-level Stripe coupon.
  const stripeCouponId: string | null = assignedPlan?.stripe_coupon_id || null;
  const stripePromotionCodeId: string | null = assignedPlan?.stripe_promotion_code_id || null;
  const needsStripeLookup = !hasSubDiscount && (!!stripeCouponId || !!stripePromotionCodeId);

  return useQuery({
    queryKey: [
      "branch_active_discount",
      subscription?.id,
      subDiscountType,
      subDiscountValue,
      stripeCouponId,
      stripePromotionCodeId,
      planPrice,
      currencyCode,
    ],
    enabled: !!subscription && !!assignedPlan && (hasSubDiscount || needsStripeLookup),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ResolvedDiscount | null> => {
      if (planPrice == null) return null;

      if (hasSubDiscount && subDiscountType && subDiscountValue) {
        // Free months → treat as 100% off for that many months.
        if (subDiscountType === "free_months") {
          return {
            label: buildLabel({ percentOff: 100, currencySymbol, currencyCode, durationMonths: subDiscountValue }),
            firstPeriodPrice: 0,
            standardPrice: planPrice,
            currency: currencyCode,
            currencySymbol,
            durationMonths: subDiscountValue,
            source: "promo",
          };
        }
        if (subDiscountType === "percentage") {
          const first = Math.max(0, planPrice * (1 - subDiscountValue / 100));
          return {
            label: buildLabel({ percentOff: subDiscountValue, currencySymbol, currencyCode, durationMonths: null }),
            firstPeriodPrice: first,
            standardPrice: planPrice,
            currency: currencyCode,
            currencySymbol,
            durationMonths: null,
            source: "promo",
          };
        }
        if (subDiscountType === "fixed_amount") {
          const first = Math.max(0, planPrice - subDiscountValue);
          return {
            label: buildLabel({ amountOff: subDiscountValue, currencySymbol, currencyCode, durationMonths: null }),
            firstPeriodPrice: first,
            standardPrice: planPrice,
            currency: currencyCode,
            currencySymbol,
            durationMonths: null,
            source: "promo",
          };
        }
      }

      if (needsStripeLookup) {
        try {
          const { data, error } = await supabase.functions.invoke("stripe-verify-price", {
            body: {
              coupon_id: stripeCouponId || undefined,
              promotion_code_id: stripePromotionCodeId || undefined,
              tenant_id: tenantId,
            },
          });
          if (error) throw error;
          const coupon = (data as any)?.coupon;
          const promo = (data as any)?.promotion_code;
          if (!coupon || coupon.valid === false) return null;

          const percentOff: number | null = coupon.percent_off ?? null;
          // amount_off from Stripe is in minor units (cents).
          const amountOff: number | null = coupon.amount_off != null ? Number(coupon.amount_off) / 100 : null;
          const durationMonths =
            coupon.duration === "forever"
              ? null
              : coupon.duration === "once"
              ? 1
              : Number(coupon.duration_in_months) || null;

          let first: number | null = null;
          if (percentOff != null) first = Math.max(0, planPrice * (1 - percentOff / 100));
          else if (amountOff != null) first = Math.max(0, planPrice - amountOff);

          return {
            label: buildLabel({ percentOff, amountOff, currencySymbol, currencyCode, durationMonths }),
            firstPeriodPrice: first,
            standardPrice: planPrice,
            currency: currencyCode,
            currencySymbol,
            durationMonths,
            code: promo?.code ?? null,
            source: "stripe",
          };
        } catch (e) {
          // Silent fallback — never block the Subscribe flow.
          console.warn("useBranchActiveDiscount: stripe lookup failed", e);
          return null;
        }
      }

      return null;
    },
  });
}
