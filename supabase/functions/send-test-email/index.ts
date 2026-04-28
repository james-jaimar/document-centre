// Platform admin only: enqueues a branded SMTP test email via email_outbox.
// Returns the outbox row id so the caller can poll status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { DC_BRAND, renderBrandedEmail, renderBrandedText, escapeHtml } from "../_shared/branded-shell.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supaUrl, svc);

    // Auth: either platform_admin JWT, or shared X-Test-Secret matching TEST_USER_PASSWORD
    let callerId: string | null = null;
    const testSecret = req.headers.get("X-Test-Secret");
    const expectedSecret = Deno.env.get("TEST_USER_PASSWORD");
    const secretOk = !!(testSecret && expectedSecret && testSecret === expectedSecret);

    if (!secretOk) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing authorization" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supaUrl, anon, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Invalid session" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "platform_admin")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerId = userData.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const to = String(body?.to ?? "").trim();
    if (!to || !/.+@.+\..+/.test(to)) {
      return new Response(JSON.stringify({ error: "Valid 'to' email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const subject = String(body?.subject ?? "Document Centre · SMTP test");

    const now = new Date().toISOString();
    const html = renderBrandedEmail({
      preheader: "SMTP delivery test from Document Centre",
      heading: "SMTP test email",
      bodyHtml: `
        <p>If you're reading this in your inbox, the Document Centre platform SMTP pipeline is working end-to-end.</p>
        <p style="margin:14px 0 0;">
          <strong>Sent at:</strong> ${escapeHtml(now)}<br/>
          <strong>From:</strong> ${escapeHtml(DC_BRAND.fromEmail)}<br/>
          <strong>To:</strong> ${escapeHtml(to)}
        </p>
      `,
      footerNote: "Triggered by a platform admin via the send-test-email function. Safe to ignore or delete.",
    });
    const text = renderBrandedText({
      heading: "SMTP test email",
      bodyText: `If you're reading this, the Document Centre platform SMTP pipeline is working.\nSent at: ${now}\nFrom: ${DC_BRAND.fromEmail}\nTo: ${to}`,
      footerNote: "Triggered by a platform admin via send-test-email.",
    });

    const { data: row, error: insErr } = await admin
      .from("email_outbox")
      .insert({
        to_email: to,
        from_name: DC_BRAND.fromName,
        from_email: DC_BRAND.fromEmail,
        reply_to: DC_BRAND.replyTo,
        subject,
        html,
        text_body: text,
        category: "transactional",
        created_by_profile_id: callerId,
        metadata: { source: "send-test-email", auth: secretOk ? "shared-secret" : "platform-admin" },
      })
      .select("id")
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ outbox_id: (row as any).id, to, queued_at: now }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
