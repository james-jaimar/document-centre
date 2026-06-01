import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, AlertCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantSubscriptions } from "@/hooks/useTenantSubscriptions";
import { BranchSubscriptionsOverview } from "@/components/admin/branches/BranchSubscriptionsOverview";
import { TenantPlanAssignmentCard } from "@/components/admin/billing/TenantPlanAssignmentCard";

interface PricingRegion {
  id: string;
  region_code: string;
  region_label: string;
  currency_code: string;
  currency_symbol: string;
}

export function BillingTab() {
  const { tenantId } = useTenantContext();
  const { data: allSubscriptions, isLoading: subsLoading } = useTenantSubscriptions();

  const subscription = allSubscriptions?.find((s) => s.tenant_id === tenantId);

  const { data: region } = useQuery({
    queryKey: ["platform_pricing_region", subscription?.region_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_regions")
        .select("*")
        .eq("id", subscription!.region_id!)
        .single();
      if (error) throw error;
      return data as PricingRegion;
    },
    enabled: !!subscription?.region_id,
  });

  const hasPlan = !!subscription?.assigned_plan_slug;

  return (
    <div className="space-y-6">
      {tenantId && <TenantPlanAssignmentCard tenantId={tenantId} />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5" />
            Tenant Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plan details…
            </div>
          ) : !hasPlan ? (
            <div className="text-center py-8 space-y-3">
              <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-lg font-medium">No plan assigned</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Your account doesn't have a plan yet. Please contact your platform administrator.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold capitalize">
                    {subscription!.assigned_plan_slug?.replace(/_/g, "-")}
                  </p>
                  {region && (
                    <p className="text-sm text-muted-foreground">{region.region_label}</p>
                  )}
                </div>
                <Badge variant="outline">Assigned</Badge>
              </div>

              {(subscription!.discount_value && subscription!.discount_value > 0) || (subscription!.trial_days && subscription!.trial_days > 0) ? (
                <div className="rounded-md bg-muted/50 p-3 space-y-1 text-sm">
                  {subscription!.discount_value && subscription!.discount_value > 0 && (
                    <div className="flex justify-between">
                      <span>Discount</span>
                      <span>
                        {subscription!.discount_type === "percentage"
                          ? `${subscription!.discount_value}% off`
                          : `${subscription!.discount_value} off`}
                      </span>
                    </div>
                  )}
                  {subscription!.trial_days && subscription!.trial_days > 0 && (
                    <div className="flex justify-between">
                      <span>Free trial</span>
                      <span>{subscription!.trial_days} days</span>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Each branch is billed individually. See <strong>Branch Subscriptions</strong> below to pay per branch.
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <BranchSubscriptionsOverview />
    </div>
  );
}
