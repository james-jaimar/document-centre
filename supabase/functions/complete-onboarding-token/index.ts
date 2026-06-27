// Marks an onboarding token as consumed once the user has finished the
// flow (e.g. password set on /reset-password). Public so the browser
// can call it right after `auth.updateUser({ password })`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    if (!token) return json({ error: "missing_token" }, 400);

    const { data: row } = await admin
      .from("platform_onboarding_tokens")
      .select("id, campaign_recipient_id, consumed_at")
      .eq("token", token)
      .maybeSingle();
    if (!row) return json({ ok: true, already: false });

    if (!row.consumed_at) {
      const now = new Date().toISOString();
      await admin.from("platform_onboarding_tokens")
        .update({ consumed_at: now }).eq("id", row.id);
      if (row.campaign_recipient_id) {
        await admin.from("platform_email_campaign_recipients")
          .update({ status: "completed" }).eq("id", row.campaign_recipient_id);
      }
    }
    return json({ ok: true, already: !!row.consumed_at });
  } catch (e) {
    return json({ error: "internal", detail: (e as Error).message }, 500);
  }
});
