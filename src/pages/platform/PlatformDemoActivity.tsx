import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Activity, Trash2, Users, ShoppingBag, Sparkles } from "lucide-react";
import { buildAdminPath } from "@/lib/adminRouting";

export default function PlatformDemoActivity() {
  const qc = useQueryClient();
  const [wiping, setWiping] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["platform_demo_stats"],
    queryFn: async () => {
      const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const week = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

      const [u24, u7, o24, o7, oTotal] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_demo", true).gte("created_at", day),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_demo", true).gte("created_at", week),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("is_demo", true).gte("created_at", day),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("is_demo", true).gte("created_at", week),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("is_demo", true),
      ]);
      return {
        users24: u24.count ?? 0,
        users7d: u7.count ?? 0,
        orders24: o24.count ?? 0,
        orders7d: o7.count ?? 0,
        ordersTotal: oTotal.count ?? 0,
      };
    },
    refetchInterval: 30_000,
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["platform_demo_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, created_at, total_amount, currency, ordered_by_profile_id, customer_email, tenant_id, order_jobs(id, product_name, quantity, configuration)")
        .eq("is_demo", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15_000,
  });

  const { data: demoTenant } = useQuery({
    queryKey: ["platform_demo_tenant"],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id").eq("slug", "demo").maybeSingle();
      return data;
    },
  });

  const handleWipe = async () => {
    if (!confirm("Wipe ALL demo orders and anonymous demo users right now? This can't be undone.")) return;
    setWiping(true);
    try {
      const { data, error } = await supabase.functions.invoke("cleanup-demo-data", {
        body: { force: true },
      });
      if (error) throw error;
      toast.success(`Wiped ${data?.deletedOrders ?? 0} order(s) and ${data?.deletedUsers ?? 0} user(s)`);
      qc.invalidateQueries({ queryKey: ["platform_demo_stats"] });
      qc.invalidateQueries({ queryKey: ["platform_demo_orders"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Wipe failed");
    } finally {
      setWiping(false);
    }
  };

  const fmt = (n: number, currency = "ZAR") =>
    new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(n || 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Demo Activity
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live feed of visitors playing with the product through the “Try it now” flow.
          </p>
        </div>
        <button
          onClick={handleWipe}
          disabled={wiping}
          className="inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {wiping ? "Wiping…" : "Wipe demo data"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Visitors (24h)" value={stats?.users24} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Visitors (7d)" value={stats?.users7d} />
        <StatCard icon={<ShoppingBag className="h-4 w-4" />} label="Orders (24h)" value={stats?.orders24} />
        <StatCard icon={<ShoppingBag className="h-4 w-4" />} label="Orders (7d)" value={stats?.orders7d} />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Orders (all)" value={stats?.ordersTotal} />
      </div>

      {/* Orders table */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3 font-semibold text-sm">Recent demo orders</div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !orders?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No demo orders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-left">Order #</th>
                  <th className="px-4 py-2 text-left">Visitor</th>
                  <th className="px-4 py-2 text-left">Products</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((o: any) => {
                  const jobs = (o.order_jobs as any[]) ?? [];
                  const productSummary = jobs
                    .map((j) => `${j.product_name}${j.quantity ? ` ×${j.quantity}` : ""}`)
                    .join(", ");
                  const adminUrl = demoTenant?.id
                    ? `${buildAdminPath("/admin/orders", demoTenant.id)}/${o.id}`
                    : `/admin/orders/${o.id}`;
                  return (
                    <tr key={o.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{o.order_number ?? o.id.slice(0, 8)}</td>
                      <td className="px-4 py-2 text-xs font-mono">
                        {o.customer_email || (o.ordered_by_profile_id?.slice(0, 8) ?? "anon") + "…"}
                      </td>
                      <td className="px-4 py-2 max-w-[320px] truncate" title={productSummary}>
                        {productSummary || "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {fmt(Number(o.total_amount), o.currency)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          to={adminUrl}
                          className="text-primary text-xs font-medium hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value ?? "—"}</div>
    </div>
  );
}
