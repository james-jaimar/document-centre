import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Building2, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useBranchPlans } from "@/hooks/useBranchSubscriptions";
import { useTenantPlanAssignment, useAssignTenantPlan } from "@/hooks/useTenantPlanAssignment";

interface Props { tenantId: string }

export function TenantPlanAssignmentCard({ tenantId }: Props) {
  const qc = useQueryClient();
  const [verifying, setVerifying] = useState(false);
  const { data: current, isLoading } = useTenantPlanAssignment(tenantId);
  const assign = useAssignTenantPlan();

  const { data: regions } = useQuery({
    queryKey: ["platform_pricing_regions_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_pricing_regions").select("*").order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const [form, setForm] = useState({
    region_id: "",
    plan_slug: "",
    discount_type: "none",
    discount_value: 0,
    trial_days: 0,
    notes: "",
  });

  useEffect(() => {
    if (!current) return;
    setForm({
      region_id: current.assigned_region_id || "",
      plan_slug: current.assigned_plan_slug || "",
      discount_type: current.assigned_discount_type || "none",
      discount_value: current.assigned_discount_value || 0,
      trial_days: current.assigned_trial_days || 0,
      notes: current.billing_notes || "",
    });
  }, [current]);

  const { data: plans } = useBranchPlans(form.region_id || undefined);
  const selectedPlan = (plans ?? []).find((p: any) => p.plan_slug === form.plan_slug);
  const hasStripeCoupon = !!(selectedPlan as any)?.stripe_coupon_id || !!(selectedPlan as any)?.stripe_promotion_code_id;

  const submit = async () => {
    if (!form.plan_slug) { toast.error("Choose a plan"); return; }
    try {
      const res = await assign.mutateAsync({
        tenant_id: tenantId,
        assigned_plan_slug: form.plan_slug,
        assigned_region_id: form.region_id || null,
        assigned_discount_type: form.discount_type === "none" ? null : form.discount_type,
        assigned_discount_value: form.discount_type === "none" ? null : Number(form.discount_value) || 0,
        assigned_trial_days: Number(form.trial_days) || 0,
        billing_notes: form.notes || null,
      });
      toast.success(`Plan applied to ${res.branches_updated} branch${res.branches_updated === 1 ? "" : "es"}.`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-5 w-5" /> Tenant Subscription Plan
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Assign one plan here — every active branch will inherit it. Each branch still pays its own Stripe subscription.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            {current?.assigned_plan_slug && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-center gap-3 flex-wrap">
                <span>Current plan:</span>
                <Badge variant="secondary" className="capitalize">{current.assigned_plan_slug}</Badge>
                {current.plan_assigned_at && (
                  <span className="text-muted-foreground text-xs">
                    last applied {new Date(current.plan_assigned_at).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                <Label>Branch plan</Label>
                <Select value={form.plan_slug} onValueChange={(v) => setForm((f) => ({ ...f, plan_slug: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose plan" /></SelectTrigger>
                  <SelectContent>
                    {(plans ?? []).length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No branch plans for this region. Set them up in Platform → Pricing Regions.
                      </div>
                    ) : (plans ?? []).map((p: any) => (
                      <SelectItem key={p.id} value={p.plan_slug}>
                        {p.plan_name} — {p.price}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasStripeCoupon && (
                <div className="md:col-span-2 rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-900 dark:text-emerald-100">
                  ✓ This plan has a Stripe-linked coupon/promotion code attached in the dashboard — it will be applied automatically at checkout. The per-branch discount fields below are ignored when a plan-level coupon exists.
                </div>
              )}
              <div>
                <Label>Per-branch discount type (fallback)</Label>
                <Select value={form.discount_type} onValueChange={(v) => setForm((f) => ({ ...f, discount_type: v }))} disabled={hasStripeCoupon}>
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
                <Label>Discount value</Label>
                <Input type="number" value={form.discount_value}
                  disabled={form.discount_type === "none" || hasStripeCoupon}
                  onChange={(e) => setForm((f) => ({ ...f, discount_value: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Trial</Label>
                <Select
                  value={String(form.trial_days || 0)}
                  onValueChange={(v) => setForm((f) => ({ ...f, trial_days: parseInt(v) || 0 }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No trial</SelectItem>
                    <SelectItem value="14">14 days — no card required</SelectItem>
                    <SelectItem value="30">30 days — card required (billed after)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  14-day trial auto-starts on first sign-in. 30-day trial requires the branch to enter a card at checkout; nothing is charged until the trial ends.
                </p>
              </div>
              <div className="md:col-span-2">
                <Label>Internal notes</Label>
                <Textarea rows={2} value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={submit} disabled={assign.isPending}>
                {assign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & apply to all branches
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
