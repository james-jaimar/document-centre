import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, AlertCircle, Check } from "lucide-react";
import { useBranchSubscription } from "@/hooks/useBranchSubscriptions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export function BranchSubscriptionPanel({ branchId }: { branchId: string }) {
  const { data: subscription, isLoading } = useBranchSubscription(branchId);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const c = searchParams.get("checkout");
    if (c === "success") {
      toast.success("Payment completed — your subscription is now active!");
      setSearchParams({}, { replace: true });
    } else if (c === "cancelled") {
      toast.info("Payment was cancelled");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Resolve assigned plan to grab stripe_price_id
  const { data: assignedPlan } = useQuery({
    queryKey: ["branch_assigned_plan", subscription?.region_id, subscription?.assigned_plan_slug],
    enabled: !!subscription?.region_id && !!subscription?.assigned_plan_slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_plans")
        .select("*")
        .eq("region_id", subscription!.region_id!)
        .eq("plan_slug", subscription!.assigned_plan_slug!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const handlePay = async () => {
    if (!assignedPlan?.stripe_price_id) {
      toast.error("Plan is not Stripe-ready. Contact your tenant admin.");
      return;
    }
    setLoading(true);
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-branch-checkout", {
        body: {
          branch_id: branchId,
          price_id: assignedPlan.stripe_price_id,
          success_url: `${origin}/branch/settings?tab=subscription&checkout=success`,
          cancel_url: `${origin}/branch/settings?tab=subscription&checkout=cancelled`,
          discount_type: subscription?.discount_type || null,
          discount_value: subscription?.discount_value || 0,
          trial_days: subscription?.trial_days || 0,
        },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || "Failed to start checkout");
    } finally {
      setLoading(false);
    }
  };

  const billing = subscription?.billing_status || "";
  const status = subscription?.status || "";
  const trialStatus = (subscription as any)?.trial_status || "";
  const trialEndsAt = (subscription as any)?.trial_ends_at;
  const inTrial = trialStatus === "active" && trialEndsAt && new Date(trialEndsAt) > new Date();
  const trialExpired = trialStatus === "expired";
  const isActive = status === "active" || status === "trialing" || billing === "paid" || inTrial;
  const isPending = (!isActive && !!subscription?.assigned_plan_slug) || trialExpired;
  const noPlan = !subscription?.assigned_plan_slug;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" /> Subscription
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : noPlan ? (
          <div className="text-center py-8 space-y-2">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium">No plan assigned</p>
            <p className="text-sm text-muted-foreground">Your tenant admin needs to assign a subscription plan before this branch can activate.</p>
          </div>
        ) : isPending ? (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">
                    {trialExpired ? "Your 14-day trial has ended" : "Activate your subscription"}
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Plan <strong className="capitalize">{subscription.assigned_plan_slug}</strong> is ready. Complete payment to {trialExpired ? "keep your branch active" : "activate this branch"}.
                  </p>
                </div>
              </div>
            </div>
            <Button onClick={handlePay} disabled={loading} size="lg" className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Pay Now
            </Button>
          </div>
        ) : inTrial ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Check className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-lg font-semibold capitalize">{subscription?.assigned_plan_slug}</p>
                <Badge variant="outline" className={statusColors.trialing}>Trial</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Trial ends {new Date(trialEndsAt!).toLocaleDateString()} — add payment any time to continue without interruption.
            </p>
            <Button onClick={handlePay} disabled={loading} size="sm" variant="outline" className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add payment method
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-lg font-semibold capitalize">{subscription?.assigned_plan_slug || subscription?.plan_slug}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={statusColors[status] || statusColors.paid}>{status || "active"}</Badge>
                </div>
              </div>
            </div>
            {subscription?.current_period_end && (
              <p className="text-sm text-muted-foreground">
                Current period ends {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
