/**
 * Shared download plumbing.
 *
 * Presigned S3 URLs live on another origin, and browsers ignore an anchor's
 * `download` attribute for cross-origin links — which is why files used to
 * open inline in a tab with their raw storage key as the name. Everything
 * here therefore comes back through our own `s3-storage` edge function with
 * an explicit `Content-Disposition: attachment; filename=…`, so the browser
 * always saves the file under a readable, order-based name.
 *
 * Where the File System Access API exists (Chrome/Edge) we stream straight to
 * the file the user picks, so multi-hundred-MB print-ready PDFs never have to
 * be buffered in memory.
 */
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Sanitise a string for use inside a download filename. */
export function safeFilenamePart(s: string | null | undefined, fallback = "file"): string {
  const v = (s ?? "")
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return v || fallback;
}

/** Join non-empty parts with a dash and append the extension once. */
export function buildFilename(parts: (string | null | undefined)[], ext = "pdf"): string {
  const stem = parts
    .map((p) => safeFilenamePart(p, ""))
    .filter(Boolean)
    .join("-");
  const base = stem || "download";
  const clean = base.replace(new RegExp(`\\.${ext}$`, "i"), "");
  return `${clean}.${ext}`;
}

type SavePicker = (opts: {
  suggestedName?: string;
}) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>;

function getSavePicker(): SavePicker | null {
  const w = window as unknown as { showSaveFilePicker?: SavePicker };
  return typeof w.showSaveFilePicker === "function" ? w.showSaveFilePicker : null;
}

/** Save a Blob already held in memory under the given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Download an S3 object as a real file save.
 *
 * @param objectPath S3 object key.
 * @param filename   Name to save it as (already human-readable).
 */
export async function downloadObject(objectPath: string, filename: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Your session has expired — please sign in again.");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/s3-storage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "download", object_path: objectPath, filename }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Download failed (${res.status})`);
  }

  // Preferred path: let the user choose where to save and stream to disk.
  const picker = getSavePicker();
  if (picker && res.body) {
    try {
      const handle = await picker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await res.body.pipeTo(writable);
      return;
    } catch (err) {
      // User cancelled the save dialog — nothing more to do.
      if ((err as DOMException)?.name === "AbortError") return;
      // Anything else (e.g. picker blocked outside a user gesture): fall back.
      console.warn("[download] save picker unavailable, falling back to blob", err);
    }
  }

  const blob = await res.blob();
  downloadBlob(blob, filename);
}

/** Download an already-fetched Response body under a given filename. */
export async function downloadResponse(res: Response, filename: string): Promise<void> {
  const blob = await res.blob();
  downloadBlob(blob, filename);
}
