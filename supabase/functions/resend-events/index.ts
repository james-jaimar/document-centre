// Receives Resend webhooks (delivery, open, click, bounce, complaint,
// unsubscribe) and folds them into the same campaign history and suppression
// records the rest of the app already uses.
//
// Configure the endpoint in Resend → Webhooks:
//   https://<project>.functions.supabase.co/resend-events?account=<email_account_id>
// The optional signing secret is stored on the mailbox row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, svix-id, svix-timestamp, svix-signature",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function verifySvix(
  secret: string,
  headers: Headers,
  payload: string,
): Promise<boolean> {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return signature.split(" ").some((part) => part.split(",")[1] === expected);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const raw = await req.text();

  try {
    const accountId = new URL(req.url).searchParams.get("account");
    let account: Record<string, unknown> | null = null;
    if (accountId) {
      const { data } = await admin
        .from("email_accounts")
        .select("id, tenant_id, resend_webhook_secret_id")
        .eq("id", accountId)
        .maybeSingle();
      account = data ?? null;
    }

    if (account?.resend_webhook_secret_id) {
      const { data: secret } = await admin.rpc("read_email_account_secret", {
        p_secret_id: account.resend_webhook_secret_id,
      });
      if (secret && !(await verifySvix(String(secret), req.headers, raw))) {
        return json({ error: "Invalid signature" }, 401);
      }
    }

    const event = JSON.parse(raw) as {
      type?: string;
      data?: { email_id?: string; broadcast_id?: string; to?: string | string[]; click?: { link?: string } };
    };
    const type = event.type ?? "";
    const data = event.data ?? {};
    const email = (Array.isArray(data.to) ? data.to[0] : data.to)?.trim().toLowerCase() ?? null;
    const broadcastId = data.broadcast_id ?? null;
    if (!email) return json({ ok: true, ignored: "no recipient" });

    // Match the recipient row through the broadcast when we can.
    let recipient: { id: string; campaign_id: string } | null = null;
    if (broadcastId) {
      const { data: campaign } = await admin
        .from("platform_email_campaigns")
        .select("id, tenant_id")
        .eq("resend_broadcast_id", broadcastId)
        .maybeSingle();
      if (campaign) {
        const { data: rec } = await admin
          .from("platform_email_campaign_recipients")
          .select("id, campaign_id")
          .eq("campaign_id", (campaign as { id: string }).id)
          .eq("email", email)
          .maybeSingle();
        recipient = (rec as typeof recipient) ?? null;
      }
    }

    const now = new Date().toISOString();

    if (recipient) {
      const patch: Record<string, unknown> = {};
      if (type === "email.opened") {
        const { data: current } = await admin
          .from("platform_email_campaign_recipients")
          .select("first_opened_at, open_count").eq("id", recipient.id).maybeSingle();
        patch.first_opened_at = (current as any)?.first_opened_at ?? now;
        patch.open_count = ((current as any)?.open_count ?? 0) + 1;
      } else if (type === "email.clicked") {
        const { data: current } = await admin
          .from("platform_email_campaign_recipients")
          .select("first_clicked_at, click_count").eq("id", recipient.id).maybeSingle();
        patch.first_clicked_at = (current as any)?.first_clicked_at ?? now;
        patch.click_count = ((current as any)?.click_count ?? 0) + 1;
        if (data.click?.link) patch.last_clicked_url = data.click.link;
      } else if (type === "email.delivered") {
        patch.status = "sent";
      } else if (type === "email.bounced" || type === "email.failed") {
        patch.status = "failed";
        patch.error = type;
      } else if (type === "email.complained" || type === "contact.unsubscribed") {
        patch.status = "unsubscribed";
      }
      if (Object.keys(patch).length) {
        await admin.from("platform_email_campaign_recipients").update(patch).eq("id", recipient.id);
      }
    }

    // Suppress hard failures and opt-outs everywhere, not just this campaign.
    if (type === "email.bounced" || type === "email.complained") {
      await admin.from("email_suppressions")
        .upsert(
          { email, reason: type === "email.bounced" ? "bounce" : "complaint", source: "resend" },
          { onConflict: "email" },
        );
    }
    if (type === "contact.unsubscribed" || type === "email.complained") {
      const tenantId = (account?.tenant_id as string | null) ?? null;
      // The unique index is expression-based (COALESCE on tenant_id), so check
      // first rather than relying on upsert conflict resolution.
      const query = admin.from("email_unsubscribes").select("id")
        .eq("email", email).eq("scope", "marketing");
      const { data: existing } = tenantId
        ? await query.eq("tenant_id", tenantId).maybeSingle()
        : await query.is("tenant_id", null).maybeSingle();
      if (!existing) {
        await admin.from("email_unsubscribes").insert({
          tenant_id: tenantId,
          email,
          scope: "marketing",
          source: "resend",
          campaign_id: recipient?.campaign_id ?? null,
          recipient_id: recipient?.id ?? null,
        });
      }
    }

    return json({ ok: true, type });
  } catch (e) {
    console.error("resend-events error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
