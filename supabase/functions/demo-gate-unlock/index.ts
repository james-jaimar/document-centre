import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const ok = await bcrypt.compare(password, data.password_hash);
    if (!ok) return json({ error: "Incorrect password" }, 401);

    const expires_at = Date.now() + (data.cookie_days ?? 30) * 86400_000;
    return json({ ok: true, expires_at });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
