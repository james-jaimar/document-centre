import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { opsApi, type GcpLiveSnapshot } from "@/lib/opsApi";
import { useOpsStream } from "@/hooks/useOpsStream";
import { Activity, Cloud, Cpu, HardDrive, Layers, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const REFRESH_OPTIONS: Array<{ label: string; ms: number | false }> = [
  { label: "2s", ms: 2000 },
  { label: "5s", ms: 5000 },
  { label: "15s", ms: 15000 },
  { label: "30s", ms: 30000 },
  { label: "Paused", ms: false },
];

const STORAGE_KEY = "ops-overview-refresh-ms-gcp";

const SEVERITIES = ["DEFAULT", "INFO", "WARNING", "ERROR", "CRITICAL"];

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

function ms(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 1000) return `${v.toFixed(0)}ms`;
  return `${(v / 1000).toFixed(2)}s`;
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return iso; }
}

function Sparkline({ data, height = 28, color = "hsl(var(--primary))", max }: { data: number[]; height?: number; color?: string; max?: number }) {
  if (data.length === 0) return <div style={{ height }} />;
  const w = 200;
  const m = max ?? Math.max(1, ...data);
  const step = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - (v / m) * height).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

export default function PlatformDocumentCentreOverview() {
  const [refreshMs, setRefreshMs] = useState<number | false>(() => {
    if (typeof window === "undefined") return 5000;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "false") return false;
    const n = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(n) ? n : 5000;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, refreshMs === false ? "false" : String(refreshMs)); } catch { /* ignore */ }
  }, [refreshMs]);

  const live = useQuery({
    queryKey: ["ops", "gcp", "live"],
    queryFn: opsApi.gcpLive,
    refetchInterval: refreshMs === false ? false : refreshMs,
    refetchIntervalInBackground: false,
  });

  const { recentJobs } = useOpsStream();

  // Per-service sparkline buffers
  const cpuHistRef = useRef<Record<string, number[]>>({});
  const reqHistRef = useRef<Record<string, number[]>>({});
  const [, forceRerender] = useState(0);

  useEffect(() => {
    const snap = live.data;
    if (!snap?.cloud_run?.services) return;
    for (const s of snap.cloud_run.services) {
      cpuHistRef.current[s.service] = [...(cpuHistRef.current[s.service] ?? []), (s.cpu_utilization ?? 0) * 100].slice(-60);
      reqHistRef.current[s.service] = [...(reqHistRef.current[s.service] ?? []), s.request_count_1m ?? 0].slice(-60);
    }
    forceRerender((n) => n + 1);
  }, [live.dataUpdatedAt, live.data]);

  // ── Logs panel state ───────────────────────────────────────────
  const services = useMemo(() => live.data?.cloud_run?.services?.map((s) => s.service) ?? [], [live.data]);
  const [logService, setLogService] = useState<string>("all");
  const [logSeverity, setLogSeverity] = useState<string>("WARNING");
  const [logSearch, setLogSearch] = useState<string>("");

  const logs = useQuery({
    queryKey: ["ops", "gcp", "logs", logService, logSeverity, logSearch],
    queryFn: () => opsApi.gcpLogs({
      service: logService === "all" ? undefined : logService,
      severity: logSeverity || undefined,
      search: logSearch || undefined,
      minutes: 30,
      limit: 80,
    }),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const snap: GcpLiveSnapshot | undefined = live.data;
  const sampleAge = snap?.captured_at ? Math.max(0, Date.now() / 1000 - snap.captured_at) : null;

  const totalInstances = snap?.cloud_run?.totals?.instance_count ?? 0;
  const meanCpu = useMemo(() => {
    const vals = (snap?.cloud_run?.services ?? []).map((s) => s.cpu_utilization).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [snap]);
  const meanMem = useMemo(() => {
    const vals = (snap?.cloud_run?.services ?? []).map((s) => s.memory_utilization).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [snap]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Centre — GCP Live</h1>
          <p className="text-xs text-muted-foreground">
            {snap ? (
              <>
                Cloud Run · {snap.region ?? "?"} · Tasks · {snap.tasks_region ?? "?"} · sampled {sampleAge != null ? `${sampleAge.toFixed(1)}s ago` : "—"} · refresh {refreshMs === false ? "paused" : `${refreshMs}ms`}
                {snap.error ? <span className="text-destructive"> · {snap.error}</span> : null}
              </>
            ) : "Connecting…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => live.refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Select
            value={refreshMs === false ? "false" : String(refreshMs)}
            onValueChange={(v) => setRefreshMs(v === "false" ? false : parseInt(v, 10))}
          >
            <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REFRESH_OPTIONS.map((o) => (
                <SelectItem key={o.label} value={o.ms === false ? "false" : String(o.ms)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cloud Run instances</CardTitle><Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInstances?.toFixed(0) ?? "—"}</div>
            <p className="text-xs text-muted-foreground">{snap?.cloud_run?.services?.length ?? 0} services tracked</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Mean CPU</CardTitle><Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pct(meanCpu)}</div>
            <Progress value={(meanCpu ?? 0) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Mean memory</CardTitle><HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pct(meanMem)}</div>
            <Progress value={(meanMem ?? 0) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cloud Tasks pending</CardTitle><Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{snap?.cloud_tasks?.total_pending ?? 0}</div>
            <p className="text-xs text-muted-foreground">{snap?.cloud_tasks?.total_in_flight ?? 0} in flight · {snap?.cloud_tasks?.queues?.length ?? 0} queues</p>
          </CardContent>
        </Card>
      </div>

      {/* Cloud Run services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="h-4 w-4" />Cloud Run services
            {snap?.cloud_run?.error ? <span className="text-xs font-normal text-destructive ml-2">{snap.cloud_run.error}</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(snap?.cloud_run?.services ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No services. Set <code>OPS_CLOUD_RUN_SERVICES</code> and grant <code>roles/monitoring.viewer</code> to the Cloud Run service account.</p>
          ) : (
            <div className="space-y-4">
              {snap!.cloud_run.services.map((s) => (
                <div key={s.service} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={(s.cpu_utilization ?? 0) > 0.7 ? "default" : "secondary"} className="text-xs font-mono">{s.service}</Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        instances {s.instance_count?.toFixed(0) ?? "—"} · req/min {s.request_count_1m?.toFixed(0) ?? "—"} · p95 {ms(s.request_latency_p95_ms)} · cold {ms(s.startup_latency_ms)}
                      </span>
                    </div>
                    <div className="text-xs font-mono">
                      <span className={(s.cpu_utilization ?? 0) > 0.7 ? "text-primary font-semibold" : ""}>CPU {pct(s.cpu_utilization)}</span>
                      <span className="text-muted-foreground"> · MEM {pct(s.memory_utilization)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Sparkline data={cpuHistRef.current[s.service] ?? []} max={100} />
                    <Sparkline data={reqHistRef.current[s.service] ?? []} color="hsl(var(--destructive))" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cloud Tasks queues */}
      <Card>
        <CardHeader><CardTitle className="text-base">Cloud Tasks queues</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            {(snap?.cloud_tasks?.queues ?? []).length === 0 ? (
              <p className="text-muted-foreground">No queues visible. Confirm <code>QUEUE_BACKEND=cloud_tasks</code> and that the runtime service account has <code>roles/cloudtasks.viewer</code>.</p>
            ) : snap!.cloud_tasks.queues.map((q) => {
              const oldestAge = q.oldest_eta ? (Date.now() - new Date(q.oldest_eta).getTime()) / 1000 : null;
              return (
                <div key={q.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{q.id}</span>
                    {q.error ? <Badge variant="destructive" className="text-xs">{q.error}</Badge> : null}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span>pending <span className={(q.tasks_count ?? 0) > 0 ? "text-destructive font-semibold" : ""}>{q.tasks_count ?? 0}</span></span>
                    <span className="text-muted-foreground">in-flight {q.concurrent_dispatches ?? 0}</span>
                    <span className="text-muted-foreground">exec/min {q.executed_last_minute ?? 0}</span>
                    {oldestAge != null ? (
                      <Badge variant={oldestAge > 300 ? "destructive" : "secondary"} className="text-xs">
                        oldest {Math.round(oldestAge)}s
                      </Badge>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent jobs */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Recent jobs ({snap?.recent_jobs?.minutes ?? 5}m)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-4 text-sm mb-3">
              <span>OK <Badge variant="default" className="ml-1">{snap?.recent_jobs?.ok ?? 0}</Badge></span>
              <span>Failed <Badge variant="destructive" className="ml-1">{snap?.recent_jobs?.failed ?? 0}</Badge></span>
              <span>Running <Badge variant="secondary" className="ml-1">{snap?.recent_jobs?.running ?? 0}</Badge></span>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto text-sm">
              {recentJobs.slice(0, 30).map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                  <span className="font-mono text-xs truncate flex-1">{j.operation}</span>
                  <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"} className="text-xs">{j.status}</Badge>
                </div>
              ))}
              {recentJobs.length === 0 && <p className="text-muted-foreground">No recent jobs streaming.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Live Cloud Run logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cloud Run logs</CardTitle>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Select value={logService} onValueChange={setLogService}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All services</SelectItem>
                  {services.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={logSeverity} onValueChange={setLogSeverity}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => <SelectItem key={s} value={s}>≥ {s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Search…" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} className="h-8 text-xs w-40" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-80 overflow-y-auto text-xs font-mono">
              {logs.data?.error ? (
                <p className="text-destructive">{logs.data.error}</p>
              ) : (logs.data?.entries ?? []).length === 0 ? (
                <p className="text-muted-foreground">No matching entries in the last 30 min.</p>
              ) : logs.data!.entries.map((e, i) => {
                const text = typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload).slice(0, 240);
                return (
                  <div key={`${e.timestamp}-${i}`} className="py-1 border-b border-border/30 last:border-0">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{e.service ?? "—"} · {e.revision ?? "—"}</span>
                      <span>
                        <Badge variant={e.severity === "ERROR" || e.severity === "CRITICAL" ? "destructive" : "secondary"} className="text-[10px] mr-1">{e.severity ?? "?"}</Badge>
                        {ago(e.timestamp)}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap break-words">{text}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
