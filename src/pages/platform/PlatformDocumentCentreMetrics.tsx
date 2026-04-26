import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { opsApi } from "@/lib/opsApi";

export default function PlatformDocumentCentreMetrics() {
  const stages = useQuery({ queryKey: ["ops", "stages", 24], queryFn: () => opsApi.stageMetrics(24), refetchInterval: 60000, refetchIntervalInBackground: false });
  const throughput = useQuery({ queryKey: ["ops", "throughput", 24], queryFn: () => opsApi.throughput(24, 60), refetchInterval: 60000, refetchIntervalInBackground: false });
  const tenants = useQuery({ queryKey: ["ops", "tenants", 24], queryFn: () => opsApi.tenantUsage(24), refetchInterval: 120000, refetchIntervalInBackground: false });

  const chartData = throughput.data?.map((b) => ({
    bucket: new Date(b.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    total: b.total, ok: b.ok, failed: b.failed,
  })) ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Metrics</h2>
        <p className="text-sm text-muted-foreground">Stage performance, throughput and tenant usage — last 24 hours.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Throughput (jobs / hour)</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="bucket" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
              <Legend />
              <Line type="monotone" dataKey="ok" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="total" stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Stage performance</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">p50</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stages.data?.map((s) => (
                  <TableRow key={s.stage}>
                    <TableCell className="font-mono text-xs">{s.stage}</TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                    <TableCell className="text-right text-destructive">{s.failed}</TableCell>
                    <TableCell className="text-right">{s.p50_ms != null ? `${s.p50_ms}ms` : "—"}</TableCell>
                    <TableCell className="text-right">{s.p95_ms != null ? `${s.p95_ms}ms` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top tenants by job volume</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead className="text-right">Jobs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.data?.slice(0, 20).map((t) => (
                  <TableRow key={`${t.tenant_id}-${t.app_id}`}>
                    <TableCell className="font-mono text-xs">{t.tenant_id?.slice(0, 8) ?? "—"}…</TableCell>
                    <TableCell className="font-mono text-xs">{t.app_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.count}</TableCell>
                  </TableRow>
                ))}
                {tenants.data?.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No usage data</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
