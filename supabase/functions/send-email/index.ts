import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { enqueueEmail } from "../_shared/email-queue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { to, subject, html, text } = body;
    if (!to || !subject || (!html && !text)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, and html or text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(url, serviceKey);
    const queued = await enqueueEmail(admin, {
      to,
      subject,
      html,
      text,
      tenant_id: body.tenant_id ?? null,
      branch_id: body.branch_id ?? null,
      app_id: body.app_id ?? null,
      email_account_id: body.email_account_id ?? null,
      category: body.category ?? "transactional",
      related_type: body.related_type ?? null,
      related_id: body.related_id ?? null,
      cc: body.cc ?? null,
      bcc: body.bcc ?? null,
      reply_to: body.reply_to ?? null,
      from_name: body.from_name ?? null,
      from_email: body.from_email ?? null,
      scheduled_for: body.scheduled_for ?? null,
      created_by_profile_id: caller.id,
      metadata: body.metadata ?? {},
    });

    // Best-effort immediate dispatch so simple callers see fast delivery.
    fetch(`${url}/functions/v1/email-dispatcher`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}` },
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, queued: true, id: queued.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send email error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
