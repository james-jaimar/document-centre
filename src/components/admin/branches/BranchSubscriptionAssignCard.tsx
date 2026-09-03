import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard, RotateCcw, XCircle, Pencil } from "lucide-react";
import {
  useBranchSubscription, useOverrideBranchSubscription, useAssignBranchPlan, useBranchPlans,
} from "@/hooks/useBranchSubscriptions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/hooks/useTenantContext";

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
  const override = useOverrideBranchSubscription();
  const { toast } = useToast();
  const { isPlatformAdmin } = useTenantContext();

  // Resolve a region for plan options (prefer existing sub, fallback to tenant assignment).
  const { data: branchRow } = useQuery({
    queryKey: ["branch_for_assign", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("branches")
        .select("id, tenant_id, tenants:tenant_id(assigned_region_id)")
        .eq("id", branchId)
        .maybeSingle();
      return data;
    },
  });
  const regionId: string | undefined =
    subscription?.region_id || branchRow?.tenants?.assigned_region_id || undefined;

  const runAction = async (
    action: "reset_pending" | "force_cancel",
    successMsg: string,
  ) => {
    try {
      await override.mutateAsync({ branch_id: branchId, action });
      toast({ title: successMsg });
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" /> Branch Subscription
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Each branch is billed individually. Use the actions below to assign, reset, or cancel this branch's subscription.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {subscription ? (
              <>
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
              </>
            ) : (
              <p className="text-muted-foreground">No subscription yet. Assign a plan to get started.</p>
            )}
          </div>
        )}

        {!isPlatformAdmin && (
          <p className="text-xs text-muted-foreground pt-2 border-t">
            Plan, discount and trial terms are managed by Document Centre. Contact support to change your plan.
          </p>
        )}

        {isPlatformAdmin && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <AssignPlanDialog
            branchId={branchId}
            regionId={regionId}
            currentPlanSlug={subscription?.assigned_plan_slug ?? null}
            currentDiscountType={subscription?.discount_type ?? null}
            currentDiscountValue={subscription?.discount_value ?? null}
            currentTrialDays={subscription?.trial_days ?? null}
          />

          {subscription && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2" disabled={override.isPending}>
                  <RotateCcw className="h-4 w-4" /> Reset to pending
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset this branch's subscription?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Clears trial / active state and unlinks any Stripe subscription. The branch keeps its assigned plan
                    and will see the activation chooser (14-day trial / 30-day trial / pay now) on next login.
                    This does <strong>not</strong> cancel a live Stripe subscription — use Cancel for that.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Back</AlertDialogCancel>
                  <AlertDialogAction onClick={() => runAction("reset_pending", "Subscription reset to pending payment")}>
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {subscription && subscription.status !== "cancelled" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="gap-2" disabled={override.isPending}>
                  <XCircle className="h-4 w-4" /> Cancel subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this branch's subscription?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Marks the subscription as cancelled and closes the storefront. The branch will go read-only.
                    Note: this flips the local status only — if a live Stripe subscription exists you may also need
                    to cancel it in Stripe.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Back</AlertDialogCancel>
                  <AlertDialogAction onClick={() => runAction("force_cancel", "Subscription cancelled")}>
                    Cancel subscription
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssignPlanDialog({
  branchId, regionId, currentPlanSlug, currentDiscountType, currentDiscountValue, currentTrialDays,
}: {
  branchId: string;
  regionId?: string;
  currentPlanSlug: string | null;
  currentDiscountType: string | null;
  currentDiscountValue: number | null;
  currentTrialDays: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [planSlug, setPlanSlug] = useState(currentPlanSlug ?? "");
  const [discountType, setDiscountType] = useState<string>(currentDiscountType ?? "none");
  const [discountValue, setDiscountValue] = useState<string>(currentDiscountValue?.toString() ?? "");
  const [trialDays, setTrialDays] = useState<string>(currentTrialDays?.toString() ?? "");

  const { data: plans, isLoading: plansLoading } = useBranchPlans(regionId);
  const assign = useAssignBranchPlan();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setPlanSlug(currentPlanSlug ?? "");
      setDiscountType(currentDiscountType ?? "none");
      setDiscountValue(currentDiscountValue?.toString() ?? "");
      setTrialDays(currentTrialDays?.toString() ?? "");
    }
  }, [open, currentPlanSlug, currentDiscountType, currentDiscountValue, currentTrialDays]);

  const submit = async () => {
    if (!planSlug) {
      toast({ title: "Pick a plan", variant: "destructive" });
      return;
    }
    try {
      await assign.mutateAsync({
        branch_id: branchId,
        region_id: regionId ?? null,
        assigned_plan_slug: planSlug,
        discount_type: discountType === "none" ? null : discountType,
        discount_value: discountValue ? Number(discountValue) : null,
        trial_days: trialDays ? Number(trialDays) : null,
      });
      toast({ title: currentPlanSlug ? "Plan updated" : "Plan assigned" });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? "Try again.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" className="gap-2">
          <Pencil className="h-4 w-4" />
          {currentPlanSlug ? "Change plan" : "Assign plan"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentPlanSlug ? "Change branch plan" : "Assign branch plan"}</DialogTitle>
          <DialogDescription>
            {regionId
              ? "Plans shown for this branch's region."
              : "No region resolved for this branch — assigning a tenant region first is recommended."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={planSlug} onValueChange={setPlanSlug}>
              <SelectTrigger>
                <SelectValue placeholder={plansLoading ? "Loading…" : "Select a plan"} />
              </SelectTrigger>
              <SelectContent>
                {(plans ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.plan_slug}>
                    {p.plan_slug} — {p.currency} {p.price}
                    {p.stripe_price_id ? "" : "  (no Stripe price)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Discount type</Label>
              <Select value={discountType} onValueChange={setDiscountType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Discount value</Label>
              <Input
                type="number" min={0} value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                disabled={discountType === "none"}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Trial days (optional)</Label>
            <Input
              type="number" min={0} max={365} value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              placeholder="e.g. 14"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={assign.isPending}>
            {assign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {currentPlanSlug ? "Save changes" : "Assign plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
