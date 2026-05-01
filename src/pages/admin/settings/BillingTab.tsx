import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantSubscriptions, usePlatformPricingPlans } from "@/hooks/useTenantSubscriptions";

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
  const { data: plans, isLoading: plansLoading } = usePlatformPricingPlans();
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const subscription = allSubscriptions?.find((s) => s.tenant_id === tenantId);

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
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading subscription details…
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold capitalize">
                  {subscription?.plan_slug || "starter"}
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available Plans</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a plan to subscribe or change your current plan
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </div>
          ) : !plans?.length ? (
            <p className="text-sm text-muted-foreground py-4">
              No plans are currently available. Please contact your platform administrator.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrentPlan =
                  subscription?.plan_slug === plan.plan_slug &&
                  subscription?.status === "active";
                const isSelected = selectedPriceId === plan.stripe_price_id;
                return (
                  <Card
                    key={plan.id}
                    className={`cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary ring-2 ring-primary"
                        : "hover:border-primary/50"
                    } ${isCurrentPlan ? "opacity-60 cursor-default" : ""}`}
                    onClick={() => !isCurrentPlan && setSelectedPriceId(plan.stripe_price_id)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold capitalize text-base">{plan.plan_name}</p>
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
                        R{plan.price.toFixed(0)}
                        <span className="text-sm font-normal text-muted-foreground">/mo</span>
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {plans && plans.length > 0 && (
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
