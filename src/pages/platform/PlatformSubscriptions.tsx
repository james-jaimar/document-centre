import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenants } from "@/hooks/useTenants";
import {
  useTenantSubscriptions,
  useAllPlatformPricingPlans,
  useUpdateTenantPlan,
  useUpsertSubscription,
  type TenantSubscription,
} from "@/hooks/useTenantSubscriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatCurrency";
import { CreditCard, Loader2, Building2, ArrowUpCircle, XCircle, Zap } from "lucide-react";
import type { Tenant } from "@/hooks/useTenants";

interface CheckoutRegion {
  id: string;
  region_code: string;
  region_label: string;
  currency_code: string;
  currency_symbol: string;
  is_default: boolean;
  sort_order: number;
}

interface CheckoutPlan {
  id: string;
  plan_slug: string;
  plan_name: string;
  price: number;
  stripe_price_id: string | null;
  sort_order: number;
}

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸", UK: "🇬🇧", EU: "🇪🇺", AU: "🇦🇺", ZA: "🇿🇦",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  canceled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  incomplete: "bg-muted text-muted-foreground",
};

const PLAN_SLUGS = ["starter", "core", "multi_branch"];

export default function PlatformSubscriptions() {
  const { data: tenants, isLoading: tenantsLoading } = useTenants();
  const { data: subscriptions, isLoading: subsLoading } = useTenantSubscriptions();
  const { data: plans } = useAllPlatformPricingPlans();
  const updatePlan = useUpdateTenantPlan();
  const upsertSub = useUpsertSubscription();

  const [assignDialog, setAssignDialog] = useState<Tenant | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [checkoutTenant, setCheckoutTenant] = useState<Tenant | null>(null);
  const [checkoutRegionId, setCheckoutRegionId] = useState<string | null>(null);
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  // Fetch regions for checkout dialog
  const { data: checkoutRegions } = useQuery({
    queryKey: ["platform_pricing_regions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_regions")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as CheckoutRegion[];
    },
    enabled: !!checkoutTenant,
  });

  // Fetch plans for selected checkout region
  const { data: checkoutPlans, isLoading: checkoutPlansLoading } = useQuery({
    queryKey: ["platform_pricing_plans", "checkout_dialog", checkoutRegionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_plans")
        .select("*")
        .eq("region_id", checkoutRegionId!)
        .not("stripe_price_id", "is", null)
        .order("sort_order");
      if (error) throw error;
      return data as CheckoutPlan[];
    },
    enabled: !!checkoutRegionId,
  });

  // Auto-select default region when checkout dialog opens
  useEffect(() => {
    if (checkoutTenant && checkoutRegions && !checkoutRegionId) {
      const def = checkoutRegions.find((r) => r.is_default) || checkoutRegions[0];
      if (def) setCheckoutRegionId(def.id);
    }
  }, [checkoutTenant, checkoutRegions, checkoutRegionId]);

  // Reset plan when region changes
  useEffect(() => {
    setSelectedPriceId(null);
  }, [checkoutRegionId]);

  const selectedCheckoutRegion = checkoutRegions?.find((r) => r.id === checkoutRegionId);

  const subByTenant = (subscriptions ?? []).reduce<Record<string, TenantSubscription>>(
    (acc, s) => {
      acc[s.tenant_id] = s;
      return acc;
    },
    {}
  );

  const stripePlans = (plans ?? []).filter((p) => p.stripe_price_id);

  const handleAssignPlan = async () => {
    if (!assignDialog) return;
    try {
      await updatePlan.mutateAsync({
        tenantId: assignDialog.id,
        planSlug: selectedPlan,
      });
      toast.success(`Plan updated to ${selectedPlan} for ${assignDialog.name}`);
      setAssignDialog(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCancelSubscription = async (tenant: Tenant, sub: TenantSubscription) => {
    if (!confirm(`Cancel subscription for ${tenant.name}? This will downgrade to Starter.`)) return;
    try {
      await upsertSub.mutateAsync({
        tenant_id: tenant.id,
        stripe_customer_id: sub.stripe_customer_id,
        plan_slug: "starter",
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      });
      await updatePlan.mutateAsync({ tenantId: tenant.id, planSlug: "starter" });
      toast.success(`Subscription cancelled for ${tenant.name}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleActivateManually = async (tenant: Tenant, planSlug: string) => {
    if (!confirm(`Manually activate "${planSlug}" for ${tenant.name}? No Stripe checkout will be created.`)) return;
    try {
      await upsertSub.mutateAsync({
        tenant_id: tenant.id,
        stripe_customer_id: `manual_${tenant.id.slice(0, 8)}`,
        plan_slug: planSlug,
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await updatePlan.mutateAsync({ tenantId: tenant.id, planSlug });
      toast.success(`Manually activated ${planSlug} for ${tenant.name}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCheckout = async () => {
    if (!checkoutTenant || !selectedPriceId) return;
    setCheckingOut(true);
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          tenant_id: checkoutTenant.id,
          price_id: selectedPriceId,
          success_url: `${origin}/platform/subscriptions?checkout=success`,
          cancel_url: `${origin}/platform/subscriptions?checkout=cancelled`,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to create checkout session");
    } finally {
      setCheckingOut(false);
    }
  };

  const isLoading = tenantsLoading || subsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subscription Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage tenant subscriptions, assign plans, and trigger billing
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_SLUGS.map((slug) => {
          const count = (tenants ?? []).filter(
            (t) => (subByTenant[t.id]?.plan_slug || t.plan_slug || "starter") === slug
          ).length;
          return (
            <Card key={slug}>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground capitalize">{slug.replace("_", "-")}</p>
                <p className="text-3xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">tenants</p>
              </CardContent>
            </Card>
          );
        })}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active Subscriptions</p>
            <p className="text-3xl font-bold">
              {(subscriptions ?? []).filter((s) => s.status === "active").length}
            </p>
            <p className="text-xs text-muted-foreground">via Stripe</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> All Tenants
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Current Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Period End</TableHead>
                    <TableHead>Stripe Customer</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tenants ?? []).map((tenant) => {
                    const sub = subByTenant[tenant.id];
                    const planSlug = sub?.plan_slug || tenant.plan_slug || "starter";
                    return (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{tenant.name}</p>
                              <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {planSlug.replace("_", "-")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {sub ? (
                            <Badge variant="outline" className={STATUS_COLORS[sub.status] || ""}>
                              {sub.status}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No subscription</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {sub?.current_period_end
                            ? new Date(sub.current_period_end).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-muted-foreground">
                            {sub?.stripe_customer_id
                              ? sub.stripe_customer_id.startsWith("manual_")
                                ? "Manual"
                                : sub.stripe_customer_id.slice(0, 18) + "…"
                              : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setAssignDialog(tenant);
                                setSelectedPlan(planSlug);
                              }}
                              title="Assign plan manually"
                            >
                              <ArrowUpCircle className="h-4 w-4 mr-1" />
                              Assign
                            </Button>
                            {stripePlans.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setCheckoutTenant(tenant);
                                  setCheckoutRegionId(null);
                                  setSelectedPriceId(null);
                                }}
                                title="Trigger Stripe checkout"
                              >
                                <Zap className="h-4 w-4 mr-1" />
                                Checkout
                              </Button>
                            )}
                            {sub && sub.status === "active" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleCancelSubscription(tenant, sub)}
                                title="Cancel subscription"
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Plan Assignment Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Plan — {assignDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Plan</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_SLUGS.map((slug) => (
                    <SelectItem key={slug} value={slug}>
                      {slug.replace("_", "-").charAt(0).toUpperCase() + slug.replace("_", "-").slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                This updates the tenant's plan directly without billing.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleAssignPlan}
                disabled={updatePlan.isPending}
              >
                {updatePlan.isPending ? "Saving…" : "Update Plan Only"}
              </Button>
              {assignDialog && (
                <Button
                  className="flex-1"
                  onClick={() => {
                    handleActivateManually(assignDialog, selectedPlan);
                    setAssignDialog(null);
                  }}
                  disabled={upsertSub.isPending}
                >
                  {upsertSub.isPending ? "Activating…" : "Activate + Create Sub Record"}
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignDialog(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stripe Checkout Dialog */}
      <Dialog open={!!checkoutTenant} onOpenChange={() => setCheckoutTenant(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stripe Checkout — {checkoutTenant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a region and plan to start a checkout session.
            </p>

            {/* Region dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Region</label>
              <Select
                value={checkoutRegionId || ""}
                onValueChange={setCheckoutRegionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {(checkoutRegions ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {FLAG_MAP[r.region_code] || ""} {r.region_label} ({r.currency_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Plan dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Plan</label>
              {checkoutPlansLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
                </div>
              ) : !checkoutPlans?.length ? (
                <p className="text-sm text-muted-foreground py-2">
                  No Stripe-linked plans for this region.
                </p>
              ) : (
                <Select
                  value={selectedPriceId || ""}
                  onValueChange={setSelectedPriceId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {checkoutPlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.stripe_price_id!}>
                        {plan.plan_name} — {formatPrice(plan.price, selectedCheckoutRegion?.currency_code || "USD")}/mo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCheckoutTenant(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={!selectedPriceId || checkingOut}
              className="w-full sm:w-auto"
            >
              {checkingOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
