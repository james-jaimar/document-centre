import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { opsApi, type OpsLiveSnapshot } from "@/lib/opsApi";
import { useOpsStream } from "@/hooks/useOpsStream";
import { Activity, Cpu, HardDrive, Layers, Server } from "lucide-react";

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

const REFRESH_OPTIONS: Array<{ label: string; ms: number | false }> = [
  { label: "1s", ms: 1000 },
  { label: "2s", ms: 2000 },
  { label: "5s", ms: 5000 },
  { label: "15s", ms: 15000 },
  { label: "Paused", ms: false },
];

const STORAGE_KEY = "ops-overview-refresh-ms";

/** Tiny inline SVG sparkline (no chart lib). */
function Sparkline({ data, height = 32, color = "hsl(var(--primary))", max }: { data: number[]; height?: number; color?: string; max?: number }) {
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
    if (typeof window === "undefined") return 2000;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "false") return false;
    const n = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(n) ? n : 2000;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, refreshMs === false ? "false" : String(refreshMs));
    } catch { /* ignore */ }
  }, [refreshMs]);

  // ── Fast live snapshot (the new endpoint) ────────────────────
  const live = useQuery({
    queryKey: ["ops", "live"],
    queryFn: opsApi.live,
    refetchInterval: refreshMs === false ? false : refreshMs,
    refetchIntervalInBackground: false,
  });

  // ── Slower auxiliary queries ─────────────────────────────────
  const health = useQuery({ queryKey: ["ops", "health"], queryFn: opsApi.healthFull, refetchInterval: 30000, refetchIntervalInBackground: false });
  const queues = useQuery({ queryKey: ["ops", "queues"], queryFn: opsApi.queues, refetchInterval: 10000, refetchIntervalInBackground: false });
  const storage = useQuery({ queryKey: ["ops", "storage"], queryFn: opsApi.storageLive, refetchInterval: 60000, refetchIntervalInBackground: false });
  const system = useQuery({ queryKey: ["ops", "system"], queryFn: opsApi.system, refetchInterval: 30000, refetchIntervalInBackground: false });
  const { recentJobs } = useOpsStream();

  // ── In-memory ring buffers for sparklines (last 60 samples) ──
  const cpuHistRef = useRef<number[]>([]);
  const depthHistRef = useRef<number[]>([]);
  const [, forceRerender] = useState(0);

  useEffect(() => {
    if (!live.data) return;
    cpuHistRef.current = [...cpuHistRef.current, live.data.cpu?.percent ?? 0].slice(-60);
    depthHistRef.current = [...depthHistRef.current, live.data.queue_depth_total ?? 0].slice(-60);
    forceRerender((n) => n + 1);
  }, [live.dataUpdatedAt, live.data]);

  const snap: OpsLiveSnapshot | undefined = live.data;
  const sampleAge = snap?.captured_at ? Math.max(0, Date.now() / 1000 - snap.captured_at) : null;

  const cores = snap?.cpu?.core_count ?? system.data?.cpu?.cores;

  return (
    <div className="space-y-6 p-6">
      {/* ── Header with refresh control ─────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Centre Ops</h1>
          <p className="text-xs text-muted-foreground">
            {snap ? (
              <>Host CPU sampled {sampleAge != null ? `${sampleAge.toFixed(1)}s ago` : "—"} · {cores ?? "—"} cores · refresh every {refreshMs === false ? "paused" : `${refreshMs}ms`}</>
            ) : "Connecting…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Refresh</span>
          <Select
            value={refreshMs === false ? "false" : String(refreshMs)}
            onValueChange={(v) => setRefreshMs(v === "false" ? false : parseInt(v, 10))}
          >
            <SelectTrigger className="w-[110px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_OPTIONS.map((o) => (
                <SelectItem key={o.label} value={o.ms === false ? "false" : String(o.ms)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── KPI tiles ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">CPU</CardTitle><Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{snap?.cpu?.percent != null ? `${snap.cpu.percent.toFixed(0)}%` : "—"}</div>
            <p className="text-xs text-muted-foreground">{cores ?? "—"} cores · load {system.data?.cpu?.load?.[0]?.toFixed(2) ?? "—"}</p>
            <div className="mt-2"><Sparkline data={cpuHistRef.current} max={100} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Memory</CardTitle><Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{snap?.memory?.percent != null ? `${snap.memory.percent.toFixed(0)}%` : "—"}</div>
            <p className="text-xs text-muted-foreground">{fmtBytes(snap?.memory?.used)} / {fmtBytes(snap?.memory?.total)}</p>
            <Progress value={snap?.memory?.percent ?? 0} className="mt-2 h-1.5" />
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
            <div className="text-2xl font-bold">{snap?.queue_depth_total ?? 0}</div>
            <p className="text-xs text-muted-foreground">{queues.data?.length ?? 0} queues · waiting in broker</p>
            <div className="mt-2"><Sparkline data={depthHistRef.current} color="hsl(var(--destructive))" /></div>
          </CardContent>
        </Card>
      </div>

      {/* ── Live workers (Task-Manager view) ────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />Live workers
            <span className="text-xs font-normal text-muted-foreground ml-2">
              psutil per-process CPU & RSS · {snap?.workers?.length ?? 0} workers · {snap?.workers?.reduce((a, w) => a + w.child_count, 0) ?? 0} children
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(!snap?.workers || snap.workers.length === 0) ? (
            <p className="text-sm text-muted-foreground">No Celery workers visible on this host. Check that the worker systemd units are running.</p>
          ) : (
            <div className="space-y-3">
              {snap.workers.map((w) => {
                const cpuMax = (cores ?? 1) * 100;
                const cpuPct = Math.min(100, ((w.cpu_percent ?? 0) / cpuMax) * 100);
                return (
                  <div key={w.pid} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant={w.active_tasks > 0 ? "default" : "secondary"} className="text-xs">{w.name}</Badge>
                        <span className="text-xs text-muted-foreground font-mono">pid {w.pid} · {w.child_count} children · {w.active_tasks} active</span>
                      </div>
                      <div className="text-xs font-mono">
                        <span className={w.cpu_percent > cpuMax * 0.5 ? "text-primary font-semibold" : ""}>{w.cpu_percent.toFixed(0)}% CPU</span>
                        <span className="text-muted-foreground"> · {fmtBytes(w.rss_bytes)}</span>
                      </div>
                    </div>
                    <Progress value={cpuPct} className="h-1.5" />
                    {w.children.length > 0 && (
                      <div className="pl-4 mt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0.5 text-xs font-mono text-muted-foreground">
                        {w.children.map((c) => (
                          <div key={c.pid} className="flex justify-between">
                            <span>pid {c.pid} <span className="opacity-60">[{c.status}]</span></span>
                            <span>{c.cpu_percent.toFixed(0)}% · {fmtBytes(c.rss_bytes)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Queues table ───────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Queues (live broker depth)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            {snap && Object.keys(snap.queue_depths ?? {}).length > 0 ? (
              Object.entries(snap.queue_depths).map(([name, depth]) => {
                const q = queues.data?.find((x) => x.name === name);
                return (
                  <div key={name} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                    <span className="font-mono text-xs">{name}</span>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span>depth <span className={depth > 0 ? "text-destructive font-semibold" : ""}>{depth}</span></span>
                      <span className="text-muted-foreground">consumers {q?.consumers ?? 0}</span>
                    </div>
                  </div>
                );
              })
            ) : <p className="text-muted-foreground">No queues.</p>}
          </div>
        </CardContent>
      </Card>

      {/* ── Health + recent jobs ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Health probes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {health.data?.probes
              ? Object.entries(health.data.probes).flatMap(([name, p]: [string, any]) => {
                  if (p && typeof p === "object" && "ok" in p) {
                    return [(
                      <div key={name} className="flex items-center justify-between text-sm">
                        <span className="font-mono">{name}</span>
                        <Badge variant={p.ok ? "default" : "destructive"}>{p.ok ? "OK" : "FAIL"}{p.latency_ms != null ? ` · ${p.latency_ms}ms` : ""}</Badge>
                      </div>
                    )];
                  }
                  if (p && typeof p === "object") {
                    return Object.entries(p).map(([child, cp]: [string, any]) => (
                      <div key={`${name}.${child}`} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-muted-foreground">{name}.<span className="text-foreground">{child}</span></span>
                        <Badge variant={cp?.ok ? "default" : "destructive"}>{cp?.ok ? "OK" : "FAIL"}{cp?.latency_ms != null ? ` · ${cp.latency_ms}ms` : ""}</Badge>
                      </div>
                    ));
                  }
                  return [];
                })
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

