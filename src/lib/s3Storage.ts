/**
 * Client-side helpers for S3 storage operations via the s3-storage edge function.
 *
 * Resilience model (mirrors documentCentreApi.ts):
 *   • Edge-function calls (sign-upload, sign-download, copy, delete) are retried
 *     on transient platform failures: HTTP 429/5xx, Supabase edge runtime errors,
 *     and bare network blips (TypeError from fetch).
 *   • The actual S3 PUT in uploadToS3 is also retried on 429/5xx/network errors
 *     — pre-signed URLs stay valid for ~15 minutes so re-using the same URL
 *     across a few retries is safe.
 *   • If the PUT keeps failing on the same signed URL, we re-sign once and try
 *     a fresh URL before giving up — guards against the rare case of a bad URL.
 *   • Errors surfaced to the UI are deliberately generic ("Upload temporarily
 *     unavailable…") so customers never see raw S3/edge wording. Each error
 *     carries a short ref id so we can grep server logs if a user reports it.
 */
import { supabase } from "@/integrations/supabase/client";

// ── Retry plumbing ──────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 6;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** ~600ms, 1.2s, 2.4s, 4.8s, capped at 6s, plus 0–250ms jitter. */
function backoffDelay(attempt: number): number {
  const base = Math.min(600 * 2 ** attempt, 6000);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function bodyLooksTransient(text: string | null | undefined): boolean {
  if (!text) return false;
  if (text.includes("SUPABASE_EDGE_RUNTIME_ERROR")) return true;
  if (text.includes("Service is temporarily unavailable")) return true;
  if (text.includes("WORKER_LIMIT")) return true;
  if (text.includes("temporarily unavailable")) return true;
  return false;
}

/** Heuristic: did this thrown error look like a transient platform failure? */
function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (/Failed to fetch|NetworkError|network error|load failed/i.test(msg)) return true;
  if (bodyLooksTransient(msg)) return true;
  // Embedded "[NNN]" status from our own thrown messages.
  const m = msg.match(/\[(\d{3})\]/);
  if (m && isTransientHttpStatus(Number(m[1]))) return true;
  return false;
}

/**
 * Heuristic: did this failure come from an expired / not-yet-refreshed access
 * token rather than a real permission problem?
 *
 * A tab left open past token expiry fires its next storage request with a dead
 * JWT, so `s3-storage` (which validates via `supabase.auth.getUser()`) replies
 * 401. That is recoverable — refresh the session and try again once.
 */
function isAuthError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (/No active session/i.test(msg)) return true;
  if (/\[(401|403)\]/.test(msg)) return true;
  if (/Unauthorized|invalid claim|JWT expired|token is expired|bad_jwt/i.test(msg)) return true;
  return false;
}

/**
 * Run a storage operation; if it fails purely because the access token was
 * stale, refresh the session once and retry. Never creates a user — session
 * ownership stays with CustomerLayout.
 */
async function withAuthRecovery<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isAuthError(err)) throw err;
    console.warn(
      `[s3-storage] ${label} hit an auth failure, refreshing session and retrying once:`,
      err instanceof Error ? err.message : err,
    );
    const { data, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr || !data.session?.access_token) {
      console.warn("[s3-storage] session refresh failed", refreshErr?.message);
      throw err;
    }
    return await fn();
  }
}

/** Short opaque ref id (8 chars) included in user-facing errors for log lookup. */
function newRefId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface RetryOpts {
  /** Max retries on top of the initial attempt. */
  maxRetries?: number;
  /** Used in console warnings for traceability. */
  label?: string;
}

async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const label = opts.label ?? "s3-op";
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const transient = isTransientError(err);
      if (!transient || attempt >= maxRetries) {
        throw err;
      }
      const delay = backoffDelay(attempt);
      console.warn(
        `[s3-storage] transient ${label} failure, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`,
        err instanceof Error ? err.message : err,
      );
      await sleep(delay);
    }
  }
  throw lastError ?? new Error(`${label} failed`);
}

/** Convert internal error wording into customer-friendly text, with a ref tag. */
function userFacingError(action: string, err: unknown, ref: string): Error {
  const inner = err instanceof Error ? err.message : String(err);
  const isTransient = isTransientError(err);
  if (isTransient) {
    return new Error(
      `Storage is temporarily unavailable while ${action}. Please try again in a moment. (ref: ${ref})`,
    );
  }
  // Permanent errors — keep diagnostic detail in console, surface a clean
  // sentence to the UI.
  console.error(`[s3-storage] ${action} failed (ref: ${ref}):`, inner);
  return new Error(`Couldn't ${action}. Please try again. (ref: ${ref})`);
}

// ── Edge-function plumbing ──────────────────────────────────────────

