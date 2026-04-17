import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTenantCustomers } from "@/hooks/useTenantCustomers";
import { useTenantContext } from "@/hooks/useTenantContext";
import { buildAdminPath } from "@/lib/adminRouting";

const ZAR = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

export default function AdminCustomers() {
  const { data, isLoading } = useTenantCustomers();
  const { tenantId } = useTenantContext();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) => {
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.display_name ?? ""}`.toLowerCase();
      return name.includes(q) || (c.email ?? "").toLowerCase().includes(q);
    });
  }, [data, search]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6" />
            Customers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All customers who have placed orders or signed up to your storefront.
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
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
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users className="mx-auto h-10 w-10 opacity-40 mb-3" />
            <p>No customers yet.</p>
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
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const name =
                  c.display_name ||
                  [c.first_name, c.last_name].filter(Boolean).join(" ") ||
                  c.email?.split("@")[0] ||
                  "—";
                return (
                  <TableRow key={c.profile_id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link
                        to={buildAdminPath(`/admin/customers/${c.profile_id}`, tenantId)}
                        className="hover:underline"
                      >
                        {name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-right">{c.order_count}</TableCell>
                    <TableCell className="text-right font-medium">{ZAR.format(c.total_spent)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.last_order_at
                        ? formatDistanceToNow(new Date(c.last_order_at), { addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? "default" : "secondary"}>
                        {c.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
