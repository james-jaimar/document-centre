// Generates a branded quote PDF, uploads to storage, and updates quotes.pdf_storage_path.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fmtMoney = (n: number, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 2 })
    .format(n || 0);

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

    const { data: q, error: qErr } = await supa
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("id", quoteId)
      .single();
    if (qErr || !q) return json({ error: qErr?.message ?? "Quote not found" }, 404);

    // Pull terms from tenant_settings
    const { data: terms } = await supa
      .from("tenant_settings")
      .select("setting_value")
      .eq("tenant_id", q.tenant_id)
      .eq("category", "quotes")
      .eq("setting_key", "pdf_terms")
      .maybeSingle();

    // Build PDF
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const dark = rgb(0.1, 0.1, 0.12);
    const muted = rgb(0.4, 0.42, 0.46);

    let y = 800;
    page.drawText("QUOTATION", { x: 44, y, size: 24, font: bold, color: dark });
    y -= 28;
    page.drawText(`Quote #: ${q.quote_number}`, { x: 44, y, size: 11, font, color: dark });
    y -= 16;
    page.drawText(`Date: ${new Date(q.created_at).toLocaleDateString()}`, { x: 44, y, size: 10, font, color: muted });
    y -= 14;
    if (q.valid_until) {
      page.drawText(`Valid until: ${new Date(q.valid_until).toLocaleDateString()}`, {
        x: 44, y, size: 10, font, color: muted,
      });
      y -= 14;
    }

    y -= 14;
    page.drawText("Bill To", { x: 44, y, size: 10, font: bold, color: dark });
    y -= 14;
    page.drawText(q.customer_name ?? q.customer_email ?? "Customer", { x: 44, y, size: 10, font, color: dark });
    if (q.customer_email && q.customer_name) {
      y -= 12;
      page.drawText(q.customer_email, { x: 44, y, size: 9, font, color: muted });
    }

    // Items table
    y -= 30;
    page.drawText("Item", { x: 44, y, size: 10, font: bold, color: dark });
    page.drawText("Qty", { x: 350, y, size: 10, font: bold, color: dark });
    page.drawText("Unit", { x: 400, y, size: 10, font: bold, color: dark });
    page.drawText("Total", { x: 490, y, size: 10, font: bold, color: dark });
    y -= 6;
    page.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 0.5, color: muted });

    const currency = (q.currency as string) ?? "ZAR";
    for (const item of (q.quote_items as any[]) ?? []) {
      y -= 16;
      if (y < 100) break; // single-page MVP
      const name = (item.job_name ?? item.product_name ?? "Item").slice(0, 50);
      page.drawText(name, { x: 44, y, size: 10, font, color: dark });
      page.drawText(String(item.quantity), { x: 350, y, size: 10, font, color: dark });
      page.drawText(fmtMoney(Number(item.unit_price), currency), { x: 400, y, size: 10, font, color: dark });
      page.drawText(fmtMoney(Number(item.net_price), currency), { x: 490, y, size: 10, font, color: dark });
    }

    y -= 20;
    page.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 0.5, color: muted });
    y -= 18;
    page.drawText("Total", { x: 400, y, size: 12, font: bold, color: dark });
    page.drawText(fmtMoney(Number(q.total_amount), currency), { x: 490, y, size: 12, font: bold, color: dark });

    // Terms
    const termsTxt = (terms?.setting_value as string) ?? "";
    if (termsTxt) {
      y -= 40;
      page.drawText("Terms & Conditions", { x: 44, y, size: 9, font: bold, color: dark });
      y -= 12;
      const lines = termsTxt.split(/\r?\n/).slice(0, 8);
      for (const ln of lines) {
        page.drawText(ln.slice(0, 100), { x: 44, y, size: 8, font, color: muted });
        y -= 11;
      }
    }

    const bytes = await pdf.save();

    // Upload to storage
    const storagePath = `quotes/${q.tenant_id}/${q.id}.pdf`;
    const { error: upErr } = await supa.storage
      .from("documents")
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) return json({ error: upErr.message }, 500);

    await supa
      .from("quotes")
      .update({
        pdf_storage_path: storagePath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", q.id);

    return json({ success: true, storage_path: storagePath });
  } catch (e: any) {
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
