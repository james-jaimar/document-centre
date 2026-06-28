// Close an impersonation_sessions audit row when the staff member exits.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({}));
    const impersonation_id = String(body.impersonation_id ?? "").trim();
    const reason = String(body.reason ?? "user_exit").trim();
    if (!impersonation_id) return json({ error: "impersonation_id required" }, 400);

    // No JWT required: by the time the client calls this, the auth context is
    // typically the customer's session. The id+actor was minted server-side
    // and can only be guessed, but to be safe we restrict mutation to rows
    // that are still open.
    const admin = createClient(url, serviceKey);
    const { error } = await admin
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString(), ended_reason: reason })
      .eq("id", impersonation_id)
      .is("ended_at", null);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
