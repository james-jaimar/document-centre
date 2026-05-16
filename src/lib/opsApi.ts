/**
 * Document Centre — Ops & Control API client.
 *
 * Read + control surface for the platform admin Document Centre dashboards.
 * All requests are proxied through the `pdf-api` edge function which gates
 * `v1/ops/*` paths to platform_admin and forwards actor + tenant context.
 *
 * The Python service returns wrapped envelopes (e.g. `{queues: [...]}`) and
 * uses field names that don't always match the UI's needs. This module
 * unwraps + remaps so the React pages get clean, predictable shapes.
 */
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ── Public types (UI-facing shapes) ─────────────────────────────

export interface OpsHealth {
  status: "ok" | "degraded" | "down" | string;
  service?: string;
  env?: string;
  version?: string;
  uptime_s?: number;
  [k: string]: unknown;
}

export interface OpsHealthFull extends OpsHealth {
  probes: Record<string, { ok: boolean; detail?: string; latency_ms?: number }>;
}

export interface OpsSystem {
  cpu: { percent: number; cores: number; load: number[] };
  memory: { total: number; used: number; available: number; percent: number };
  disk: { total: number; used: number; free: number; percent: number };
  net?: { bytes_sent: number; bytes_recv: number };
  process_count?: number;
  boot_time?: string;
}

export interface OpsProcess {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_percent: number;
  rss_bytes: number;
  cmdline?: string;
}

export interface OpsQueue {
  name: string;
  /** Pending messages waiting to be picked up (mapped from server `reserved`). */
  depth: number;
  /** Number of workers actively processing this queue (mapped from server `active`). */
  consumers: number;
  rate_per_min?: number;
  oldest_age_s?: number;
}

export interface OpsWorker {
  name: string;
  short_name?: string;
  status: string;
  /** Active task count (mapped from server `active_tasks`). */
  active: number;
  /** Pool processes (mapped from server `pool.processes`). */
  pool_size: number;
  queues: string[];
  load?: number[];
  uptime_s?: number;
  /** Live (host-process) total CPU% across master + children. */
  live_cpu_percent?: number | null;
  /** Live (host-process) total RSS bytes across master + children. */
  live_rss_bytes?: number | null;
  /** Per-child process stats from psutil. */
  live_children?: Array<{ pid: number; cpu_percent: number; rss_bytes: number; status: string }>;
}

/** Compact poll-friendly snapshot from /v1/ops/live. */
export interface OpsLiveSnapshot {
  captured_at?: number;
  cpu: { percent: number; per_core?: number[]; core_count?: number };
  memory: { total: number; used: number; available: number; percent: number };
  queue_depth_total: number;
  queue_depths: Record<string, number>;
  workers: Array<{
    name: string;
    pid: number;
    cpu_percent: number;
    rss_bytes: number;
    child_count: number;
    active_tasks: number;
    children: Array<{ pid: number; cpu_percent: number; rss_bytes: number; status: string }>;
  }>;
}

export interface OpsJob {
  id: string;
  asset_id: string | null;
  operation: string;
  queue: string;
  status: string;
  tenant_id?: string | null;
  app_id?: string | null;
  retries: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms?: number | null;
}

export interface OpsStageMetric {
  stage: string;
  count: number;
  success: number;
  failed: number;
  p50_ms: number | null;
  p95_ms: number | null;
}

export interface OpsThroughputBucket {
  bucket: string;
  total: number;
  ok: number;
  failed: number;
}

export interface OpsTenantUsage {
  tenant_id: string;
  app_id: string | null;
  count: number;
  bytes_in?: number;
  bytes_out?: number;
}

export interface OpsStorageLive {
  s3?: { object_count?: number; bytes?: number; bucket?: string };
  disk?: { total: number; used: number; free: number };
}

export interface OpsStorageHistoryRow {
  captured_at: string;
  s3_object_count: number | null;
  s3_bytes: number | null;
  disk_used_bytes: number | null;
  disk_free_bytes: number | null;
}

export interface OpsAuditEntry {
  id: string;
  created_at: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  tenant_id: string | null;
  app_id: string | null;
  target: string | null;
  detail: Record<string, unknown> | null;
}

// ── Internal HTTP helper ────────────────────────────────────────

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error("Not authenticated");
  return t;
}

async function call<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const token = await getAuthToken();

  let fullPath = path;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) fullPath += `?${qs}`;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/pdf-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ path: fullPath, method, ...(body ?? {}) }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ops API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Helpers ──────────────────────────────────────────────────────

type Dict = Record<string, unknown>;

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// ── API surface (envelopes unwrapped, fields remapped for UI) ───

