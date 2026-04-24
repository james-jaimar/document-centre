import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { opsApi } from "@/lib/opsApi";
import { useOpsStream } from "@/hooks/useOpsStream";
import { Activity, Cpu, HardDrive, Layers, Server } from "lucide-react";

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

export default function PlatformDocumentCentreOverview() {
  const health = useQuery({ queryKey: ["ops", "health"], queryFn: opsApi.healthFull, refetchInterval: 10000 });
  const system = useQuery({ queryKey: ["ops", "system"], queryFn: opsApi.system, refetchInterval: 5000 });
  const queues = useQuery({ queryKey: ["ops", "queues"], queryFn: opsApi.queues, refetchInterval: 5000 });
  const storage = useQuery({ queryKey: ["ops", "storage"], queryFn: opsApi.storageLive, refetchInterval: 30000 });
  const { recentJobs, connected } = useOpsStream();

  void health; void connected;

  return (
    <div className="space-y-6 p-6">

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">CPU</CardTitle><Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{system.data?.cpu?.percent?.toFixed(0) ?? "—"}%</div>
            <p className="text-xs text-muted-foreground">{system.data?.cpu?.cores ?? "—"} cores · load {system.data?.cpu?.load?.[0]?.toFixed(2) ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Memory</CardTitle><Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{system.data?.memory?.percent?.toFixed(0) ?? "—"}%</div>
            <p className="text-xs text-muted-foreground">{fmtBytes(system.data?.memory?.used)} / {fmtBytes(system.data?.memory?.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Disk</CardTitle><HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{system.data?.disk?.percent?.toFixed(0) ?? "—"}%</div>
            <p className="text-xs text-muted-foreground">{fmtBytes(system.data?.disk?.used)} used · {fmtBytes(storage.data?.s3?.bytes)} on S3</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Queue depth</CardTitle><Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{queues.data?.reduce((a, q) => a + (q.depth ?? 0), 0) ?? "—"}</div>
            <p className="text-xs text-muted-foreground">{queues.data?.length ?? 0} active queues</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Health probes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {health.data?.probes
              ? Object.entries(health.data.probes).map(([name, p]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="font-mono">{name}</span>
                    <Badge variant={p.ok ? "default" : "destructive"}>{p.ok ? "OK" : "FAIL"}{p.latency_ms != null ? ` · ${p.latency_ms}ms` : ""}</Badge>
                  </div>
                ))
              : <p className="text-sm text-muted-foreground">{health.isLoading ? "Loading…" : "No probe data"}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Recent jobs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-80 overflow-y-auto text-sm">
              {recentJobs.slice(0, 30).map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                  <span className="font-mono text-xs truncate flex-1">{j.operation}</span>
                  <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"} className="text-xs">{j.status}</Badge>
                </div>
              ))}
              {recentJobs.length === 0 && <p className="text-muted-foreground">No recent jobs.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
