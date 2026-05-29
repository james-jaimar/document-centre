import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Check, AlertCircle, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantSubscriptions } from "@/hooks/useTenantSubscriptions";
import { formatPrice } from "@/lib/formatCurrency";
import { BranchSubscriptionsOverview } from "@/components/admin/branches/BranchSubscriptionsOverview";
import { TenantPlanAssignmentCard } from "@/components/admin/billing/TenantPlanAssignmentCard";

interface PricingRegion {
  id: string;
  region_code: string;
  region_label: string;
  currency_code: string;
  currency_symbol: string;
}

interface PricingPlan {
  id: string;
  plan_slug: string;
  plan_name: string;
  price: number;
  stripe_price_id: string | null;
  region_id: string;
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  canceled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  incomplete: "bg-muted text-muted-foreground",
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  free: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  manual: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export function BillingTab() {
  const { tenantId } = useTenantContext();
  const { data: allSubscriptions, isLoading: subsLoading } = useTenantSubscriptions();
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const subscription = allSubscriptions?.find((s) => s.tenant_id === tenantId);

  // Fetch the region for the subscription
  const { data: region } = useQuery({
    queryKey: ["platform_pricing_region", subscription?.region_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_regions")
        .select("*")
        .eq("id", subscription!.region_id!)
        .single();
      if (error) throw error;
      return data as PricingRegion;
    },
    enabled: !!subscription?.region_id,
  });

  // Fetch the assigned plan details
  const { data: assignedPlan } = useQuery({
    queryKey: ["assigned_plan", subscription?.region_id, subscription?.assigned_plan_slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_plans")
        .select("*")
        .eq("region_id", subscription!.region_id!)
        .eq("plan_slug", subscription!.assigned_plan_slug!)
        .maybeSingle();
      if (error) throw error;
      return data as PricingPlan | null;
    },
    enabled: !!subscription?.region_id && !!subscription?.assigned_plan_slug,
  });

  // Handle checkout return toasts
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toast.success("Payment completed — your subscription is now active!");
      setSearchParams({}, { replace: true });
    } else if (checkout === "cancelled") {
      toast.info("Payment was cancelled");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Calculate display price
  const basePrice = assignedPlan?.price || 0;
  let finalPrice = basePrice;
  if (subscription?.discount_value && subscription.discount_value > 0) {
    if (subscription.discount_type === "percentage") {
      finalPrice = basePrice * (1 - subscription.discount_value / 100);
    } else if (subscription.discount_type === "fixed_amount") {
      finalPrice = Math.max(0, basePrice - subscription.discount_value);
    }
  }
  const currencyCode = region?.currency_code || "USD";

  const handlePayNow = async () => {
    if (!assignedPlan?.stripe_price_id || !tenantId) return;
    setLoading(true);
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          tenant_id: tenantId,
          price_id: assignedPlan.stripe_price_id,
          success_url: `${origin}/admin/settings?tab=billing&checkout=success`,
          cancel_url: `${origin}/admin/settings?tab=billing&checkout=cancelled`,
          // Pass discount info for Stripe coupon creation
          discount_type: subscription?.discount_type || null,
          discount_value: subscription?.discount_value || 0,
          trial_days: subscription?.trial_days || 0,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to start payment");
    } finally {
      setLoading(false);
    }
  };

  const billingStatus = subscription?.billing_status || "pending_payment";
  const isActive = billingStatus === "paid" || billingStatus === "free" || subscription?.status === "active";
  const isPendingPayment = billingStatus === "pending_payment" && subscription?.assigned_plan_slug;
  const noSubscription = !subscription || (!subscription.assigned_plan_slug && subscription.status === "trialing");

