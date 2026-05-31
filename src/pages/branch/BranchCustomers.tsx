import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Search, Users, MoreHorizontal, KeyRound, Pencil, ListOrdered } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useBranchCustomers, type BranchCustomerRow } from "@/hooks/useBranchCustomers";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useManageUser } from "@/hooks/useManageUser";
import { formatPrice } from "@/lib/formatCurrency";
import { resolveDisplayName } from "@/lib/displayName";
import { BranchCustomerEditDialog } from "@/components/branch/BranchCustomerEditDialog";

export default function BranchCustomers() {
  const { tenantId, appId, branchId } = useTenantContext();
  const { data, isLoading, error } = useBranchCustomers();
  const manage = useManageUser();
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<BranchCustomerRow | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) => {
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.display_name ?? ""}`.toLowerCase();
      return (
        name.includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search]);

  const handleResetPassword = (c: BranchCustomerRow) => {
    if (!tenantId || !appId || !branchId || !c.email) return;
    manage.mutate({
      action: "force_password_reset",
      target_profile_id: c.profile_id,
      tenant_id: tenantId,
      app_id: appId,
      branch_id: branchId,
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="h-6 w-6" />
          Customers
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customers who have placed an order or requested a quote at your branch.
        </p>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-12 text-center text-destructive">
            <p className="font-medium">Couldn't load customers.</p>
            <p className="text-sm text-muted-foreground mt-1">{(error as any)?.message ?? "Unknown error"}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users className="mx-auto h-10 w-10 opacity-40 mb-3" />
            <p>{search ? "No customers match your search." : "No customers have transacted at this branch yet."}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead>Last order</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const name = resolveDisplayName(c, "—");
                return (
                  <TableRow key={c.profile_id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-right">{c.order_count}</TableCell>
                    <TableCell className="text-right">{formatPrice(c.total_spent)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.last_order_at
                        ? formatDistanceToNow(new Date(c.last_order_at), { addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditTarget(c)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit contact details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleResetPassword(c)}
                            disabled={!c.email || manage.isPending}
                          >
                            <KeyRound className="h-4 w-4 mr-2" /> Send password reset
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/branch/orders?customer=${c.profile_id}`}>
                              <ListOrdered className="h-4 w-4 mr-2" /> View orders
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {editTarget && (
        <BranchCustomerEditDialog
          open={!!editTarget}
          onOpenChange={(v) => !v && setEditTarget(null)}
          profileId={editTarget.profile_id}
          initial={{
            first_name: editTarget.first_name,
            last_name: editTarget.last_name,
            display_name: editTarget.display_name,
            phone: editTarget.phone,
            email: editTarget.email,
          }}
        />
      )}
    </div>
  );
}