export const opsApi = {
  health: () => call<OpsHealth>("v1/ops/health"),
  healthFull: () => call<OpsHealthFull>("v1/ops/health/full"),
  system: () => call<OpsSystem>("v1/ops/system"),

  processes: async (limit = 15): Promise<OpsProcess[]> => {
    const res = await call<Dict>("v1/ops/system/processes", "GET", undefined, { limit });
    return asArray<OpsProcess>(res.processes);
  },

  // Queues — server returns { queues: [{name, active, reserved, scheduled}] }
  queues: async (): Promise<OpsQueue[]> => {
    const res = await call<Dict>("v1/ops/queues");
    return asArray<Dict>(res.queues).map((q) => ({
      name: String(q.name ?? ""),
      depth: Number(q.reserved ?? 0) + Number(q.scheduled ?? 0),
      consumers: Number(q.active ?? 0),
      rate_per_min: undefined,
      oldest_age_s: undefined,
    }));
  },
  peekQueue: async (name: string, limit = 25): Promise<unknown[]> => {
    const res = await call<Dict>(`v1/ops/queues/${encodeURIComponent(name)}/peek`, "GET", undefined, { limit });
    return asArray<unknown>(res.messages ?? res.items ?? res);
  },
  purgeQueue: (name: string) =>
    call<{ purged: number }>(`v1/ops/queues/${encodeURIComponent(name)}/purge`, "POST"),

  // Workers — server returns { workers: [{name, active_tasks, pool:{processes}, ...}] }
  workers: async (): Promise<OpsWorker[]> => {
    const res = await call<Dict>("v1/ops/workers");
    return asArray<Dict>(res.workers).map((w) => {
      const pool = (w.pool ?? {}) as Dict;
      const procs = pool.processes;
      const poolSize = Array.isArray(procs)
        ? procs.length
        : Number(pool.max_concurrency ?? 0);
      return {
        name: String(w.name ?? ""),
        status: String(w.status ?? "online"),
        active: Number(w.active_tasks ?? 0),
        pool_size: poolSize,
        queues: Array.isArray(w.queues) ? (w.queues as string[]) : [],
      };
    });
  },
  pingWorkers: () => call<Record<string, unknown>>("v1/ops/workers/ping", "POST"),
  shutdownWorker: (name: string) =>
    call<{ ok: boolean }>(`v1/ops/workers/${encodeURIComponent(name)}/shutdown`, "POST"),
  poolGrow: (name: string, n = 1) =>
    call<{ ok: boolean }>(`v1/ops/workers/${encodeURIComponent(name)}/pool/grow`, "POST", undefined, { n }),
  poolShrink: (name: string, n = 1) =>
    call<{ ok: boolean }>(`v1/ops/workers/${encodeURIComponent(name)}/pool/shrink`, "POST", undefined, { n }),
  cancelConsumer: (name: string, queue: string) =>
    call<{ ok: boolean }>(`v1/ops/workers/${encodeURIComponent(name)}/consumers/cancel`, "POST", undefined, { queue }),
  addConsumer: (name: string, queue: string) =>
    call<{ ok: boolean }>(`v1/ops/workers/${encodeURIComponent(name)}/consumers/add`, "POST", undefined, { queue }),

  // Jobs — server returns { jobs: [JobEvent] } where each event has
  // { id, job_id, task_name, queue_name, stage, status, started_at, finished_at, duration_ms, ... }
  jobs: async (opts: { limit?: number; status?: string; tenant_id?: string } = {}): Promise<OpsJob[]> => {
    const res = await call<Dict>("v1/ops/jobs", "GET", undefined, {
      limit: opts.limit ?? 100,
      status: opts.status,
      tenant_id: opts.tenant_id,
    });
    return asArray<Dict>(res.jobs).map((e) => ({
      id: String(e.id ?? e.job_id ?? ""),
      asset_id: (e.asset_id as string | null) ?? null,
      operation: String(e.task_name ?? e.stage ?? "—"),
      queue: String(e.queue_name ?? "—"),
      status: String(e.status ?? "unknown"),
      tenant_id: (e.tenant_id as string | null) ?? null,
      app_id: (e.app_id as string | null) ?? null,
      retries: Number(e.retries ?? 0),
      error: (e.message as string | null) ?? null,
      created_at: String(e.started_at ?? new Date().toISOString()),
      started_at: (e.started_at as string | null) ?? null,
      finished_at: (e.finished_at as string | null) ?? null,
      duration_ms: (e.duration_ms as number | null) ?? null,
    }));
  },
  job: (id: string) => call<unknown>(`v1/ops/jobs/${encodeURIComponent(id)}`),
  revokeTask: (taskId: string, terminate = false) =>
    call<{ ok: boolean }>(`v1/ops/tasks/${encodeURIComponent(taskId)}/revoke`, "POST", undefined, { terminate: terminate ? "true" : "false" }),

  // Assets
  assetPipeline: (assetId: string) =>
    call<unknown>(`v1/ops/assets/${encodeURIComponent(assetId)}/pipeline`),

  // Metrics — server returns { stages: [...] } / { series: [{timestamp, stages:{...}}] }
  stageMetrics: async (hours = 24): Promise<OpsStageMetric[]> => {
    const res = await call<Dict>("v1/ops/metrics/stages", "GET", undefined, { hours });
    return asArray<OpsStageMetric>(res.stages);
  },
  throughput: async (hours = 24, bucket_minutes = 60): Promise<OpsThroughputBucket[]> => {
    const res = await call<Dict>("v1/ops/metrics/throughput", "GET", undefined, { hours, bucket_minutes });
    return asArray<Dict>(res.series).map((b) => {
      const stages = (b.stages ?? {}) as Record<string, { ok?: number; failed?: number }>;
      let ok = 0, failed = 0;
      for (const v of Object.values(stages)) {
        ok += Number(v?.ok ?? 0);
        failed += Number(v?.failed ?? 0);
      }
      return {
        bucket: String(b.timestamp ?? ""),
        ok,
        failed,
        total: ok + failed,
      };
    });
  },
  tenantUsage: async (hours = 24): Promise<OpsTenantUsage[]> => {
    const res = await call<Dict>("v1/ops/metrics/tenants", "GET", undefined, { hours });
    return asArray<Dict>(res.tenants).map((t) => ({
      tenant_id: String(t.tenant_id ?? ""),
      app_id: (t.app_id as string | null) ?? null,
      count: Number(t.events ?? 0),
    }));
  },

  // Storage — `storage_live` returns { storage: {...} } envelope from snapshot
  storageLive: async (): Promise<OpsStorageLive> => {
    const res = await call<Dict>("v1/ops/storage/live");
    // Server snapshot can be either { s3, disk } directly or wrapped; handle both.
    const inner = (res.storage ?? res) as Dict;
    return {
      s3: inner.s3 as OpsStorageLive["s3"],
      disk: inner.disk as OpsStorageLive["disk"],
    };
  },
  storageHistory: async (hours = 168): Promise<OpsStorageHistoryRow[]> => {
    const res = await call<Dict>("v1/ops/storage/history", "GET", undefined, { hours });
    return asArray<Dict>(res.snapshots).map((r) => {
      const breakdown = (r.breakdown ?? {}) as Dict;
      const isS3 = String(r.backend ?? "") === "s3";
      return {
        captured_at: String(r.captured_at ?? ""),
        s3_object_count: isS3 ? Number(r.object_count ?? 0) : null,
        s3_bytes: isS3 ? Number(r.total_bytes ?? 0) : null,
        disk_used_bytes: !isS3 ? Number(r.total_bytes ?? 0) : Number(breakdown.disk_used ?? 0) || null,
        disk_free_bytes: Number(breakdown.disk_free ?? 0) || null,
      };
    });
  },

  // Audit — server returns { entries: [...] } with target_type/target_id/request_payload
  audit: async (opts: { limit?: number; action?: string; actor_id?: string; tenant_id?: string } = {}): Promise<OpsAuditEntry[]> => {
    const res = await call<Dict>("v1/ops/audit", "GET", undefined, {
      limit: opts.limit ?? 200,
      action: opts.action,
      actor_id: opts.actor_id,
      tenant_id: opts.tenant_id,
    });
    return asArray<Dict>(res.entries).map((r) => {
      const targetType = r.target_type as string | null;
      const targetId = r.target_id as string | null;
      const target = targetId
        ? targetType ? `${targetType}:${targetId}` : targetId
        : null;
      const detail = (r.request_payload ?? r.response_payload ?? null) as Record<string, unknown> | null;
      return {
        id: String(r.id ?? ""),
        created_at: String(r.created_at ?? ""),
        action: String(r.action ?? ""),
        actor_id: (r.actor_id as string | null) ?? null,
        actor_email: (r.actor_email as string | null) ?? null,
        actor_role: (r.actor_role as string | null) ?? null,
        tenant_id: (r.tenant_id as string | null) ?? null,
        app_id: (r.app_id as string | null) ?? null,
        target,
        detail,
      };
    });
  },

  // Config
  config: () => call<Record<string, unknown>>("v1/ops/config"),
};
