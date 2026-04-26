import { useTenantContext } from "@/hooks/useTenantContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClipboardList } from "lucide-react";
import { formatPrice } from "@/lib/formatCurrency";

const BranchOrders = () => {
  const { branchId, tenantId } = useTenantContext();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["branch-orders", branchId],
    queryFn: async () => {
      if (!branchId || !tenantId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, company_name, order_status, admin_status, total_amount, currency, created_at")
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId)
        .neq("order_status", "cart")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!tenantId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Branch Orders</h1>
        <p className="text-sm text-muted-foreground">Orders assigned to your branch</p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading orders…</div>
      ) : !orders?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
            No orders found for your branch.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.order_number || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.customer_name || o.company_name || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{o.admin_status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatPrice(Number(o.total_amount ?? 0), o.currency ?? "ZAR")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BranchOrders;
