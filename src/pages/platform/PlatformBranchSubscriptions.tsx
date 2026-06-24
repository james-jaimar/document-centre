import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Settings2, Search } from "lucide-react";
import {
  usePlatformBranchSubscriptions,
  type PlatformBranchSubscription,
} from "@/hooks/usePlatformSubscriptions";
import { SubscriptionOverrideDialog } from "@/components/platform/SubscriptionOverrideDialog";

const STATUS_VARIANTS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  trialing: "bg-blue-100 text-blue-800",
  past_due: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-800",
  canceled: "bg-red-100 text-red-800",
};

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

export default function PlatformBranchSubscriptions() {
  const { data, isLoading } = usePlatformBranchSubscriptions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<PlatformBranchSubscription | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (statusFilter !== "all" && (r.status ?? "") !== statusFilter) return false;
      if (!q) return true;
      return [r.tenant_name, r.branch_name, r.plan_slug, r.stripe_subscription_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [data, search, statusFilter]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Branch Subscriptions</h1>
        <p className="text-muted-foreground">All branches across every tenant, with manual override controls.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Subscriptions ({rows.length})</CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenant / branch / Stripe ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-72"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="past_due">Past due</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trial ends</TableHead>
                  <TableHead>Period end</TableHead>
                  <TableHead>Grace</TableHead>
                  <TableHead>Comp</TableHead>
                  <TableHead>Storefront</TableHead>
                  <TableHead className="text-right">Override</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.subscription_id}>
                    <TableCell className="font-medium">{r.tenant_name}</TableCell>
                    <TableCell>{r.branch_name}</TableCell>
                    <TableCell>{r.plan_slug ?? r.assigned_plan_slug ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_VARIANTS[r.status ?? ""] ?? "bg-muted text-muted-foreground"}>
                        {r.status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{fmt(r.trial_ends_at)}</TableCell>
                    <TableCell className="text-sm">{fmt(r.current_period_end)}</TableCell>
                    <TableCell className="text-sm">{fmt(r.grace_until)}</TableCell>
                    <TableCell className="text-sm">{fmt(r.comp_until)}</TableCell>
                    <TableCell>
                      {r.storefront_closed_at ? (
                        <Badge variant="destructive">Closed</Badge>
                      ) : (
                        <Badge variant="outline">Open</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                        <Settings2 className="h-4 w-4 mr-1" /> Override
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No subscriptions match the filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SubscriptionOverrideDialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        subscription={selected}
      />
    </div>
  );
}
