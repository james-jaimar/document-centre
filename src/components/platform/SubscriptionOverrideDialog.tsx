import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  useSubscriptionOverride,
  type PlatformBranchSubscription,
  type SubscriptionOverrideAction,
} from "@/hooks/usePlatformSubscriptions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: PlatformBranchSubscription | null;
}

const ACTION_LABELS: Record<SubscriptionOverrideAction, string> = {
  comp: "Comp (free pass)",
  clear_comp: "Clear comp",
  extend_grace: "Extend grace period",
  force_cancel: "Force cancel & close storefront",
  reset_trial: "Reset / restart trial",
  reopen_storefront: "Reopen closed storefront",
};

const NEEDS_DAYS: SubscriptionOverrideAction[] = ["comp", "extend_grace", "reset_trial"];
const DEFAULT_DAYS: Record<SubscriptionOverrideAction, number> = {
  comp: 30,
  clear_comp: 0,
  extend_grace: 7,
  force_cancel: 0,
  reset_trial: 14,
  reopen_storefront: 0,
};

export function SubscriptionOverrideDialog({ open, onOpenChange, subscription }: Props) {
  const [action, setAction] = useState<SubscriptionOverrideAction>("comp");
  const [days, setDays] = useState<number>(30);
  const [reason, setReason] = useState("");
  const override = useSubscriptionOverride();

  const handleActionChange = (next: SubscriptionOverrideAction) => {
    setAction(next);
    setDays(DEFAULT_DAYS[next]);
  };

  const handleSubmit = async () => {
    if (!subscription) return;
    if (!reason.trim()) {
      toast.error("Reason is required for audit log");
      return;
    }
    try {
      await override.mutateAsync({
        branch_id: subscription.branch_id,
        action,
        reason: reason.trim(),
        days: NEEDS_DAYS.includes(action) ? days : undefined,
      });
      toast.success(`Applied: ${ACTION_LABELS[action]}`);
      onOpenChange(false);
      setReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Override failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manual subscription override</DialogTitle>
        </DialogHeader>

        {subscription && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">{subscription.tenant_name} — {subscription.branch_name}</div>
              <div className="text-muted-foreground text-xs mt-1">
                Status: {subscription.status ?? "—"} · Billing: {subscription.billing_status ?? "—"}
                {subscription.comp_until && <> · Comp until {new Date(subscription.comp_until).toLocaleDateString()}</>}
                {subscription.grace_until && <> · Grace until {new Date(subscription.grace_until).toLocaleDateString()}</>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={action} onValueChange={(v) => handleActionChange(v as SubscriptionOverrideAction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {NEEDS_DAYS.includes(action) && (
              <div className="space-y-2">
                <Label>Duration (days)</Label>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value || "0", 10))}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Reason (required, recorded in audit log)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Goodwill credit after migration outage on 2026-06-20"
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={override.isPending}>
            {override.isPending ? "Applying..." : "Apply override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
