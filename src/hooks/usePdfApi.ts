import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PdfApiOptions {
  maxRetries?: number;
  retryDelay?: number;
}

interface PdfApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Mirrors the transient-failure classification in
 * `src/lib/documentCentreApi.ts` so that any non-upload PDF operation that
 * still uses this hook gets the same resilience to Supabase Edge Runtime
 * 503s and edge-worker recycling.
 */
function isTransientFunctionsError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { message?: string; context?: { status?: number } };
  const status = anyErr?.context?.status;
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  const msg = anyErr?.message ?? "";
  if (/Failed to send a request to the Edge Function/i.test(msg)) return true;
  if (/SUPABASE_EDGE_RUNTIME_ERROR/i.test(msg)) return true;
  if (/temporarily unavailable/i.test(msg)) return true;
  if (/network|fetch/i.test(msg) && !/auth/i.test(msg)) return true;
  return false;
}

function isTransientPayload(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as { error?: string; code?: string; busy?: boolean };
  if (d.busy) return true;
  if (d.code === "SUPABASE_EDGE_RUNTIME_ERROR") return true;
  if (typeof d.error === "string" && /temporarily unavailable|busy/i.test(d.error)) return true;
  return false;
}

export function usePdfApi<T = unknown>(options: PdfApiOptions = {}) {
  const { maxRetries = 4, retryDelay = 750 } = options;
  const [state, setState] = useState<PdfApiState<T>>({
    data: null,
    error: null,
    loading: false,
  });

  const invoke = useCallback(
    async (path: string, payload: Record<string, unknown> = {}): Promise<T | null> => {
      setState({ data: null, error: null, loading: true });

      // Bail out early if there's no auth session — prevents 401 spam
      // after logout while polling components are still mounted.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        setState({ data: null, error: "Not authenticated", loading: false });
        return null;
      }

      let lastError = "";

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const { data, error } = await supabase.functions.invoke("pdf-api", {
          body: { path, ...payload },
        });

        if (error) {
          lastError = error.message || "Edge function invocation failed";
          if (isTransientFunctionsError(error) && attempt < maxRetries) {
            const delay = Math.min(retryDelay * 2 ** attempt, 8000);
            console.warn(
              `[pdf-api] transient edge error for ${path}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
              error?.message ?? error
            );
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          break;
        }

        // App-level transient (busy / runtime error in payload)
        if (isTransientPayload(data)) {
          lastError =
            (data as { error?: string })?.error ?? "PDF server is busy";
          if (attempt < maxRetries) {
            const delay = Math.min(retryDelay * 2 ** attempt, 8000);
            console.warn(
              `[pdf-api] transient payload for ${path}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
            );
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          break;
        }

        // Real error responses forwarded from VPS — surface immediately.
        if ((data as { error?: string })?.error) {
          lastError = (data as { error?: string }).error!;
          break;
        }

        setState({ data: data as T, error: null, loading: false });
        return data as T;
      }

      setState({ data: null, error: lastError, loading: false });
      return null;
    },
    [maxRetries, retryDelay]
  );

  return { ...state, invoke };
}
