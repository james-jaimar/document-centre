import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Inbox, Clock, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

const BranchDashboard = () => {
  const { tenantId, branchId } = useTenantContext();

  const { data: counts } = useQuery({
    queryKey: ["branch-dashboard-counts", tenantId, branchId],
    queryFn: async () => {
      if (!tenantId || !branchId) return { pending: 0, inProduction: 0, complete: 0 };
      const base = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId);

      const [{ count: pending }, { count: inProduction }, { count: complete }] = await Promise.all([
        base.in("admin_status", ["new_order", "awaiting_files"]),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("branch_id", branchId)
          .eq("admin_status", "in_production"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("branch_id", branchId)
          .eq("admin_status", "completed"),
      ]);
      return {
        pending: pending ?? 0,
        inProduction: inProduction ?? 0,
        complete: complete ?? 0,
      };
    },
    enabled: !!tenantId && !!branchId,
  });

  if (!branchId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Branch Queue</h1>
        <p className="text-muted-foreground">No branch is assigned to your account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Branch Queue</h1>
        <p className="text-muted-foreground">Manage incoming orders and production status</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{counts?.pending ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Production</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{counts?.inProduction ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Complete</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{counts?.complete ?? 0}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BranchDashboard;
