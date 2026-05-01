import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CreditCard, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantSubscriptions } from "@/hooks/useTenantSubscriptions";
import type { PlatformPricingPlan } from "@/hooks/useTenantSubscriptions";

interface PricingRegion {
  id: string;
  region_code: string;
  region_label: string;
  currency_code: string;
  currency_symbol: string;
  is_default: boolean;
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  canceled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  incomplete: "bg-muted text-muted-foreground",
};

export function BillingTab() {
  const { tenantId } = useTenantContext();
  const { data: allSubscriptions, isLoading: subsLoading } = useTenantSubscriptions();
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const subscription = allSubscriptions?.find((s) => s.tenant_id === tenantId);

  // Fetch regions
  const { data: regions } = useQuery({
    queryKey: ["platform_pricing_regions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_regions")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as PricingRegion[];
    },
  });

  // Fetch ALL plans for the selected region
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["platform_pricing_plans", "billing", selectedRegionId],
    queryFn: async () => {
      let query = supabase
        .from("platform_pricing_plans")
        .select("*")
        .order("sort_order");
      if (selectedRegionId) query = query.eq("region_id", selectedRegionId);
      const { data, error } = await query;
      if (error) throw error;
      return data as PlatformPricingPlan[];
    },
    enabled: !!selectedRegionId,
  });

  // Auto-select default region
  useEffect(() => {
    if (regions && !selectedRegionId) {
      const defaultRegion = regions.find((r) => r.is_default) || regions[0];
      if (defaultRegion) setSelectedRegionId(defaultRegion.id);
    }
  }, [regions, selectedRegionId]);

  // Handle checkout return toasts
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toast.success("Checkout completed — your subscription will activate shortly");
      setSearchParams({}, { replace: true });
    } else if (checkout === "cancelled") {
      toast.info("Checkout was cancelled");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const selectedRegion = regions?.find((r) => r.id === selectedRegionId);

  const handleCheckout = async () => {
    if (!selectedPriceId || !tenantId) return;
    setLoading(true);
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          tenant_id: tenantId,
          price_id: selectedPriceId,
          success_url: `${origin}/admin/settings?tab=billing&checkout=success`,
          cancel_url: `${origin}/admin/settings?tab=billing&checkout=cancelled`,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to create checkout session");
    } finally {
      setLoading(false);
    }
  };

  const isLoading = subsLoading || plansLoading;

  return (
    <div className="space-y-6">
      {/* Current Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5" />
            Current Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading subscription details…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold capitalize">
                  {(subscription?.plan_slug || "starter").replace("_", "-")}
                </span>
                {subscription ? (
                  <Badge variant="outline" className={statusColors[subscription.status] || ""}>
                    {subscription.status}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">
                    No active subscription
                  </Badge>
                )}
              </div>
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
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Available Plans</CardTitle>
              <p className="text-sm text-muted-foreground">
                Select a plan to subscribe or upgrade
              </p>
            </div>
            {regions && regions.length > 1 && (
              <Select
                value={selectedRegionId || ""}
                onValueChange={setSelectedRegionId}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.region_label} ({r.currency_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </div>
          ) : !plans?.length ? (
            <p className="text-sm text-muted-foreground py-4">
              No plans are currently available for this region.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrentPlan =
                  subscription?.plan_slug === plan.plan_slug &&
                  subscription?.status === "active";
                const isSelected = selectedPriceId === plan.stripe_price_id;
                const hasStripe = !!plan.stripe_price_id;
                return (
                  <Card
                    key={plan.id}
                    className={`transition-all ${
                      hasStripe ? "cursor-pointer" : "cursor-default"
                    } ${
                      isSelected
                        ? "border-primary ring-2 ring-primary"
                        : hasStripe
                        ? "hover:border-primary/50"
                        : ""
                    } ${isCurrentPlan ? "opacity-60 cursor-default" : ""}`}
                    onClick={() => {
                      if (!isCurrentPlan && hasStripe) {
                        setSelectedPriceId(plan.stripe_price_id);
                      }
                    }}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold capitalize text-base">
                          {plan.plan_name}
                        </p>
                        {isCurrentPlan && (
                          <Badge variant="secondary" className="gap-1">
                            <Check className="h-3 w-3" /> Current
                          </Badge>
                        )}
                        {isSelected && !isCurrentPlan && (
                          <div className="h-4 w-4 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="text-2xl font-bold">
                        {selectedRegion?.currency_symbol || ""}
                        {plan.price.toFixed(0)}
                        <span className="text-sm font-normal text-muted-foreground">/mo</span>
                      </p>
                      {!hasStripe && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <AlertCircle className="h-3 w-3" />
                          Contact admin to subscribe
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {plans && plans.some((p) => p.stripe_price_id) && (
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleCheckout}
                disabled={!selectedPriceId || loading}
                size="lg"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {subscription?.status === "active" ? "Change Plan" : "Subscribe"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
