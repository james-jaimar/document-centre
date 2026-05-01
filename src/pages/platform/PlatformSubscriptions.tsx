import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  CreditCard,
  Loader2,
  Building2,
  ArrowUpCircle,
  XCircle,
  Tag,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Tenant } from "@/hooks/useTenants";
import { TenantSubscriptionDialog } from "@/components/platform/TenantSubscriptionDialog";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  canceled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  incomplete: "bg-muted text-muted-foreground",
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  free: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  manual: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const BILLING_LABELS: Record<string, string> = {
  pending_payment: "Pending Payment",
  paid: "Paid",
  free: "Free",
  manual: "Manual",
};

const PLAN_SLUGS = ["starter", "core", "multi_branch"];

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  currency_code: string | null;
  max_uses: number | null;
  times_used: number;
  valid_from: string | null;
  valid_until: string | null;
  applicable_plan_slugs: string[] | null;
  is_active: boolean;
  created_at: string;
}

export default function PlatformSubscriptions() {
  const queryClient = useQueryClient();
  const { data: tenants, isLoading: tenantsLoading } = useTenants();
  const { data: subscriptions, isLoading: subsLoading } = useTenantSubscriptions();
  const { data: plans } = useAllPlatformPricingPlans();
  const updatePlan = useUpdateTenantPlan();
  const upsertSub = useUpsertSubscription();

  const [assignDialog, setAssignDialog] = useState<Tenant | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [subTenant, setSubTenant] = useState<Tenant | null>(null);

  // Promo codes state
  const [promoDialog, setPromoDialog] = useState<PromoCode | null | "new">(null);
  const [promoForm, setPromoForm] = useState({
    code: "",
    description: "",
    discount_type: "percentage",
    discount_value: "0",
    currency_code: "",
    max_uses: "",
    valid_from: "",
    valid_until: "",
    applicable_plan_slugs: "",
    is_active: true,
  });

  // Fetch promo codes
  const { data: promoCodes, isLoading: promosLoading } = useQuery({
    queryKey: ["platform_promo_codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_promo_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PromoCode[];
    },
  });

  const subByTenant = (subscriptions ?? []).reduce<Record<string, TenantSubscription>>(
    (acc, s) => {
      acc[s.tenant_id] = s;
      return acc;
    },
    {}
  );

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
        billing_status: "pending_payment",
        cancelled_at: new Date().toISOString(),
      });
      await updatePlan.mutateAsync({ tenantId: tenant.id, planSlug: "starter" });
      toast.success(`Subscription cancelled for ${tenant.name}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const openPromoForm = (promo: PromoCode | "new") => {
    if (promo === "new") {
      setPromoForm({
        code: "",
        description: "",
        discount_type: "percentage",
        discount_value: "0",
        currency_code: "",
        max_uses: "",
        valid_from: "",
        valid_until: "",
        applicable_plan_slugs: "",
        is_active: true,
      });
    } else {
      setPromoForm({
        code: promo.code,
        description: promo.description || "",
        discount_type: promo.discount_type,
        discount_value: String(promo.discount_value),
        currency_code: promo.currency_code || "",
        max_uses: promo.max_uses ? String(promo.max_uses) : "",
        valid_from: promo.valid_from ? promo.valid_from.slice(0, 10) : "",
        valid_until: promo.valid_until ? promo.valid_until.slice(0, 10) : "",
        applicable_plan_slugs: promo.applicable_plan_slugs?.join(", ") || "",
        is_active: promo.is_active,
      });
    }
    setPromoDialog(promo);
  };

  const handleSavePromo = async () => {
    const record = {
      code: promoForm.code.toUpperCase().trim(),
      description: promoForm.description || null,
      discount_type: promoForm.discount_type,
      discount_value: parseFloat(promoForm.discount_value) || 0,
      currency_code: promoForm.currency_code || null,
      max_uses: promoForm.max_uses ? parseInt(promoForm.max_uses) : null,
      valid_from: promoForm.valid_from ? new Date(promoForm.valid_from).toISOString() : null,
      valid_until: promoForm.valid_until ? new Date(promoForm.valid_until).toISOString() : null,
      applicable_plan_slugs: promoForm.applicable_plan_slugs
        ? promoForm.applicable_plan_slugs.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
      is_active: promoForm.is_active,
    };

    try {
      if (promoDialog === "new") {
        const { error } = await supabase.from("platform_promo_codes").insert(record);
        if (error) throw error;
        toast.success("Promo code created");
      } else if (promoDialog) {
        const { error } = await supabase
          .from("platform_promo_codes")
          .update(record)
          .eq("id", promoDialog.id);
        if (error) throw error;
        toast.success("Promo code updated");
      }
      queryClient.invalidateQueries({ queryKey: ["platform_promo_codes"] });
      setPromoDialog(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeletePromo = async (id: string) => {
    if (!confirm("Delete this promo code?")) return;
    try {
      const { error } = await supabase.from("platform_promo_codes").delete().eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["platform_promo_codes"] });
      toast.success("Promo code deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const isLoading = tenantsLoading || subsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subscription Management</h1>
        <p className="text-sm text-muted-foreground">
          Assign plans, manage discounts, and track tenant billing
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            <p className="text-sm text-muted-foreground">Pending Payment</p>
            <p className="text-3xl font-bold">
              {(subscriptions ?? []).filter((s) => s.billing_status === "pending_payment").length}
            </p>
            <p className="text-xs text-muted-foreground">awaiting tenant action</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active / Paid</p>
            <p className="text-3xl font-bold">
              {(subscriptions ?? []).filter((s) => s.billing_status === "paid" || s.billing_status === "free" || s.status === "active").length}
            </p>
            <p className="text-xs text-muted-foreground">live subscriptions</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="subscriptions" className="w-full">
        <TabsList>
          <TabsTrigger value="subscriptions" className="gap-2">
            <CreditCard className="h-4 w-4" /> Subscriptions
          </TabsTrigger>
          <TabsTrigger value="promo-codes" className="gap-2">
            <Tag className="h-4 w-4" /> Promo Codes
          </TabsTrigger>
        </TabsList>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions">
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
                        <TableHead>Plan</TableHead>
                        <TableHead>Billing Status</TableHead>
                        <TableHead>Stripe Status</TableHead>
                        <TableHead>Period End</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tenants ?? []).map((tenant) => {
                        const sub = subByTenant[tenant.id];
                        const planSlug = sub?.assigned_plan_slug || sub?.plan_slug || tenant.plan_slug || "starter";
                        const billingStatus = sub?.billing_status || "pending_payment";
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
                              <Badge variant="outline" className={STATUS_COLORS[billingStatus] || ""}>
                                {BILLING_LABELS[billingStatus] || billingStatus}
                              </Badge>
                              {sub?.discount_value && sub.discount_value > 0 && (
                                <span className="ml-1 text-xs text-green-600 dark:text-green-400">
                                  {sub.discount_type === "percentage" ? `−${sub.discount_value}%` : "discounted"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {sub ? (
                                <Badge variant="outline" className={STATUS_COLORS[sub.status] || ""}>
                                  {sub.status}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {sub?.current_period_end
                                ? new Date(sub.current_period_end).toLocaleDateString()
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSubTenant(tenant)}
                                  title="Assign subscription"
                                >
                                  <ArrowUpCircle className="h-4 w-4 mr-1" />
                                  Assign
                                </Button>
                                {sub && (sub.status === "active" || sub.billing_status === "paid" || sub.billing_status === "free") && (
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
        </TabsContent>

        {/* Promo Codes Tab */}
        <TabsContent value="promo-codes">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" /> Promo Codes
                </CardTitle>
                <Button size="sm" onClick={() => openPromoForm("new")}>
                  <Plus className="h-4 w-4 mr-1" /> New Code
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {promosLoading ? (
                <div className="flex items-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : !promoCodes?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No promo codes yet. Create one to offer discounts to tenants.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Uses</TableHead>
                        <TableHead>Valid</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {promoCodes.map((promo) => (
                        <TableRow key={promo.id}>
                          <TableCell className="font-mono font-semibold">{promo.code}</TableCell>
                          <TableCell className="text-sm">{promo.description || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {promo.discount_type === "percentage"
                              ? `${promo.discount_value}%`
                              : promo.discount_type === "free_months"
                              ? `${promo.discount_value} free months`
                              : `${promo.currency_code || ""} ${promo.discount_value}`}
                          </TableCell>
                          <TableCell className="text-sm">
                            {promo.times_used}
                            {promo.max_uses ? ` / ${promo.max_uses}` : ""}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {promo.valid_from
                              ? new Date(promo.valid_from).toLocaleDateString()
                              : "—"}{" "}
                            →{" "}
                            {promo.valid_until
                              ? new Date(promo.valid_until).toLocaleDateString()
                              : "∞"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={promo.is_active ? "default" : "secondary"}>
                              {promo.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openPromoForm(promo)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => handleDeletePromo(promo.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assign Subscription Dialog (reuses the shared component) */}
      {subTenant && (
        <TenantSubscriptionDialog
          open={!!subTenant}
          onOpenChange={(open) => !open && setSubTenant(null)}
          tenant={subTenant}
          subscription={subByTenant[subTenant.id]}
        />
      )}

      {/* Promo Code Create/Edit Dialog */}
      <Dialog open={!!promoDialog} onOpenChange={() => setPromoDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {promoDialog === "new" ? "Create Promo Code" : "Edit Promo Code"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Code</Label>
              <Input
                value={promoForm.code}
                onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value })}
                placeholder="WELCOME50"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={promoForm.description}
                onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })}
                placeholder="50% off first month"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label>Discount Type</Label>
                <Select
                  value={promoForm.discount_type}
                  onValueChange={(v) => setPromoForm({ ...promoForm, discount_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                    <SelectItem value="free_months">Free Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24">
                <Label>Value</Label>
                <Input
                  type="number"
                  value={promoForm.discount_value}
                  onChange={(e) => setPromoForm({ ...promoForm, discount_value: e.target.value })}
                />
              </div>
            </div>
            {promoForm.discount_type === "fixed_amount" && (
              <div>
                <Label>Currency Code</Label>
                <Input
                  value={promoForm.currency_code}
                  onChange={(e) => setPromoForm({ ...promoForm, currency_code: e.target.value })}
                  placeholder="GBP"
                />
              </div>
            )}
            <div>
              <Label>Max Uses (blank = unlimited)</Label>
              <Input
                type="number"
                value={promoForm.max_uses}
                onChange={(e) => setPromoForm({ ...promoForm, max_uses: e.target.value })}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label>Valid From</Label>
                <Input
                  type="date"
                  value={promoForm.valid_from}
                  onChange={(e) => setPromoForm({ ...promoForm, valid_from: e.target.value })}
                />
              </div>
              <div className="flex-1">
                <Label>Valid Until</Label>
                <Input
                  type="date"
                  value={promoForm.valid_until}
                  onChange={(e) => setPromoForm({ ...promoForm, valid_until: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Applicable Plans (comma-separated, blank = all)</Label>
              <Input
                value={promoForm.applicable_plan_slugs}
                onChange={(e) => setPromoForm({ ...promoForm, applicable_plan_slugs: e.target.value })}
                placeholder="starter, core, multi_branch"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={promoForm.is_active}
                onChange={(e) => setPromoForm({ ...promoForm, is_active: e.target.checked })}
                id="promo-active"
              />
              <Label htmlFor="promo-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleSavePromo} disabled={!promoForm.code.trim()}>
              {promoDialog === "new" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
