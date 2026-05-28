import DeliveryEditor from "@/components/delivery/DeliveryEditor";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card, CardContent } from "@/components/ui/card";

export default function BranchDelivery() {
  const { tenantId, branchId } = useTenantContext();

  if (!tenantId) {
    return <div className="p-6 text-sm text-muted-foreground">No active tenant.</div>;
  }

  if (!branchId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            You aren't assigned to a branch yet — branch delivery isn't available.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <DeliveryEditor
        scope="branch"
        tenantId={tenantId}
        branchId={branchId}
        title="Branch Delivery"
        description="Your branch's own delivery zones, methods and rates. Use 'Reset from tenant' to seed from the tenant defaults, then customise prices and toggle methods on or off."
      />
    </div>
  );
}
