import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, CreditCard, Settings2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranchSubscription, useAssignBranchPlan } from "@/hooks/useBranchSubscriptions";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  incomplete: "bg-muted text-muted-foreground",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

interface Props { branchId: string }

export function BranchSubscriptionAssignCard({ branchId }: Props) {
  const { data: subscription, isLoading } = useBranchSubscription(branchId);
  const assign = useAssignBranchPlan();
  const [open, setOpen] = useState(false);

  const { data: regions } = useQuery({
    queryKey: ["platform_pricing_regions_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_pricing_regions").select("*").order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: branchPlans } = useQuery({
    queryKey: ["platform_pricing_plans", "branch", "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_pricing_plans")
        .select("*")
        .eq("scope", "branch")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [form, setForm] = useState({
    region_id: "",
    plan_slug: "",
    discount_type: "none",
    discount_value: 0,
    trial_days: 0,
  });

  const openDialog = () => {
    setForm({
      region_id: subscription?.region_id || regions?.find((r) => r.is_default)?.id || regions?.[0]?.id || "",
      plan_slug: subscription?.assigned_plan_slug || "",
      discount_type: subscription?.discount_type || "none",
      discount_value: subscription?.discount_value || 0,
      trial_days: subscription?.trial_days || 0,
    });
    setOpen(true);
  };

  const regionPlans = (branchPlans ?? []).filter((p) => !form.region_id || p.region_id === form.region_id);

  const submit = async () => {
    if (!form.plan_slug) { toast.error("Choose a plan"); return; }
    try {
      await assign.mutateAsync({
        branch_id: branchId,
        region_id: form.region_id || null,
        assigned_plan_slug: form.plan_slug,
        discount_type: form.discount_type === "none" ? null : form.discount_type,
        discount_value: form.discount_type === "none" ? null : Number(form.discount_value) || 0,
        trial_days: Number(form.trial_days) || 0,
      });
      toast.success("Plan assigned — the branch can now complete checkout.");
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" /> Branch Subscription
        </CardTitle>
        <Button size="sm" variant="outline" onClick={openDialog}>
          <Settings2 size={14} className="mr-1.5" /> {subscription?.assigned_plan_slug ? "Change Plan" : "Assign Plan"}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : !subscription ? (
          <p className="text-sm text-muted-foreground">No subscription yet. Assign a branch plan to enable this branch.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="font-semibold capitalize">{subscription.assigned_plan_slug || subscription.plan_slug || "—"}</span>
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
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Branch Plan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Region</Label>
              <Select value={form.region_id} onValueChange={(v) => setForm((f) => ({ ...f, region_id: v, plan_slug: "" }))}>
                <SelectTrigger><SelectValue placeholder="Choose region" /></SelectTrigger>
                <SelectContent>
                  {(regions ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.region_label} ({r.currency_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plan</Label>
              <Select value={form.plan_slug} onValueChange={(v) => setForm((f) => ({ ...f, plan_slug: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose plan" /></SelectTrigger>
                <SelectContent>
                  {regionPlans.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No branch plans configured for this region. Set them up in Platform → Pricing Regions.</div>
                  ) : regionPlans.map((p) => (
                    <SelectItem key={p.id} value={p.plan_slug}>
                      {p.plan_name} — {p.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Discount Type</Label>
                <Select value={form.discount_type} onValueChange={(v) => setForm((f) => ({ ...f, discount_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed_amount">Fixed amount</SelectItem>
                    <SelectItem value="free_months">Free months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Discount Value</Label>
                <Input type="number" value={form.discount_value}
                  disabled={form.discount_type === "none"}
                  onChange={(e) => setForm((f) => ({ ...f, discount_value: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div>
              <Label>Trial Days</Label>
              <Input type="number" value={form.trial_days}
                onChange={(e) => setForm((f) => ({ ...f, trial_days: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={assign.isPending}>
              {assign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
