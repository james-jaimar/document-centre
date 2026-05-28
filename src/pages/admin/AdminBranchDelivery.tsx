import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranches } from "@/hooks/useBranches";
import DeliveryEditor from "@/components/delivery/DeliveryEditor";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { buildAdminPath } from "@/lib/adminRouting";

export default function AdminBranchDelivery() {
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenantContext();
  const { data: branches } = useBranches(tenantId);
  const branch = branches?.find((b) => b.id === id);

  if (!tenantId || !id) return <div className="p-6 text-sm text-muted-foreground">No branch.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <Link to={buildAdminPath(`/admin/branches/${id}`)}>
        <Button variant="ghost" size="sm"><ArrowLeft className="size-4 mr-1" />Back to branch</Button>
      </Link>
      <DeliveryEditor
        scope="branch"
        tenantId={tenantId}
        branchId={id}
        title={`Delivery — ${branch?.name ?? "Branch"}`}
        description="Branch-specific overrides. If empty, the tenant defaults apply. Use 'Reset from tenant' to seed this branch with the tenant zones and rates, then customise."
      />
    </div>
  );
}
