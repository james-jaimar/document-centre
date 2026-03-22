const BASE_URL = "https://document-centre-api.jaimar.dev";

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

// ── Helpers ──────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  console.log(`[doc-centre] ${options.method ?? "GET"} ${path}`);

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Document Centre API error ${res.status}: ${text}`);
  }

  return res.json();
}

// ── Asset endpoints ──────────────────────────────────────────────

export async function createAsset(
  payload: CreateAssetPayload
): Promise<CreateAssetResponse> {
  return request<CreateAssetResponse>("/v1/assets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAsset(assetId: string): Promise<Asset> {
  return request<Asset>(`/v1/assets/${assetId}`);
}

export async function getDerivedFiles(
  assetId: string
): Promise<DerivedFile[]> {
  return request<DerivedFile[]>(`/v1/assets/${assetId}/derived-files`);
}

export async function inspectAsset(
  assetId: string
): Promise<{ job_id: string }> {
  return request<{ job_id: string }>(`/v1/assets/${assetId}/inspect`, {
    method: "POST",
  });
}

// ── Job endpoints ────────────────────────────────────────────────

export async function getJob(jobId: string): Promise<Job> {
  return request<Job>(`/v1/jobs/${jobId}`);
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export async function pollJob(
  jobId: string,
  onUpdate?: (job: Job) => void,
  intervalMs = 2500,
  maxAttempts = 120
): Promise<Job> {
  for (let i = 0; i < maxAttempts; i++) {
    const job = await getJob(jobId);
    onUpdate?.(job);

    if (TERMINAL_STATUSES.has(job.status)) {
      return job;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Job ${jobId} did not complete after ${maxAttempts} polls`);
}

// ── Operation endpoints ──────────────────────────────────────────

export async function rotate(
  assetId: string,
  angle: 90 | 180 | 270
): Promise<{ job_id: string }> {
  return request("/v1/operations/rotate", {
    method: "POST",
    body: JSON.stringify({ asset_id: assetId, angle }),
  });
}

export async function grayscale(
  assetId: string
): Promise<{ job_id: string }> {
  return request("/v1/operations/grayscale", {
    method: "POST",
    body: JSON.stringify({ asset_id: assetId }),
  });
}

export async function cmyk(
  assetId: string,
  iccProfile?: string
): Promise<{ job_id: string }> {
  return request("/v1/operations/cmyk", {
    method: "POST",
    body: JSON.stringify({
      asset_id: assetId,
      ...(iccProfile ? { icc_profile: iccProfile } : {}),
    }),
  });
}

export async function resize(
  assetId: string,
  widthMm: number,
  heightMm: number,
  fitMode: "fit" | "fill" = "fit"
): Promise<{ job_id: string }> {
  return request("/v1/operations/resize", {
    method: "POST",
    body: JSON.stringify({
      asset_id: assetId,
      width_mm: widthMm,
      height_mm: heightMm,
      fit_mode: fitMode,
    }),
  });
}

export async function nup(
  assetId: string,
  columns: number,
  rows: number,
  pageWidthMm: number,
  pageHeightMm: number
): Promise<{ job_id: string }> {
  return request("/v1/operations/nup", {
    method: "POST",
    body: JSON.stringify({
      asset_id: assetId,
      columns,
      rows,
      page_width_mm: pageWidthMm,
      page_height_mm: pageHeightMm,
    }),
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
  return request("/v1/operations/impose-sheet", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function booklet(
  assetId: string,
  sheetWidthMm: number,
  sheetHeightMm: number
): Promise<{ job_id: string }> {
  return request("/v1/operations/booklet", {
    method: "POST",
    body: JSON.stringify({
      asset_id: assetId,
      sheet_width_mm: sheetWidthMm,
      sheet_height_mm: sheetHeightMm,
    }),
  });
}

export async function merge(
  assetIds: string[],
  outputFilename = "merged.pdf"
): Promise<{ job_id: string }> {
  return request("/v1/operations/merge", {
    method: "POST",
    body: JSON.stringify({
      asset_ids: assetIds,
      output_filename: outputFilename,
    }),
  });
}

// ── Health ────────────────────────────────────────────────────────

export async function health(): Promise<{
  status: string;
  service: string;
  env: string;
}> {
  return request("/health");
}
