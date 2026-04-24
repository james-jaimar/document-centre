/**
 * Document Centre — Ops & Control API client.
 *
 * Read + control surface for the platform admin Document Centre dashboards.
 * All requests are proxied through the `pdf-api` edge function which gates
 * `v1/ops/*` paths to platform_admin and forwards actor + tenant context.
 */
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ── Types (mirror server-side response shapes) ──────────────────

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
  depth: number;
  consumers: number;
  rate_per_min?: number;
  oldest_age_s?: number;
}

export interface OpsWorker {
  name: string;
  status: string;
  active: number;
  pool_size: number;
  queues: string[];
  load?: number[];
  uptime_s?: number;
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

// ── Health & system ─────────────────────────────────────────────

export const opsApi = {
  health: () => call<OpsHealth>("v1/ops/health"),
  healthFull: () => call<OpsHealthFull>("v1/ops/health/full"),
  system: () => call<OpsSystem>("v1/ops/system"),
  processes: (limit = 15) =>
    call<OpsProcess[]>("v1/ops/system/processes", "GET", undefined, { limit }),

  // Queues
  queues: () => call<OpsQueue[]>("v1/ops/queues"),
  peekQueue: (name: string, limit = 25) =>
    call<unknown[]>(`v1/ops/queues/${encodeURIComponent(name)}/peek`, "GET", undefined, { limit }),
  purgeQueue: (name: string) =>
    call<{ purged: number }>(`v1/ops/queues/${encodeURIComponent(name)}/purge`, "POST"),

  // Workers
  workers: () => call<OpsWorker[]>("v1/ops/workers"),
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

  // Jobs
  jobs: (opts: { limit?: number; status?: string; tenant_id?: string } = {}) =>
    call<OpsJob[]>("v1/ops/jobs", "GET", undefined, {
      limit: opts.limit ?? 100,
      status: opts.status,
      tenant_id: opts.tenant_id,
    }),
  job: (id: string) => call<OpsJob>(`v1/ops/jobs/${encodeURIComponent(id)}`),
  revokeTask: (taskId: string, terminate = false) =>
    call<{ ok: boolean }>(`v1/ops/tasks/${encodeURIComponent(taskId)}/revoke`, "POST", undefined, { terminate }),

  // Assets
  assetPipeline: (assetId: string) =>
    call<unknown>(`v1/ops/assets/${encodeURIComponent(assetId)}/pipeline`),

  // Metrics
  stageMetrics: (hours = 24) =>
    call<OpsStageMetric[]>("v1/ops/metrics/stages", "GET", undefined, { hours }),
  throughput: (hours = 24, bucket_minutes = 60) =>
    call<OpsThroughputBucket[]>("v1/ops/metrics/throughput", "GET", undefined, { hours, bucket_minutes }),
  tenantUsage: (hours = 24) =>
    call<OpsTenantUsage[]>("v1/ops/metrics/tenants", "GET", undefined, { hours }),

  // Storage
  storageLive: () => call<OpsStorageLive>("v1/ops/storage/live"),
  storageHistory: (hours = 168) =>
    call<OpsStorageHistoryRow[]>("v1/ops/storage/history", "GET", undefined, { hours }),

  // Audit
  audit: (opts: { limit?: number; action?: string; actor_id?: string; tenant_id?: string } = {}) =>
    call<OpsAuditEntry[]>("v1/ops/audit", "GET", undefined, {
      limit: opts.limit ?? 200,
      action: opts.action,
      actor_id: opts.actor_id,
      tenant_id: opts.tenant_id,
    }),

  // Config
  config: () => call<Record<string, unknown>>("v1/ops/config"),
};
