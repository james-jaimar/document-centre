import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = parseInt(parts[2], 10);
  const salt = b64decode(parts[3]);
  const expected = b64decode(parts[4]);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    expected.length * 8,
  );
  return timingSafeEqual(new Uint8Array(bits), expected);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tenant_id, password } = await req.json();
    if (!tenant_id || typeof password !== "string") {
      return json({ error: "tenant_id and password required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("tenant_demo_gate")
      .select("password_hash, enabled, cookie_days")
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.enabled || !data.password_hash) {
      return json({ error: "Demo gate not configured" }, 400);
    }

    const ok = await verifyPassword(password, data.password_hash);
    if (!ok) return json({ error: "Incorrect password" }, 401);

    const expires_at = Date.now() + (data.cookie_days ?? 30) * 86400_000;
    return json({ ok: true, expires_at });
  } catch (e) {
    console.error("demo-gate-unlock error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
