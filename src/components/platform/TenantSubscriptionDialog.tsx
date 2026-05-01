import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatCurrency";
import type { TenantSubscription } from "@/hooks/useTenantSubscriptions";
import type { Tenant } from "@/hooks/useTenants";

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
};

export function TenantSubscriptionDialog({ open, onOpenChange, tenant, subscription }: Props) {
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Fetch plans for selected region
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["platform_pricing_plans", "checkout", selectedRegionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_plans")
        .select("*")
        .eq("region_id", selectedRegionId!)
        .not("stripe_price_id", "is", null)
        .order("sort_order");
      if (error) throw error;
      return data as PricingPlan[];
    },
    enabled: !!selectedRegionId,
  });

  // Auto-select default region
  useEffect(() => {
    if (regions && !selectedRegionId) {
      const def = regions.find((r) => r.is_default) || regions[0];
      if (def) setSelectedRegionId(def.id);
    }
  }, [regions, selectedRegionId]);

  // Reset plan selection when region changes
  useEffect(() => {
    setSelectedPriceId(null);
  }, [selectedRegionId]);

  const selectedRegion = regions?.find((r) => r.id === selectedRegionId);

  const handleCheckout = async () => {
    if (!selectedPriceId) return;
    setLoading(true);
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          tenant_id: tenant.id,
          price_id: selectedPriceId,
          success_url: `${origin}/platform?checkout=success`,
          cancel_url: `${origin}/platform?checkout=cancelled`,
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
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription — {tenant.name}
          </DialogTitle>
        </DialogHeader>

        {/* Current status */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Current plan</p>
          <div className="flex items-center gap-2">
            <span className="font-medium capitalize">
              {(subscription?.plan_slug || tenant.plan_slug || "starter").replace("_", "-")}
            </span>
            {subscription ? (
              <Badge variant="outline" className={statusColors[subscription.status] || ""}>
                {subscription.status}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                No subscription
              </Badge>
            )}
          </div>
          {subscription?.current_period_end && (
            <p className="text-xs text-muted-foreground">
              Current period ends {new Date(subscription.current_period_end).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Region selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Region</label>
          <Select
            value={selectedRegionId || ""}
            onValueChange={setSelectedRegionId}
          >
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

        {/* Plan selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Plan</label>
          {plansLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </div>
          ) : !plans?.length ? (
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
                {plans.map((plan) => {
                  const isCurrent =
                    subscription?.plan_slug === plan.plan_slug &&
                    subscription?.status === "active";
                  return (
                    <SelectItem
                      key={plan.id}
                      value={plan.stripe_price_id!}
                      disabled={isCurrent}
                    >
                      {plan.plan_name} — {formatPrice(plan.price, selectedRegion?.currency_code || "USD")}/mo
                      {isCurrent ? " (current)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleCheckout}
            disabled={!selectedPriceId || loading}
            className="w-full sm:w-auto"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Checkout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
