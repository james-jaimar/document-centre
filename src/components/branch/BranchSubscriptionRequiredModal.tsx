import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useBranchSubscription } from "@/hooks/useBranchSubscriptions";
import { BranchSubscriptionPanel } from "./BranchSubscriptionPanel";

/**
 * Blocking modal shown on branch entry when no subscription/trial has been
 * activated yet. Cannot be dismissed — the user must pick a plan (or start a
 * trial) before they can interact with the branch admin.
 *
 * Once the subscription becomes active/trialing (or a trial has been started),
 * the modal disappears automatically because the underlying subscription
 * query is invalidated by the panel's actions.
 */
export function BranchSubscriptionRequiredModal({ branchId }: { branchId: string }) {
  const { data: subscription, isLoading } = useBranchSubscription(branchId);

  if (isLoading) return null;

  const status = subscription?.status || "";
  const billing = subscription?.billing_status || "";
  const trialStatus = (subscription as any)?.trial_status || "";
  const trialEndsAt = (subscription as any)?.trial_ends_at;
  const inTrial =
    trialStatus === "active" && trialEndsAt && new Date(trialEndsAt) > new Date();
  const isActive =
    status === "active" ||
    status === "trialing" ||
    billing === "paid" ||
    inTrial ||
    !!subscription?.stripe_subscription_id ||
    !!subscription?.trial_started_at;

  // No plan assigned yet by tenant admin — nothing the branch manager can do,
  // so don't block them; the panel on Settings will explain.
  if (!subscription?.assigned_plan_slug) return null;

  // Already sorted — no need to block.
  if (isActive) return null;

  return (
    <Dialog open>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        hideClose
      >
        <DialogHeader>
          <DialogTitle>Choose your subscription to continue</DialogTitle>
          <DialogDescription>
            Select a trial or subscription option below to activate your branch.
            You&rsquo;ll be able to explore your admin once a plan is chosen.
          </DialogDescription>
        </DialogHeader>
        <BranchSubscriptionPanel branchId={branchId} />
      </DialogContent>
    </Dialog>
  );
}
