// Public unsubscribe endpoint reached from the footer of every campaign email.
//
// GET  /email-unsubscribe?t=<token>          → confirmation page (one click confirms)
// POST /email-unsubscribe { token }          → records the unsubscribe (JSON)
//
// The token is the per-recipient `unsubscribe_token` on
// platform_email_campaign_recipients, so we can attribute the opt-out to the
// exact campaign and tenant without exposing the address in the URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function page(title: string, message: string, extra = ""): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
<div style="max-width:520px;margin:64px auto;background:#fff;border-radius:12px;padding:36px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
<h1 style="font-size:20px;margin:0 0 12px;color:#111;">${escapeHtml(title)}</h1>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0;">${message}</p>
${extra}
</div></body></html>`;
  return new Response(html, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
}

interface RecipientRow {
  id: string;
  email: string | null;
  campaign_id: string;
}

async function recordUnsubscribe(admin: any, token: string): Promise<{ ok: boolean; email?: string; sender?: string }> {
  const { data: recipient } = await admin
    .from("platform_email_campaign_recipients")
    .select("id, email, campaign_id")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  const row = recipient as RecipientRow | null;
  if (!row?.email) return { ok: false };

  const { data: campaign } = await admin
    .from("platform_email_campaigns").select("id, tenant_id").eq("id", row.campaign_id).maybeSingle();
  const tenantId = (campaign as { tenant_id: string | null } | null)?.tenant_id ?? null;

  let senderName = "Document Centre";
  if (tenantId) {
    const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    if (tenant?.name) senderName = tenant.name;
  }

  const { error } = await admin.from("email_unsubscribes").upsert({
    tenant_id: tenantId,
    email: row.email.toLowerCase(),
    scope: "marketing",
    source: "email_link",
    campaign_id: row.campaign_id,
    recipient_id: row.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,email,scope", ignoreDuplicates: false });

  // The unique index is expression-based (COALESCE on tenant_id), so a plain
  // upsert can miss it — fall back to an existence check + insert.
  if (error) {
    const query = admin.from("email_unsubscribes").select("id")
      .eq("email", row.email.toLowerCase()).eq("scope", "marketing");
    const { data: existing } = tenantId
      ? await query.eq("tenant_id", tenantId).maybeSingle()
      : await query.is("tenant_id", null).maybeSingle();
    if (!existing) {
      await admin.from("email_unsubscribes").insert({
        tenant_id: tenantId,
        email: row.email.toLowerCase(),
        scope: "marketing",
        source: "email_link",
        campaign_id: row.campaign_id,
        recipient_id: row.id,
      });
    }
  }

  return { ok: true, email: row.email, sender: senderName };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  try {
    const requestUrl = new URL(req.url);
    let token = requestUrl.searchParams.get("t") ?? "";
    let wantsJson = false;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      token = String((body as any)?.token ?? token).trim();
      wantsJson = true;
    }
    token = token.trim();

    if (!token) {
      return wantsJson
        ? new Response(JSON.stringify({ error: "missing_token" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        : page("Link not recognised", "This unsubscribe link is incomplete. Please use the link in the email you received.");
    }

    const result = await recordUnsubscribe(admin, token);

    if (wantsJson) {
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!result.ok) {
      return page("Link not recognised", "We couldn't match this unsubscribe link. It may already have been used.");
    }

    return page(
      "You've been unsubscribed",
      `<strong>${escapeHtml(result.email!)}</strong> will no longer receive marketing emails from ${escapeHtml(result.sender!)}.`,
      `<p style="font-size:13px;color:#777;margin-top:18px;">Order updates, quotes and invoices for work you've asked for are not affected.</p>`,
    );
  } catch (e) {
    console.error("email-unsubscribe error:", e);
    return page("Something went wrong", "We couldn't process your request just now. Please try again shortly.");
  }
});
