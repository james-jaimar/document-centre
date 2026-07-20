import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, AlertCircle, Check } from "lucide-react";
import { useBranchSubscription } from "@/hooks/useBranchSubscriptions";
import { useBranchPortalSession } from "@/hooks/useBranchBillingSelfService";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SubscriptionDisclosureCard, AcceptedDocument } from "./SubscriptionDisclosureCard";
import { BranchReAcceptanceBanner } from "./BranchReAcceptanceBanner";
import { BranchAcceptanceHistory } from "./BranchAcceptanceHistory";
import { TrialConversionCard } from "./TrialConversionCard";
import { ExternalLink } from "lucide-react";

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
  const [loading, setLoading] = useState<null | "trial14" | "trial30" | "pay">(null);
  const [accepted, setAccepted] = useState<AcceptedDocument[] | null>(null);
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

  // Resolve assigned plan — includes trial_offer so we know which buttons to show.
  const { data: assignedPlan } = useQuery({
    queryKey: ["branch_assigned_plan", subscription?.region_id, subscription?.assigned_plan_slug],
    enabled: !!subscription?.region_id && !!subscription?.assigned_plan_slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_plans")
        .select("*, region:platform_pricing_regions(currency_code,currency_symbol)")
        .eq("region_id", subscription!.region_id!)
        .eq("plan_slug", subscription!.assigned_plan_slug!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: branchInfo } = useQuery({
    queryKey: ["branch_name", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("name").eq("id", branchId).maybeSingle();
      if (error) throw error;
      return data as { name: string | null } | null;
    },
  });

  const trialOffer: "none" | "trial_14_no_card" | "trial_30_with_card" | "both" =
    (assignedPlan?.trial_offer as any) ?? "both";
  // One trial per branch: once any trial path has been taken (no-card or card),
  // or a Stripe subscription exists, the only remaining option is paid checkout.
  const trialConsumed =
    !!(subscription as any)?.trial_started_via ||
    !!subscription?.trial_started_at ||
    !!subscription?.stripe_subscription_id;
  const offer14 = !trialConsumed && (trialOffer === "trial_14_no_card" || trialOffer === "both");
  const offer30 = !trialConsumed && (trialOffer === "trial_30_with_card" || trialOffer === "both");

  const requireAccepted = () => {
    if (!accepted || accepted.length === 0) {
      toast.error("Please accept all of the required documents before continuing.");
      return false;
    }
    return true;
  };

  const handleStartTrial14 = async () => {
    if (!requireAccepted()) return;
    setLoading("trial14");
    try {
      const { error } = await supabase.functions.invoke("start-branch-trial", {
        body: { branch_id: branchId, acceptances: accepted },
      });
      if (error) throw error;
      toast.success("Your 14-day free trial has started!");
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to start trial");
    } finally {
      setLoading(null);
    }
  };

  const handleCheckout = async (mode: "trial30" | "pay") => {
    if (!assignedPlan?.stripe_price_id) {
      toast.error("Plan is not Stripe-ready. Contact your tenant admin.");
      return;
    }
    if (!requireAccepted()) return;
    setLoading(mode);
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
          trial_days: mode === "trial30" ? 30 : 0,
          acceptances: accepted,
        },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  };

  const billing = subscription?.billing_status || "";
  const status = subscription?.status || "";
  const trialStatus = (subscription as any)?.trial_status || "";
  const trialEndsAt = (subscription as any)?.trial_ends_at;
  const trialEndsAtDate = trialEndsAt ? new Date(trialEndsAt) : null;
  const trialEndsInPast = !!trialEndsAtDate && trialEndsAtDate.getTime() <= Date.now();
  const inTrial = trialStatus === "active" && !!trialEndsAtDate && !trialEndsInPast;
  // Consider the trial expired the moment `trial_ends_at` passes on a branch
  // that ever started a trial, even if a background job hasn't yet stamped
  // `trial_status='expired'`. This keeps copy + gating accurate in real time.
  const trialWasStarted = !!(subscription as any)?.trial_started_at || !!(subscription as any)?.trial_started_via || trialStatus === "active" || trialStatus === "expired";
  const trialExpired = trialStatus === "expired" || (trialWasStarted && trialEndsInPast && !subscription?.stripe_subscription_id);
  const isActive = status === "active" || (status === "trialing" && !trialEndsInPast) || billing === "paid" || inTrial;
  const isPending = (!isActive && !!subscription?.assigned_plan_slug) || trialExpired;
  const noPlan = !subscription?.assigned_plan_slug;
  const anyLoading = loading !== null;

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
                    {trialExpired ? "Your free trial has ended" : trialConsumed ? "Your trial has been used" : "Activate your subscription"}
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Plan <strong className="capitalize">{subscription.assigned_plan_slug}</strong> is ready.{" "}
                    {trialExpired || trialConsumed ? "Subscribe now to keep your branch active." : "Choose how you'd like to start below."}
                  </p>
                </div>
              </div>
            </div>

            <SubscriptionDisclosureCard
              branchId={branchId}
              planSlug={subscription.assigned_plan_slug}
              trialDays={subscription?.trial_days || 0}
              onChange={setAccepted}
            />

            {trialExpired || trialConsumed ? (
              <div className="space-y-3">
                {trialConsumed && !trialExpired && (
                  <p className="text-sm text-muted-foreground">
                    Trial offers are once per branch. Activate your subscription to continue.
                  </p>
                )}
                <Button onClick={() => handleCheckout("pay")} disabled={anyLoading || !accepted} size="lg" className="w-full">
                  {loading === "pay" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Subscribe now
                </Button>
              </div>
            ) : (
              <div className={`grid gap-3 ${offer14 && offer30 ? "md:grid-cols-3" : offer14 || offer30 ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
                {offer14 && (
                  <TrialChoiceCard
                    title="14-day free trial"
                    blurb="No card required. Once used, the next step is a paid subscription."
                    cta="Start 14-day trial"
                    loading={loading === "trial14"}
                    disabled={anyLoading || !accepted}
                    onClick={handleStartTrial14}
                  />
                )}
                {offer30 && (
                  <TrialChoiceCard
                    title="30-day free trial"
                    blurb="Card required. Converts to a paid subscription after 30 days unless cancelled."
                    cta="Start 30-day trial"
                    loading={loading === "trial30"}
                    disabled={anyLoading || !accepted}
                    onClick={() => handleCheckout("trial30")}
                  />
                )}
                <TrialChoiceCard
                  title="Subscribe now"
                  blurb="Start immediately on the launch offer. Cancel anytime from the Stripe billing portal."
                  cta="Subscribe now"
                  highlight
                  loading={loading === "pay"}
                  disabled={anyLoading || !accepted}
                  onClick={() => handleCheckout("pay")}
                />
              </div>
            )}
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
            <SubscriptionDisclosureCard
              branchId={branchId}
              planSlug={subscription?.assigned_plan_slug}
              trialDays={0}
              onChange={setAccepted}
            />
            <Button onClick={() => handleCheckout("pay")} disabled={anyLoading || !accepted} size="sm" variant="outline" className="w-full">
              {loading === "pay" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add payment method
            </Button>
          </div>
        ) : (
          <ActiveSubscriptionBlock subscription={subscription} status={status} branchId={branchId} />
        )}
      </CardContent>
    </Card>
  );
}

function TrialChoiceCard({
  title, blurb, cta, loading, disabled, highlight, onClick,
}: {
  title: string; blurb: string; cta: string;
  loading: boolean; disabled: boolean; highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <div className={`rounded-lg border p-4 flex flex-col gap-3 ${highlight ? "border-primary/50 bg-primary/5" : "bg-muted/20"}`}>
      <div className="space-y-1">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{blurb}</p>
      </div>
      <Button onClick={onClick} disabled={disabled} size="sm" variant={highlight ? "default" : "outline"} className="mt-auto">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {cta}
      </Button>
    </div>
  );
}

function ActiveSubscriptionBlock({ subscription, status, branchId }: { subscription: any; status: string; branchId: string }) {
  const portal = useBranchPortalSession();
  const openPortal = async () => {
    try {
      const { url } = await portal.mutateAsync({
        branch_id: branchId,
        return_url: `${window.location.origin}/branch/settings?tab=subscription`,
      });
      if (url) window.location.href = url;
    } catch (e: any) {
      toast.error(e.message || "Unable to open billing portal");
    }
  };
  return (
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
      <Button size="sm" variant="outline" onClick={openPortal} disabled={portal.isPending || !subscription?.stripe_customer_id}>
        {portal.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-3.5 w-3.5" />}
        Manage billing in Stripe
      </Button>
      {!subscription?.stripe_customer_id && (
        <p className="text-xs text-muted-foreground">Payment method appears here after your first successful charge.</p>
      )}
    </div>
  );
}
