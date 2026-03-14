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

export function usePdfApi<T = unknown>(options: PdfApiOptions = {}) {
  const { maxRetries = 3, retryDelay = 2000 } = options;
  const [state, setState] = useState<PdfApiState<T>>({
    data: null,
    error: null,
    loading: false,
  });

  const invoke = useCallback(
    async (path: string, payload: Record<string, unknown> = {}): Promise<T | null> => {
      setState({ data: null, error: null, loading: true });

      let lastError = "";

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const { data, error } = await supabase.functions.invoke("pdf-api", {
          body: { path, ...payload },
        });

        if (error) {
          lastError = error.message || "Edge function invocation failed";
          break;
        }

        // Handle 503 busy with retry
        if (data?.busy) {
          lastError = data.error || "PDF server is busy";
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
            continue;
          }
          break;
        }

        // Handle error responses forwarded from VPS
        if (data?.error) {
          lastError = data.error;
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
