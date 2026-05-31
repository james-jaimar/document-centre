import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Inbox,
  Clock,
  CheckCircle2,
  PackageCheck,
  TrendingUp,
  Wallet,
  ArrowUpRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { formatPrice } from "@/lib/formatCurrency";
import { formatDistanceToNow } from "date-fns";
import { ADMIN_STATUS_CONFIG } from "@/lib/orders/status-maps";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type DashRow = {
  id: string;
  order_number: string | null;
  admin_status: string;
  total_amount: number | null;
  currency: string | null;
  created_at: string;
  ordered_by_profile_id: string | null;
};

const DONUT_COLORS = [
  "hsl(217 91% 60%)",
  "hsl(262 83% 58%)",
  "hsl(38 92% 50%)",
  "hsl(173 80% 40%)",
  "hsl(340 82% 52%)",
  "hsl(142 71% 45%)",
];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

const KPI = ({
  label,
  value,
  icon: Icon,
  hint,
  to,
}: {
  label: string;
  value: React.ReactNode;
  icon: any;
  hint?: string;
  to?: string;
}) => {
  const body = (
    <Card className="hover:shadow-md transition-shadow h-full">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold leading-none">{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="rounded-md bg-muted p-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

const BranchDashboard = () => {
  const { tenantId, branchId, tenantName } = useTenantContext();

  const { data, isLoading } = useQuery({
    queryKey: ["branch-dashboard", tenantId, branchId],
    enabled: !!tenantId && !!branchId,
    queryFn: async () => {
      // Pull last 30 days of non-cart orders for this branch — enough for all charts.
      const since = daysAgo(29).toISOString();
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, order_number, admin_status, total_amount, currency, created_at, ordered_by_profile_id")
        .eq("tenant_id", tenantId!)
        .eq("branch_id", branchId!)
        .neq("order_status", "cart")
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Also pull live counts independent of the 30d window for KPI cards.
      const baseCount = () =>
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId!)
          .eq("branch_id", branchId!)
          .neq("order_status", "cart");

      const [{ count: pending }, { count: inProduction }, { count: ready }] = await Promise.all([
        baseCount().in("admin_status", ["new_order", "under_review", "approved"]),
        baseCount().eq("admin_status", "in_production"),
        baseCount().eq("admin_status", "ready_for_dispatch"),
      ]);

      return {
        recent: (orders ?? []) as DashRow[],
        counts: { pending: pending ?? 0, inProduction: inProduction ?? 0, ready: ready ?? 0 },
      };
    },
  });

  if (!branchId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Branch Queue</h1>
        <p className="text-muted-foreground">No branch is assigned to your account.</p>
      </div>
    );
  }

  const recent = data?.recent ?? [];
  const counts = data?.counts ?? { pending: 0, inProduction: 0, ready: 0 };
  const today = startOfToday().getTime();
  const month = startOfMonth().getTime();
  const currency = recent.find((r) => r.currency)?.currency ?? "ZAR";

  const completedToday = recent.filter(
    (r) => r.admin_status === "completed" && new Date(r.created_at).getTime() >= today,
  ).length;

  const revenueToday = recent
    .filter((r) => new Date(r.created_at).getTime() >= today)
    .reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0);

  const revenueMonth = recent
    .filter((r) => new Date(r.created_at).getTime() >= month)
    .reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0);

  // 14-day series
  const series: { day: string; orders: number; revenue: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = daysAgo(i);
    const end = daysAgo(i - 1);
    const dayRows = recent.filter((r) => {
      const t = new Date(r.created_at).getTime();
      return t >= start.getTime() && t < end.getTime();
    });
    series.push({
      day: start.toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
      orders: dayRows.length,
      revenue: dayRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0),
    });
  }

  // Status mix from open orders in the 30d window (exclude completed/cancelled)
  const mixSrc = recent.filter(
    (r) => !["completed", "cancelled", "dispatched"].includes(r.admin_status),
  );
  const mixCounts = new Map<string, number>();
  for (const r of mixSrc) mixCounts.set(r.admin_status, (mixCounts.get(r.admin_status) ?? 0) + 1);
  const mix = Array.from(mixCounts.entries()).map(([k, v]) => ({
    name: ADMIN_STATUS_CONFIG[k as keyof typeof ADMIN_STATUS_CONFIG]?.label ?? k,
    value: v,
    key: k,
  }));

  const topQueue = [...recent]
    .filter((r) => !["completed", "cancelled"].includes(r.admin_status))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Branch Queue</h1>
          <p className="text-muted-foreground text-sm">
            {tenantName ? `${tenantName} — ` : ""}live snapshot of incoming work and production status
          </p>
        </div>
        <Link
          to="/branch/orders"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open orders <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KPI label="Pending" value={isLoading ? <Skeleton className="h-7 w-10" /> : counts.pending} icon={Inbox} to="/branch/orders?status=new_order" />
        <KPI label="In Production" value={isLoading ? <Skeleton className="h-7 w-10" /> : counts.inProduction} icon={Clock} to="/branch/orders?status=in_production" />
        <KPI label="Ready" value={isLoading ? <Skeleton className="h-7 w-10" /> : counts.ready} icon={PackageCheck} to="/branch/orders?status=ready_for_dispatch" />
        <KPI label="Completed today" value={isLoading ? <Skeleton className="h-7 w-10" /> : completedToday} icon={CheckCircle2} />
        <KPI
          label="Revenue today"
          value={isLoading ? <Skeleton className="h-7 w-20" /> : formatPrice(revenueToday, currency)}
          icon={Wallet}
        />
        <KPI
          label="Revenue this month"
          value={isLoading ? <Skeleton className="h-7 w-24" /> : formatPrice(revenueMonth, currency)}
          icon={TrendingUp}
        />
      </div>

      {/* Chart + Today's queue */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Orders · last 14 days</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px]">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="orders"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#gOrders)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Active queue</CardTitle>
            <Link to="/branch/orders" className="text-xs text-muted-foreground hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : topQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No active orders.</p>
            ) : (
              topQueue.map((o) => {
                const cfg = ADMIN_STATUS_CONFIG[o.admin_status as keyof typeof ADMIN_STATUS_CONFIG];
                return (
                  <Link
                    key={o.id}
                    to={`/branch/orders/${o.id}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-medium truncate">
                        #{o.order_number ?? o.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className={cfg?.color}>
                        {cfg?.label ?? o.admin_status}
                      </Badge>
                      <span className="text-sm font-medium tabular-nums">
                        {formatPrice(Number(o.total_amount ?? 0), o.currency ?? currency)}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status mix */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open status mix</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px]">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : mix.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Nothing open right now.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {mix.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No orders in the last 30 days.</p>
            ) : (
              recent.slice(0, 6).map((o) => {
                const cfg = ADMIN_STATUS_CONFIG[o.admin_status as keyof typeof ADMIN_STATUS_CONFIG];
                return (
                  <Link
                    key={o.id}
                    to={`/branch/orders/${o.id}`}
                    className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-sm font-medium">
                        #{o.order_number ?? o.id.slice(0, 8)}
                      </span>
                      <Badge variant="secondary" className={cfg?.color}>
                        {cfg?.label ?? o.admin_status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm shrink-0">
                      <span className="text-muted-foreground hidden sm:inline">
                        {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatPrice(Number(o.total_amount ?? 0), o.currency ?? currency)}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BranchDashboard;