async function callS3Function(body: Record<string, unknown>) {
  return withAuthRecovery(
    () =>
      withRetry(
        async () => {
          const { data, error } = await supabase.functions.invoke("s3-storage", { body });
          if (error) {
            // supabase.functions.invoke wraps non-2xx responses + network errors.
            // Surface the HTTP status when we have it so the auth-recovery and
            // transient classifiers can both see it.
            const status = (error as { context?: { status?: number } })?.context?.status;
            throw new Error(
              status
                ? `storage call failed [${status}]: ${error.message}`
                : `storage call failed: ${error.message}`,
            );
          }
          if (data?.error) {
            // The function returned 200 with a body { error }. Treat platform-style
            // strings as transient so we keep retrying through Supabase hiccups.
            throw new Error(data.error);
          }
          return data;
        },
        { label: `invoke(${body.action ?? "?"})` },
      ),
    `invoke(${body.action ?? "?"})`,
  );
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Get a presigned PUT URL for uploading a file to S3.
 */
export async function getUploadUrl(objectPath: string): Promise<{ url: string; method: string }> {
  const ref = newRefId();
  try {
    const data = await callS3Function({
      action: "sign-upload",
      object_path: objectPath,
    });
    return { url: data.url, method: data.method };
  } catch (err) {
    throw userFacingError("preparing the upload", err, ref);
  }
}

/**
 * Upload a file to S3 using a presigned URL.
 *
 * Resilience pattern:
 *   1. Acquire presigned URL via the edge function (callS3Function already retries).
 *   2. PUT to S3, retried on 429/5xx/network errors using the same URL
 *      (presigned URLs are valid for ~15 minutes).
 *   3. If the PUT round still fails AND the failure is transient, re-sign
 *      a fresh URL and try one more PUT round. Guards against malformed-URL
 *      edge cases where every retry against the same URL is doomed.
 */
export async function uploadToS3(objectPath: string, file: File | Blob): Promise<void> {
  const ref = newRefId();

  const doPut = async (signedUrl: string) =>
    withRetry(
      async () => {
        let res: Response;
        try {
          res = await fetch(signedUrl, { method: "PUT", body: file });
        } catch (networkErr: any) {
          throw new Error(`network error: ${networkErr?.message ?? networkErr}`);
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`upload failed [${res.status}]: ${text}`);
        }
      },
      { label: "PUT upload" },
    );

  let signed: { url: string; method: string };
  try {
    signed = await getUploadUrl(objectPath);
  } catch (err) {
    // Already user-facing.
    throw err;
  }

  try {
    await doPut(signed.url);
    return;
  } catch (firstErr) {
    if (!isTransientError(firstErr)) {
      throw userFacingError("uploading the file", firstErr, ref);
    }
    // Last-ditch attempt with a fresh signed URL.
    console.warn(
      `[s3-storage] PUT exhausted retries (ref: ${ref}), re-signing and retrying once:`,
      firstErr instanceof Error ? firstErr.message : firstErr,
    );
    try {
      const fresh = await getUploadUrl(objectPath);
      await doPut(fresh.url);
      return;
    } catch (secondErr) {
      throw userFacingError("uploading the file", secondErr, ref);
    }
  }
}

/**
 * Get presigned download URLs for multiple S3 object paths.
 * Returns a map of objectPath → signedUrl.
 */
export async function getDownloadUrls(objectPaths: string[]): Promise<Record<string, string>> {
  if (objectPaths.length === 0) return {};
  const ref = newRefId();
  try {
    const data = await callS3Function({
      action: "sign-download",
      object_paths: objectPaths,
    });
    return data.signed_urls ?? {};
  } catch (err) {
    throw userFacingError("loading previews", err, ref);
  }
}

/**
 * Get object sizes (bytes) for one or more S3 paths without downloading them.
 * Returns a map of objectPath → size (null when unknown).
 */
export async function getObjectSizes(
  objectPaths: string[],
): Promise<Record<string, number | null>> {
  if (objectPaths.length === 0) return {};
  try {
    const data = await callS3Function({ action: "stat", object_paths: objectPaths });
    return data?.sizes ?? {};
  } catch (err) {
    console.warn("[s3-storage] stat failed", err);
    return {};
  }
}


/**
 * Download an object through our Edge Function rather than directly from S3.
 * This avoids browser S3 CORS when the caller needs to draw the image into a
 * canvas/WebGL texture (canvas prints editor + proof renderer).
 */
export async function downloadFromS3(objectPath: string): Promise<Blob> {
  const ref = newRefId();
  try {
    return await withAuthRecovery(
      () =>
        withRetry(
          async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            if (!token) throw new Error("No active session");

            const res = await fetch(`${SUPABASE_URL}/functions/v1/s3-storage`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                apikey: SUPABASE_PUBLISHABLE_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ action: "download", object_path: objectPath }),
            });
            if (!res.ok) {
              const text = await res.text().catch(() => "");
              throw new Error(`download failed [${res.status}]: ${text}`);
            }
            return await res.blob();
          },
          { label: "download" },
        ),
      "download",
    );
  } catch (err) {
    throw userFacingError("loading previews", err, ref);
  }
}

/**
 * Delete one or more S3 objects.
 */
export async function deleteFromS3(objectPaths: string[]): Promise<void> {
  if (objectPaths.length === 0) return;
  const ref = newRefId();
  try {
    await callS3Function({
      action: "delete",
      object_paths: objectPaths,
    });
  } catch (err) {
    throw userFacingError("removing files", err, ref);
  }
}

/**
 * Physically copy an S3 object to a new key (server-side stream).
 * Returns the new object path.
 */
export async function copyS3Object(sourcePath: string, destPath: string): Promise<string> {
  const ref = newRefId();
  try {
    await callS3Function({
      action: "copy",
      source_path: sourcePath,
      dest_path: destPath,
    });
    return destPath;
  } catch (err) {
    throw userFacingError("copying the file", err, ref);
  }
}
