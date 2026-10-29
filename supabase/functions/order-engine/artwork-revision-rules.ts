export const EARLY_JOB_STATUSES = new Set(["new", "new_job", "awaiting_files", "awaiting_payment", "proof_pending", "awaiting_proof", "proof_ready", "proof_approved", "approved_for_production"]);
export function canReviseArtwork(order: any, job: any, staff: boolean): boolean {
  return (staff ? ["new_order", "under_review", "approved"] : ["new_order", "under_review"]).includes(order.admin_status)
    && EARLY_JOB_STATUSES.has(job.job_status);
}

export function replaceArtworkPath(value: any, oldPath: string, replacement: any): any {
  if (Array.isArray(value)) return value.map(v => replaceArtworkPath(v, oldPath, replacement));
  if (!value || typeof value !== "object") return value;
  const result: Record<string, any> = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceArtworkPath(v, oldPath, replacement)]));
  if (value.storage_path === oldPath || value.file_path === oldPath) {
    if (value.storage_path === oldPath) result.storage_path = replacement.storage_path;
    if (value.file_path === oldPath) result.file_path = replacement.storage_path;
    result.file_name = replacement.file_name;
    result.file_size = replacement.file_size_bytes;
    for (const key of ["asset_id", "thumbnail_path", "thumbnail_url", "preview_url", "preview_path"]) delete result[key];
  }
  return result;
}