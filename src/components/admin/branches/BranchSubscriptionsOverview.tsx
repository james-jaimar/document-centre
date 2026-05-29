import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CreditCard, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBranches } from "@/hooks/useBranches";
import { useTenantBranchSubscriptions } from "@/hooks/useBranchSubscriptions";
import { useTenantContext } from "@/hooks/useTenantContext";
import { buildAdminPath } from "@/lib/adminRouting";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  past_due: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export function BranchSubscriptionsOverview() {
  const { tenantId } = useTenantContext();
  const { data: branches, isLoading: branchesLoading } = useBranches(tenantId);
  const { data: subs, isLoading: subsLoading } = useTenantBranchSubscriptions(tenantId);
  const navigate = useNavigate();

  if (branchesLoading || subsLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading branch subscriptions…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" /> Branch Subscriptions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {(branches ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground p-6">No branches yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Assigned plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Renews</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(branches ?? []).map((b) => {
                const s = (subs ?? []).find((x) => x.branch_id === b.id);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="capitalize">{s?.assigned_plan_slug || "—"}</TableCell>
                    <TableCell>
                      {s?.status ? (
                        <Badge variant="outline" className={statusColors[s.status] || ""}>{s.status}</Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {s?.billing_status ? (
                        <Badge variant="outline" className={statusColors[s.billing_status] || ""}>
                          {s.billing_status.replace("_", " ")}
                        </Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s?.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => navigate(buildAdminPath(`/admin/branches/${b.id}`, tenantId))}>
                        Manage <ExternalLink className="ml-1.5 h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
