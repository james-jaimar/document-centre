// Generates the quote PDF (via quote-pdf), then emails the customer with a download link.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const quoteId = body?.quote_id as string | undefined;
    if (!quoteId) return json({ error: "quote_id required" }, 400);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: q } = await supa
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();
    if (!q) return json({ error: "Quote not found" }, 404);
    if (!q.customer_email) return json({ error: "Quote has no customer email" }, 400);

    const { data: tenant } = await supa
      .from("tenants")
      .select("name, slug")
      .eq("id", q.tenant_id)
      .maybeSingle();

    // 1. Generate/refresh PDF
    const pdfResp = await supa.functions.invoke("quote-pdf", { body: { quote_id: quoteId } });
    if (pdfResp.error) return json({ error: pdfResp.error.message }, 500);

    // 2. Signed URL (7 days)
    const path = (pdfResp.data as any)?.storage_path ?? q.pdf_storage_path;
    let downloadUrl: string | null = null;
    if (path) {
      const { data: signed } = await supa.storage
        .from("documents")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      downloadUrl = signed?.signedUrl ?? null;
    }

    // 3. Email intro
    const { data: intro } = await supa
      .from("tenant_settings")
      .select("setting_value")
      .eq("tenant_id", q.tenant_id)
      .eq("category", "quotes")
      .eq("setting_key", "email_intro")
      .maybeSingle();
    const introText = (intro?.setting_value as string) ?? "";

    const tenantName = tenant?.name ?? "Print Centre";
    const subject = `Your quote ${q.quote_number} from ${tenantName}`;
    const html = `
      <div style="font-family:system-ui,sans-serif;color:#1a1a1a;max-width:600px">
        <h2>Quote ${q.quote_number}</h2>
        ${introText ? `<p>${introText.replace(/\n/g, "<br>")}</p>` : ""}
        <p>Hi ${q.customer_name ?? "there"},</p>
        <p>Please find your quotation attached. It's valid until
          <strong>${q.valid_until ? new Date(q.valid_until).toLocaleDateString() : "—"}</strong>.</p>
        <p><strong>Total: ${new Intl.NumberFormat("en-ZA", { style: "currency", currency: q.currency ?? "ZAR" }).format(Number(q.total_amount))}</strong></p>
        ${downloadUrl ? `<p><a href="${downloadUrl}" style="background:#0ea5e9;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Download Quote PDF</a></p>` : ""}
        <p style="color:#666;font-size:12px;margin-top:24px">— ${tenantName}</p>
      </div>
    `;

    // 4. Send via existing send-email function (forward caller auth)
    const authHeader = req.headers.get("Authorization") ?? "";
    const sendResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        tenant_id: q.tenant_id,
        to: q.customer_email,
        subject,
        html,
        category: "transactional",
        related_type: "quote",
        related_id: q.id,
      }),
    });
    if (!sendResp.ok) {
      const t = await sendResp.text();
      return json({ error: `send-email failed: ${t}` }, 500);
    }

    return json({ success: true, download_url: downloadUrl });
  } catch (e: any) {
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