  return (
    <div className="space-y-6">
      {/* Current Subscription Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5" />
            Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading subscription details…
            </div>
          ) : noSubscription ? (
            /* No subscription assigned */
            <div className="text-center py-8 space-y-3">
              <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-lg font-medium">No subscription assigned</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Your account doesn't have a subscription plan yet. Please contact your platform administrator to set up your subscription.
              </p>
            </div>
          ) : isPendingPayment ? (
            /* Plan assigned, awaiting payment */
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-900 dark:text-amber-200">
                      Subscription ready — payment required
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      Your <strong className="capitalize">{subscription.assigned_plan_slug?.replace("_", "-")}</strong> plan
                      {region ? ` (${region.region_label})` : ""} has been set up. Complete payment to activate your subscription.
                    </p>
                  </div>
                </div>
              </div>

              {/* Plan details card */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold capitalize">
                      {subscription.assigned_plan_slug?.replace("_", "-")}
                    </p>
                    {region && (
                      <p className="text-sm text-muted-foreground">{region.region_label}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={statusColors.pending_payment}>
                    Pending Payment
                  </Badge>
                </div>

                {/* Pricing breakdown */}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Base price</span>
                    <span>{formatPrice(basePrice, currencyCode)}/mo</span>
                  </div>
                  {subscription.discount_value && subscription.discount_value > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400">
                      <span>Discount</span>
                      <span>
                        {subscription.discount_type === "percentage"
                          ? `−${subscription.discount_value}%`
                          : `−${formatPrice(subscription.discount_value, currencyCode)}`}
                      </span>
                    </div>
                  )}
                  {subscription.trial_days && subscription.trial_days > 0 && (
                    <div className="flex justify-between text-blue-600 dark:text-blue-400">
                      <span>Free trial</span>
                      <span>{subscription.trial_days} days</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <span>Amount due</span>
                    <span>{formatPrice(finalPrice, currencyCode)}/mo</span>
                  </div>
                </div>

                {/* Pay Now button */}
                {assignedPlan?.stripe_price_id ? (
                  <Button onClick={handlePayNow} disabled={loading} size="lg" className="w-full">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Pay Now
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 py-2">
                    <AlertCircle className="h-4 w-4" />
                    Payment processing is being set up. Please try again shortly.
                  </div>
                )}
              </div>
            </div>
          ) : isActive ? (
            /* Active subscription */
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  {billingStatus === "free" ? (
                    <Gift className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  ) : (
                    <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                </div>
                <div>
                  <p className="text-lg font-semibold capitalize">
                    {(subscription?.assigned_plan_slug || subscription?.plan_slug || "starter").replace("_", "-")}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusColors[billingStatus] || statusColors.paid}>
                      {billingStatus === "free" ? "Free" : "Active"}
                    </Badge>
                    {region && (
                      <span className="text-sm text-muted-foreground">{region.region_label}</span>
                    )}
                  </div>
                </div>
              </div>

              {billingStatus !== "free" && assignedPlan && (
                <div className="rounded-md bg-muted/50 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Monthly price</span>
                    <span>{formatPrice(finalPrice, currencyCode)}/mo</span>
                  </div>
                  {subscription?.discount_value && subscription.discount_value > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400">
                      <span>Discount applied</span>
                      <span>
                        {subscription.discount_type === "percentage"
                          ? `${subscription.discount_value}% off`
                          : `${formatPrice(subscription.discount_value, currencyCode)} off`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {subscription?.current_period_end && (
                <p className="text-sm text-muted-foreground">
                  Current period ends{" "}
                  {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
              {subscription?.current_period_start && (
                <p className="text-sm text-muted-foreground">
                  Started{" "}
                  {new Date(subscription.current_period_start).toLocaleDateString()}
                </p>
              )}
              {subscription?.cancelled_at && (
                <p className="text-sm text-destructive">
                  Cancelled on{" "}
                  {new Date(subscription.cancelled_at).toLocaleDateString()}
                </p>
              )}
            </div>
          ) : (
            /* Fallback: some other state */
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold capitalize">
                  {(subscription?.plan_slug || "starter").replace("_", "-")}
                </span>
                <Badge variant="outline" className={statusColors[subscription?.status || ""] || ""}>
                  {subscription?.status || "unknown"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Contact your platform administrator for subscription assistance.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <BranchSubscriptionsOverview />
    </div>
  );
}
