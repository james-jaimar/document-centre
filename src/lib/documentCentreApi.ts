import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ── Types ────────────────────────────────────────────────────────

export interface CreateAssetPayload {
  original_filename: string;
  media_type: string;
  source_storage_path: string;
  metadata?: Record<string, unknown>;
  auto_queue?: boolean;
}

export interface CreateAssetResponse {
  asset_id: string;
  job_ids: string[];
}

export interface Asset {
  id: string;
  original_filename: string;
  media_type: string;
  source_storage_path: string;
  normalized_storage_path: string | null;
  preview_storage_path: string | null;
  thumbnail_storage_path: string | null;
  status: string;
  page_count: number | null;
  width_pt: number | null;
  height_pt: number | null;
  boxes: Record<string, number[]> | null;
  metadata: Record<string, unknown>;
  source_url: string | null;
  normalized_url: string | null;
  preview_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DerivedFile {
  id: string;
  asset_id: string;
  job_id: string;
  kind: string;
  storage_path: string;
  media_type: string;
  page: number | null;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown>;
  url: string | null;
}

export interface Job {
  id: string;
  asset_id: string;
  operation: string;
  queue: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

// ── Tenant context (forwarded to JobEvent attribution) ─────────

let _tenantId: string | null = null;
let _appId: string | null = null;

/**
 * Set the active tenant/app context. The values are forwarded as
 * `tenant_id` / `app_id` in the request body — the pdf-api edge function
 * relays them as `X-Ops-Tenant-Id` / `X-Ops-App-Id` headers, and the VPS
 * stamps them on every JobEvent for per-tenant metrics.
 */
export function setDocumentCentreContext(opts: {
  tenantId: string | null;
  appId: string | null;
}): void {
  _tenantId = opts.tenantId;
  _appId = opts.appId;
}

// ── Helpers ──────────────────────────────────────────────────────

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

/**
 * Some failures from the Supabase Edge Runtime layer are transient and worth
 * retrying — most commonly:
 *   • HTTP 502 / 503 / 504 / 429 from the platform (worker recycling, cold-start
 *     backpressure, brief upstream blips)
 *   • Response bodies tagged with `SUPABASE_EDGE_RUNTIME_ERROR`
 *   • Browser fetch-level network failures (TypeError) before the request
 *     reached the function at all
 *
 * Real application errors (4xx other than 429, document-processing failures,
 * auth/forbidden, validation) are NOT retried — they surface immediately.
 */
function isTransientStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function bodyLooksTransient(text: string | null | undefined): boolean {
  if (!text) return false;
  // Supabase platform error envelope
  if (text.includes("SUPABASE_EDGE_RUNTIME_ERROR")) return true;
  if (text.includes("Service is temporarily unavailable")) return true;
  if (text.includes("WORKER_LIMIT")) return true;
  return false;
}

interface RequestOptions {
  /** Max retry attempts on top of the initial call. Defaults to 4. */
  maxRetries?: number;
}

const DEFAULT_MAX_RETRIES = 4;

/** Exponential backoff with jitter: ~750ms, 1.5s, 3s, 6s, capped at 8s. */
function backoffDelay(attempt: number): number {
  const base = Math.min(750 * 2 ** attempt, 8000);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * All requests go through the pdf-api edge function which proxies
 * to the Document Centre API, avoiding CORS issues.
 *
 * Transient platform failures (Supabase edge runtime 503s, network blips)
 * are retried with exponential backoff so a single edge-worker recycle
 * during an upload doesn't abort the whole pipeline.
 */
async function request<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
  options: RequestOptions = {}
): Promise<T> {
  const token = await getAuthToken();
  const edgeFnUrl = `${SUPABASE_URL}/functions/v1/pdf-api`;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  console.log(`[doc-centre] ${method} ${path}`);

  const requestBody = JSON.stringify({
    path,
    method,
    ...(_tenantId ? { tenant_id: _tenantId } : {}),
    ...(_appId ? { app_id: _appId } : {}),
    ...(body ?? {}),
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(edgeFnUrl, {
        method: "POST", // Edge function always receives POST
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: requestBody,
      });
    } catch (networkErr: any) {
      // Browser-level fetch failure (DNS, connection reset, mid-flight
      // worker termination). Always treat as transient.
      lastError = new Error(
        `Network error calling pdf-api: ${networkErr?.message ?? networkErr}`
      );
      if (attempt < maxRetries) {
        const delay = backoffDelay(attempt);
        console.warn(
          `[doc-centre] network error for ${method} ${path}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await sleep(delay);
        continue;
      }
      throw lastError;
    }

    if (res.ok) {
      return res.json();
    }

    // Non-OK response. Read body once so we can both classify and surface it.
    const text = await res.text().catch(() => "");
    const transient = isTransientStatus(res.status) || bodyLooksTransient(text);

    if (transient && attempt < maxRetries) {
      const delay = backoffDelay(attempt);
      console.warn(
        `[doc-centre] transient ${res.status} for ${method} ${path}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
      );
      await sleep(delay);
      lastError = new Error(`Document Centre API error ${res.status}: ${text}`);
      continue;
    }

    // Non-transient OR we're out of retries — surface the real error.
    throw new Error(`Document Centre API error ${res.status}: ${text}`);
  }

  // Loop fell through (shouldn't happen, but be defensive).
  throw lastError ?? new Error(`Document Centre API call failed: ${method} ${path}`);
}

// ── Asset endpoints ──────────────────────────────────────────────

export async function createAsset(
  payload: CreateAssetPayload
): Promise<CreateAssetResponse> {
  return request<CreateAssetResponse>("v1/assets", "POST", payload as unknown as Record<string, unknown>);
}

export async function getAsset(assetId: string): Promise<Asset> {
  return request<Asset>(`v1/assets/${assetId}`, "GET");
}

export async function getDerivedFiles(
  assetId: string
): Promise<DerivedFile[]> {
  return request<DerivedFile[]>(`v1/assets/${assetId}/derived-files`, "GET");
}

export async function inspectAsset(
  assetId: string
): Promise<{ job_id: string }> {
  return request<{ job_id: string }>(`v1/assets/${assetId}/inspect`, "POST");
}

// ── Job endpoints ────────────────────────────────────────────────

export async function getJob(jobId: string): Promise<Job> {
  return request<Job>(`v1/jobs/${jobId}`, "GET");
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

/**
 * Poll a job until it reaches a terminal state.
 *
 * Uses an adaptive backoff: starts at 300ms (catches sub-second jobs almost
 * immediately) and ramps up to a 2500ms ceiling. The `intervalMs` parameter
 * is kept for backwards compatibility but is now interpreted as the *ceiling*,
 * not a flat interval.
 *
 * Tolerates transient `getJob` failures: if a single status check fails after
 * its own retry budget, we log a warning and try again on the next tick. We
 * only abort the poll if we exceed `MAX_CONSECUTIVE_GETJOB_FAILURES` in a row.
 */
export async function pollJob(
  jobId: string,
  onUpdate?: (job: Job) => void,
  intervalMs = 2500,
  maxAttempts = 360
): Promise<Job> {
  let interval = 300;
  const ceiling = Math.max(500, intervalMs);
  const MAX_CONSECUTIVE_GETJOB_FAILURES = 4;
  let consecutiveFailures = 0;

  for (let i = 0; i < maxAttempts; i++) {
    let job: Job;
    try {
      job = await getJob(jobId);
      consecutiveFailures = 0;
    } catch (err: any) {
      consecutiveFailures += 1;
      console.warn(
        `[doc-centre] pollJob ${jobId}: getJob failed (${consecutiveFailures}/${MAX_CONSECUTIVE_GETJOB_FAILURES})`,
        err?.message ?? err
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_GETJOB_FAILURES) {
        throw new Error(
          `Job ${jobId} status check failed ${consecutiveFailures} times in a row: ${err?.message ?? err}`
        );
      }
      await new Promise((r) => setTimeout(r, interval));
      interval = Math.min(Math.round(interval * 1.5), ceiling);
      continue;
    }

    onUpdate?.(job);

    if (TERMINAL_STATUSES.has(job.status)) {
      return job;
    }

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(Math.round(interval * 1.5), ceiling);
  }

  throw new Error(`Job ${jobId} did not complete after ${maxAttempts} polls`);
}

// ── Operation endpoints ──────────────────────────────────────────

export async function rotate(
  assetId: string,
  angle: 90 | 180 | 270
): Promise<{ job_id: string }> {
  return request("v1/operations/rotate", "POST", { asset_id: assetId, angle });
}

export async function grayscale(
  assetId: string
): Promise<{ job_id: string }> {
  return request("v1/operations/grayscale", "POST", { asset_id: assetId });
}

export async function cmyk(
  assetId: string,
  iccProfile?: string
): Promise<{ job_id: string }> {
  return request("v1/operations/cmyk", "POST", {
    asset_id: assetId,
    ...(iccProfile ? { icc_profile: iccProfile } : {}),
  });
}

export async function resize(
  assetId: string,
  widthMm: number,
  heightMm: number,
  fitMode: "fit" | "fill" = "fit"
): Promise<{ job_id: string }> {
  return request("v1/operations/resize", "POST", {
    asset_id: assetId,
    width_mm: widthMm,
    height_mm: heightMm,
    fit_mode: fitMode,
  });
}

export async function nup(
  assetId: string,
  columns: number,
  rows: number,
  pageWidthMm: number,
  pageHeightMm: number
): Promise<{ job_id: string }> {
  return request("v1/operations/nup", "POST", {
    asset_id: assetId,
    columns,
    rows,
    page_width_mm: pageWidthMm,
    page_height_mm: pageHeightMm,
  });
}

export interface ImposeSheetOptions {
  asset_id: string;
  columns: number;
  rows: number;
  sheet_width_mm: number;
  sheet_height_mm: number;
  bleed_mm?: number;
  gap_mm?: number;
  outer_margin_mm?: number;
  show_crop_marks?: boolean;
  show_bleed_outline?: boolean;
}

export async function imposeSheet(
  options: ImposeSheetOptions
): Promise<{ job_id: string }> {
  return request("v1/operations/impose-sheet", "POST", options as unknown as Record<string, unknown>);
}

export async function booklet(
  assetId: string,
  sheetWidthMm: number,
  sheetHeightMm: number
): Promise<{ job_id: string }> {
  return request("v1/operations/booklet", "POST", {
    asset_id: assetId,
    sheet_width_mm: sheetWidthMm,
    sheet_height_mm: sheetHeightMm,
  });
}

export async function merge(
  assetIds: string[],
  outputFilename = "merged.pdf"
): Promise<{ job_id: string }> {
  return request("v1/operations/merge", "POST", {
    asset_ids: assetIds,
    output_filename: outputFilename,
  });
}

/**
 * @deprecated Use {@link generatePreviews} instead. crop_rasterize runs
 * Ghostscript twice (once per resolution); generate_previews runs it once
 * and downscales thumbnails with PIL — roughly half the wall-clock time.
 */
export async function cropRasterize(
  assetId: string,
  box: [number, number, number, number],
  dpi = 150
): Promise<{ job_id: string }> {
  return request("v1/operations/crop-rasterize", "POST", {
    asset_id: assetId,
    box,
    dpi,
  });
}

/**
 * Render previews + thumbnails in a single Ghostscript pass.
 *
 * Optional `renderBox` (PDF user-space points [x0, y0, x1, y1]) crops the
 * source to the target print area before rasterizing — typically the
 * asset's TrimBox after the user accepts a bleed advisory.
 */
export async function generatePreviews(
  assetId: string,
  renderBox?: [number, number, number, number]
): Promise<{ job_id: string }> {
  return request("v1/operations/generate-previews", "POST", {
    asset_id: assetId,
    ...(renderBox ? { render_box: renderBox } : {}),
  });
}

export async function rasterize(
  assetId: string,
  dpi = 150
): Promise<{ job_id: string }> {
  return request("v1/operations/rasterize", "POST", {
    asset_id: assetId,
    dpi,
  });
}

/**
 * Convert an Office asset (Word, PowerPoint, OpenDocument) to PDF using
 * LibreOffice headless on the PDF server. On completion the asset's
 * `normalized_storage_path` points at the converted PDF and standard
 * inspect/render operations can run against it as if it were a native PDF.
 */
export async function convertOffice(
  assetId: string
): Promise<{ job_id: string }> {
  return request("v1/operations/convert-office", "POST", {
    asset_id: assetId,
  });
}

/**
 * Normalize page orientation: rotates landscape pages (width > height) by 90°
 * clockwise so they sit portrait-up alongside the rest of the document.
 * Used for bound documents / ring binders / presentations where mixed
 * orientations would otherwise print with sideways pages.
 *
 * The job promotes the rotated PDF to the asset's normalized_storage_path
 * and updates page boxes / dimensions in place. If no pages need rotating
 * the job completes as a no-op (skipped=true).
 */
export async function normalizeOrientation(
  assetId: string,
  dominant: "portrait" | "landscape" = "portrait"
): Promise<{ job_id: string }> {
  return request("v1/operations/normalize-orientation", "POST", {
    asset_id: assetId,
    dominant,
  });
}

/**
 * Print-ready CMYK conversion. Runs Ghostscript with the requested ICC
 * destination profile and rendering intent, preserving K-only text and
 * overprint settings. The resulting PDF is promoted to the asset's
 * `normalized_storage_path`. Idempotent: server skips if the asset is
 * already in the requested colourspace.
 */
export async function printReady(
  assetId: string,
  options: {
    intent?:
      | "relative_colorimetric"
      | "perceptual"
      | "absolute_colorimetric"
      | "saturation";
    destProfile?: string;
  } = {},
): Promise<{ job_id: string }> {
  return request("v1/operations/print-ready", "POST", {
    asset_id: assetId,
    intent: options.intent ?? "relative_colorimetric",
    dest_profile: options.destProfile ?? "fogra39",
  });
}

// ── Health ────────────────────────────────────────────────────────

export async function health(): Promise<{
  status: string;
  service: string;
  env: string;
}> {
  return request("health", "GET");
}
