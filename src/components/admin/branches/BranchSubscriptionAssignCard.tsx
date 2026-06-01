import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, ShieldCheck } from "lucide-react";
import { useBranchSubscription, useOverrideBranchSubscription } from "@/hooks/useBranchSubscriptions";
import { useToast } from "@/hooks/use-toast";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  incomplete: "bg-muted text-muted-foreground",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  free: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

interface Props { branchId: string }

export function BranchSubscriptionAssignCard({ branchId }: Props) {
  const { data: subscription, isLoading } = useBranchSubscription(branchId);
  const overrideSubscription = useOverrideBranchSubscription();
  const { toast } = useToast();

  const isActive = subscription?.status === "active" || subscription?.status === "trialing" || subscription?.billing_status === "paid" || subscription?.billing_status === "free";

  const handleOverride = async () => {
    try {
      await overrideSubscription.mutateAsync({ branch_id: branchId });
      toast({ title: "Branch subscription activated", description: "This branch can now accept new orders." });
    } catch (e: any) {
      toast({ title: "Override failed", description: e?.message ?? "Could not activate this branch.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" /> Branch Subscription
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Plan is inherited from the tenant's subscription. Change it in Settings → Billing.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !subscription ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No plan inherited yet. Assign a tenant plan in Settings → Billing to seed this branch.
            </p>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-2"
              disabled={overrideSubscription.isPending}
              onClick={handleOverride}
            >
              {overrideSubscription.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Activate branch / comp subscription
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-semibold capitalize">
                {subscription.assigned_plan_slug || subscription.plan_slug || "—"}
              </span>
              {subscription.status && (
                <Badge variant="outline" className={statusColors[subscription.status] || ""}>{subscription.status}</Badge>
              )}
              {subscription.billing_status && (
                <Badge variant="outline" className={statusColors[subscription.billing_status] || ""}>
                  {subscription.billing_status.replace("_", " ")}
                </Badge>
              )}
            </div>
            {subscription.discount_value ? (
              <div className="text-muted-foreground">
                Discount: {subscription.discount_type === "percentage" ? `${subscription.discount_value}%` : subscription.discount_value} off
              </div>
            ) : null}
            {subscription.trial_days ? (
              <div className="text-muted-foreground">Trial: {subscription.trial_days} days</div>
            ) : null}
            {subscription.current_period_end && (
              <div className="text-muted-foreground">
                Renews {new Date(subscription.current_period_end).toLocaleDateString()}
              </div>
            )}
            {subscription.stripe_customer_id && (
              <div className="text-xs text-muted-foreground font-mono">Stripe: {subscription.stripe_customer_id}</div>
            )}
            {!isActive && (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="gap-2"
                disabled={overrideSubscription.isPending}
                onClick={handleOverride}
              >
                {overrideSubscription.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Activate branch / comp subscription
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
