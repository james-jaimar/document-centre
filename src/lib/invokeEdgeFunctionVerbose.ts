// Like supabase.functions.invoke(), but reads the response body even on
// non-2xx so callers can show the server's actual error string instead of
// the generic "Edge Function returned a non-2xx status code" message.
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface VerboseResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export async function invokeEdgeFunctionVerbose<T = any>(
  fnName: string,
  body: unknown,
): Promise<VerboseResult<T>> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? SUPABASE_ANON_KEY;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    if (!res.ok) {
      const err =
        (parsed && (parsed.error || parsed.message)) ||
        text ||
        `Edge function ${fnName} returned ${res.status}`;
      return { ok: false, status: res.status, data: parsed, error: String(err) };
    }
    if (parsed && parsed.error) {
      return { ok: false, status: res.status, data: parsed, error: String(parsed.error) };
    }
    return { ok: true, status: res.status, data: parsed as T, error: null };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: (e as Error).message };
  }
}
