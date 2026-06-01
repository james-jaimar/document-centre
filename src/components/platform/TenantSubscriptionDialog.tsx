import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CreditCard, Gift, Percent, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatCurrency";
import { useAuth } from "@/hooks/useAuth";
import type { TenantSubscription } from "@/hooks/useTenantSubscriptions";
import type { Tenant } from "@/hooks/useTenants";
import { useQueryClient } from "@tanstack/react-query";

interface PricingRegion {
  id: string;
  region_code: string;
  region_label: string;
  currency_code: string;
  currency_symbol: string;
  is_default: boolean;
  sort_order: number;
}

interface PricingPlan {
  id: string;
  plan_slug: string;
  plan_name: string;
  price: number;
  stripe_price_id: string | null;
  sort_order: number;
}

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  currency_code: string | null;
  applicable_plan_slugs: string[] | null;
  is_active: boolean;
}

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
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  free: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  manual: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export function TenantSubscriptionDialog({ open, onOpenChange, tenant, subscription }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string | null>(null);
  const [isFree, setIsFree] = useState(false);
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<string>("percentage");
  const [discountValue, setDiscountValue] = useState<string>("0");
  const [promoCode, setPromoCode] = useState<string>("");
  const [matchedPromo, setMatchedPromo] = useState<PromoCode | null>(null);
  const [trialDays, setTrialDays] = useState<string>("0");
  const [saving, setSaving] = useState(false);

  // Fetch regions
  const { data: regions } = useQuery({
    queryKey: ["platform_pricing_regions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_regions")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as PricingRegion[];
    },
    enabled: open,
  });

  // Fetch plans for selected region (all plans, not just Stripe-linked)
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["platform_pricing_plans", "assign", selectedRegionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_plans")
        .select("*")
        .eq("region_id", selectedRegionId!)
        .order("sort_order");
      if (error) throw error;
      return data as PricingPlan[];
    },
    enabled: !!selectedRegionId,
  });

  // Auto-select default region
  useEffect(() => {
    if (regions && !selectedRegionId) {
      // If subscription has a region, use that; otherwise use default
      if (subscription?.region_id) {
        setSelectedRegionId(subscription.region_id);
      } else {
        const def = regions.find((r) => r.is_default) || regions[0];
        if (def) setSelectedRegionId(def.id);
      }
    }
  }, [regions, selectedRegionId, subscription?.region_id]);

  // Reset plan when region changes
  useEffect(() => {
    setSelectedPlanSlug(null);
    setMatchedPromo(null);
  }, [selectedRegionId]);

  // Pre-fill from existing subscription
  useEffect(() => {
    if (subscription && open) {
      if (subscription.assigned_plan_slug) {
        setSelectedPlanSlug(subscription.assigned_plan_slug);
      }
      if (subscription.billing_status === "free") {
        setIsFree(true);
      }
      if (subscription.discount_value && subscription.discount_value > 0) {
        setApplyDiscount(true);
        setDiscountType(subscription.discount_type || "percentage");
        setDiscountValue(String(subscription.discount_value));
      }
      if (subscription.trial_days && subscription.trial_days > 0) {
        setTrialDays(String(subscription.trial_days));
      }
    }
  }, [subscription, open]);

  const selectedRegion = regions?.find((r) => r.id === selectedRegionId);
  const selectedPlan = plans?.find((p) => p.plan_slug === selectedPlanSlug);

  // Calculate final price
  const basePrice = selectedPlan?.price || 0;
  let finalPrice = basePrice;
  const dv = parseFloat(discountValue) || 0;

  if (applyDiscount && dv > 0) {
    if (discountType === "percentage") {
      finalPrice = basePrice * (1 - dv / 100);
    } else if (discountType === "fixed_amount") {
      finalPrice = Math.max(0, basePrice - dv);
    }
  }
  if (isFree) finalPrice = 0;

  // Promo code lookup
  const handlePromoLookup = async () => {
    if (!promoCode.trim()) return;
    const { data, error } = await supabase
      .from("platform_promo_codes")
      .select("*")
      .eq("code", promoCode.trim().toUpperCase())
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) {
      toast.error("Promo code not found or inactive");
      setMatchedPromo(null);
      return;
    }
    // Check plan applicability
    if (data.applicable_plan_slugs && selectedPlanSlug && !data.applicable_plan_slugs.includes(selectedPlanSlug)) {
      toast.error("This promo code doesn't apply to the selected plan");
      setMatchedPromo(null);
      return;
    }
    setMatchedPromo(data as PromoCode);
    setDiscountType(data.discount_type);
    setDiscountValue(String(data.discount_value));
    setApplyDiscount(true);
    toast.success(`Promo code applied: ${data.description || data.code}`);
  };

  const handleAssign = async () => {
    if (!selectedPlanSlug || !selectedRegionId) return;
    setSaving(true);
    try {
      const billingStatus = isFree ? "free" : "pending_payment";
      const record: Record<string, unknown> = {
        tenant_id: tenant.id,
        region_id: selectedRegionId,
        assigned_plan_slug: selectedPlanSlug,
        plan_slug: selectedPlanSlug,
        billing_status: billingStatus,
        status: isFree ? "active" : "incomplete",
        assigned_at: new Date().toISOString(),
        assigned_by: user?.id || null,
        trial_days: parseInt(trialDays) || 0,
        discount_type: applyDiscount ? discountType : null,
        discount_value: applyDiscount ? (parseFloat(discountValue) || 0) : 0,
        promo_code_id: matchedPromo?.id || null,
      };

      const { error } = await supabase
        .from("tenant_subscriptions")
        .upsert(record as any, { onConflict: "tenant_id" });
      if (error) throw error;

      // Sync plan_slug to tenants table
      await supabase
        .from("tenants")
        .update({ plan_slug: selectedPlanSlug })
        .eq("id", tenant.id);

      // Cascade plan to tenants.assigned_* + branch_subscriptions
      let branchesUpdated = 0;
      try {
        const { data: cascadeData, error: cascadeErr } = await supabase.functions.invoke(
          "assign-tenant-plan",
          {
            body: {
              tenant_id: tenant.id,
              assigned_plan_slug: selectedPlanSlug,
              assigned_region_id: selectedRegionId,
              assigned_discount_type: applyDiscount ? discountType : null,
              assigned_discount_value: applyDiscount ? (parseFloat(discountValue) || 0) : null,
              assigned_trial_days: parseInt(trialDays) || 0,
            },
          }
        );
        if (cascadeErr) throw cascadeErr;
        branchesUpdated = (cascadeData as any)?.branches_updated ?? 0;
      } catch (e: any) {
        toast.error(`Saved subscription, but branch cascade failed: ${e.message}`);
      }

      // Increment promo code usage
      if (matchedPromo) {
        await supabase
          .from("platform_promo_codes")
          .update({ times_used: (matchedPromo as any).times_used + 1 })
          .eq("id", matchedPromo.id);
      }

      queryClient.invalidateQueries({ queryKey: ["tenant_subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      queryClient.invalidateQueries({ queryKey: ["tenant_plan_assignment"] });
      queryClient.invalidateQueries({ queryKey: ["branch_subscriptions"] });
      const branchSuffix = branchesUpdated
        ? ` (applied to ${branchesUpdated} branch${branchesUpdated === 1 ? "" : "es"})`
        : "";
      toast.success(
        isFree
          ? `${selectedPlanSlug} assigned as free for ${tenant.name}${branchSuffix}`
          : `${selectedPlanSlug} assigned to ${tenant.name} — pending payment${branchSuffix}`
      );
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to assign subscription");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Assign Subscription — {tenant.name}
          </DialogTitle>
        </DialogHeader>

        {/* Current status */}
        {subscription && (
          <div className="space-y-1 pb-2 border-b">
            <p className="text-sm text-muted-foreground">Current status</p>
            <div className="flex items-center gap-2">
              <span className="font-medium capitalize">
                {(subscription.assigned_plan_slug || subscription.plan_slug || "starter").replace("_", "-")}
              </span>
              <Badge variant="outline" className={statusColors[subscription.billing_status] || statusColors[subscription.status] || ""}>
                {subscription.billing_status || subscription.status}
              </Badge>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Region */}
          <div className="space-y-2">
            <Label>Region</Label>
            <Select value={selectedRegionId || ""} onValueChange={setSelectedRegionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                {(regions ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.region_label} ({r.currency_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Plan */}
          <div className="space-y-2">
            <Label>Plan</Label>
            {plansLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <Select value={selectedPlanSlug || ""} onValueChange={setSelectedPlanSlug}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {(plans ?? []).map((plan) => (
                    <SelectItem key={plan.id} value={plan.plan_slug}>
                      {plan.plan_name} — {formatPrice(plan.price, selectedRegion?.currency_code || "USD")}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Free toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="free-toggle" className="cursor-pointer">Free subscription</Label>
            </div>
            <Switch id="free-toggle" checked={isFree} onCheckedChange={setIsFree} />
          </div>

          {/* Trial days */}
          {!isFree && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Trial days
              </Label>
              <Input
                type="number"
                min="0"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                placeholder="0"
                className="w-24"
              />
            </div>
          )}

          {/* Discount section */}
          {!isFree && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="discount-toggle" className="cursor-pointer">Apply discount</Label>
                </div>
                <Switch id="discount-toggle" checked={applyDiscount} onCheckedChange={setApplyDiscount} />
              </div>

              {applyDiscount && (
                <div className="space-y-3">
                  {/* Promo code lookup */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Tag className="h-3 w-3" /> Promo code (optional)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="PROMO2026"
                        className="h-8 text-sm"
                      />
                      <Button variant="outline" size="sm" onClick={handlePromoLookup} className="h-8">
                        Apply
                      </Button>
                    </div>
                    {matchedPromo && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        ✓ {matchedPromo.description || matchedPromo.code}
                      </p>
                    )}
                  </div>

                  {/* Manual discount */}
                  <div className="flex gap-2">
                    <Select value={discountType} onValueChange={setDiscountType}>
                      <SelectTrigger className="w-36 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed_amount">Fixed amount</SelectItem>
                        <SelectItem value="free_months">Free months</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      className="w-24 h-8 text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Price summary */}
          {selectedPlan && (
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Base price</span>
                <span>{formatPrice(basePrice, selectedRegion?.currency_code || "USD")}/mo</span>
              </div>
              {applyDiscount && !isFree && (
                <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                  <span>Discount</span>
                  <span>
                    {discountType === "percentage" ? `−${discountValue}%` :
                     discountType === "fixed_amount" ? `−${formatPrice(parseFloat(discountValue) || 0, selectedRegion?.currency_code || "USD")}` :
                     `${discountValue} free months`}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Final price</span>
                <span>
                  {isFree ? (
                    <Badge variant="secondary" className="gap-1"><Gift className="h-3 w-3" /> Free</Badge>
                  ) : (
                    `${formatPrice(finalPrice, selectedRegion?.currency_code || "USD")}/mo`
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedPlanSlug || !selectedRegionId || saving}
            className="w-full sm:w-auto"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFree ? "Assign (Free)" : "Assign (Pending Payment)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
