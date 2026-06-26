import { useTenantContext } from "@/hooks/useTenantContext";
import { BranchSubscriptionsOverview } from "@/components/admin/branches/BranchSubscriptionsOverview";
import { TenantPlanAssignmentCard } from "@/components/admin/billing/TenantPlanAssignmentCard";

export function BillingTab() {
  const { tenantId } = useTenantContext();

  return (
    <div className="space-y-6">
      {tenantId && <TenantPlanAssignmentCard tenantId={tenantId} />}
      <BranchSubscriptionsOverview />
    </div>
  );
}

