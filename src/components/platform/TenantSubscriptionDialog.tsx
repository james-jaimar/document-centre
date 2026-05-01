import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CreditCard, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePlatformPricingPlans, type TenantSubscription } from "@/hooks/useTenantSubscriptions";
import type { Tenant } from "@/hooks/useTenants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: Tenant;
  subscription: TenantSubscription | undefined;
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  canceled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  incomplete: "bg-muted text-muted-foreground",
};

export function TenantSubscriptionDialog({ open, onOpenChange, tenant, subscription }: Props) {
  const { data: plans, isLoading: plansLoading } = usePlatformPricingPlans();
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!selectedPriceId) return;
    setLoading(true);
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          tenant_id: tenant.id,
          price_id: selectedPriceId,
          success_url: `${origin}/platform?checkout=success`,
          cancel_url: `${origin}/platform?checkout=cancelled`,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription — {tenant.name}
          </DialogTitle>
        </DialogHeader>

        {/* Current status */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Current plan</p>
          <div className="flex items-center gap-2">
            <span className="font-medium capitalize">{subscription?.plan_slug || tenant.plan_slug || "starter"}</span>
            {subscription && (
              <Badge variant="outline" className={statusColors[subscription.status] || ""}>
                {subscription.status}
              </Badge>
            )}
            {!subscription && (
              <Badge variant="outline" className="bg-muted text-muted-foreground">No subscription</Badge>
            )}
          </div>
          {subscription?.current_period_end && (
            <p className="text-xs text-muted-foreground">
              Current period ends {new Date(subscription.current_period_end).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Plan selection */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Select a plan</p>
          {plansLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </div>
          ) : !plans?.length ? (
            <p className="text-sm text-muted-foreground py-4">
              No plans with Stripe price IDs configured. Add <code>stripe_price_id</code> to your platform pricing plans first.
            </p>
          ) : (
            <div className="grid gap-2">
              {plans.map((plan) => {
                const isCurrentPlan = subscription?.plan_slug === plan.plan_slug && subscription?.status === "active";
                const isSelected = selectedPriceId === plan.stripe_price_id;
                return (
                  <Card
                    key={plan.id}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "border-primary ring-1 ring-primary"
                        : "hover:border-primary/50"
                    } ${isCurrentPlan ? "opacity-60" : ""}`}
                    onClick={() => !isCurrentPlan && setSelectedPriceId(plan.stripe_price_id)}
                  >
                    <CardContent className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-medium capitalize">{plan.plan_name}</p>
                        <p className="text-sm text-muted-foreground">
                          R{plan.price.toFixed(0)}/mo
                        </p>
                      </div>
                      {isCurrentPlan && (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="h-3 w-3" /> Current
                        </Badge>
                      )}
                      {isSelected && !isCurrentPlan && (
                        <div className="h-4 w-4 rounded-full bg-primary" />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleCheckout}
            disabled={!selectedPriceId || loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Checkout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
