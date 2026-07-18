import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useBranchEntitlement, useBranchSubscription } from "@/hooks/useBranchSubscriptions";
import { BranchSubscriptionPanel } from "./BranchSubscriptionPanel";

/**
 * Blocking modal shown on branch entry when the branch is NOT entitled to
 * operate — i.e. entitlement state is `restricted` or `cancelled`.
 * Cannot be dismissed; the user must pick a plan (or, once the trial has
 * been consumed, subscribe) before they can interact with the branch admin.
 *
 * Reactivation is immediate — once the entitlement returns `active` /
 * `trialing` / `grace`, the modal disappears.
 */
export function BranchSubscriptionRequiredModal({ branchId }: { branchId: string }) {
  const { data: subscription, isLoading: subLoading } = useBranchSubscription(branchId);
  const { data: entitlement, isLoading: entLoading } = useBranchEntitlement(branchId);

  if (subLoading || entLoading) return null;

  // No plan assigned yet by tenant admin — nothing the branch manager can do,
  // so don't block them; the panel on Settings will explain.
  if (!subscription?.assigned_plan_slug) return null;

  const state = entitlement?.state;
  const mustBlock = state === "restricted" || state === "cancelled";
  if (!mustBlock) return null;

  return (
    <Dialog open>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto [&>button.absolute]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Subscribe to continue</DialogTitle>
          <DialogDescription>
            Your branch is currently paused. Activate a paid subscription below to reopen your store and restore admin access.
          </DialogDescription>
        </DialogHeader>
        <BranchSubscriptionPanel branchId={branchId} />
      </DialogContent>
    </Dialog>
  );
}
