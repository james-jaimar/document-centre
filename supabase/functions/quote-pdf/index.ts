// Generates a branded quote PDF (tenant + branch identity, banking & EFT, terms).
// Uses pdf-lib with multi-page support; embeds logo if present and brand color from tenant.settings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
  type RGB,
} from "https://esm.sh/pdf-lib@1.17.1";

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
    .format(Number.isFinite(n) ? n : 0);

const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/* ─── Colour helpers ─────────────────────────────────────────────────────── */
function hexToRgb(hex?: string | null): RGB {
  const fallback = rgb(0.13, 0.18, 0.36);
  if (!hex) return fallback;
  const m = hex.replace("#", "").match(/^([\da-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function tint(c: RGB, t: number): RGB {
  return rgb(c.red + (1 - c.red) * t, c.green + (1 - c.green) * t, c.blue + (1 - c.blue) * t);
}

/* ─── Branch / tenant resolution ─────────────────────────────────────────── */
interface ResolvedParty {
  trading_name: string;
  legal_name?: string;
  vat_number?: string;
  registration_number?: string;
  email?: string;
  billing_email?: string;
  accounts_email?: string;
  phone?: string;
  website?: string;
  address_lines: string[];
  banking?: {
    bank_name?: string;
    account_name?: string;
    account_number?: string;
    branch_code?: string;
    swift_code?: string;
    eft_enabled?: boolean;
    payment_instructions?: string;
  };
}

function pick<T>(...vals: (T | null | undefined | "")[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v as T;
  return undefined;
}

function resolveFromParty(tenant: any, branch: any): ResolvedParty {
  const tSettings = (tenant?.settings ?? {}) as any;
  const tBranding = (tSettings.branding ?? {}) as any;
  const tPay = (tSettings.payments ?? {}) as any;
  const tIdentity = (tSettings.identity ?? {}) as any;
  const bBank = (branch?.banking_details ?? {}) as any;

  const address_lines = [
    pick<string>(branch?.address, tIdentity.address),
    [pick<string>(branch?.city, tIdentity.city), pick<string>(branch?.province, tIdentity.province), pick<string>(branch?.postal_code, tIdentity.postal_code)]
      .filter(Boolean).join(", "),
    pick<string>(branch?.country, tIdentity.country),
  ].filter((s) => !!s && s.trim().length) as string[];

  // Resolve banking: branch first, then tenant settings (payments.banking)
  const tBank = (tPay.banking ?? {}) as any;
  const banking = {
    bank_name: pick<string>(bBank.bank_name, tBank.bank_name),
    account_name: pick<string>(bBank.account_name, tBank.account_name),
    account_number: pick<string>(bBank.account_number, tBank.account_number),
    branch_code: pick<string>(bBank.branch_code, tBank.branch_code),
    swift_code: pick<string>(bBank.swift_code, tBank.swift_code),
    eft_enabled: bBank.eft_enabled !== undefined ? !!bBank.eft_enabled : !!tBank.eft_enabled,
    payment_instructions: pick<string>(bBank.payment_instructions, tBank.payment_instructions),
  };

  return {
    trading_name: pick<string>(branch?.trading_name, branch?.name, tBranding.portal_name, tenant?.name) ?? "Quote",
    legal_name: pick<string>(branch?.legal_name, tIdentity.legal_name),
    vat_number: pick<string>(branch?.vat_number, tIdentity.vat_number),
    registration_number: pick<string>(branch?.registration_number, tIdentity.registration_number),
    email: pick<string>(branch?.email, tIdentity.email, tenant?.email),
    billing_email: pick<string>(branch?.billing_email, tIdentity.billing_email),
    accounts_email: pick<string>(branch?.accounts_email, tIdentity.accounts_email),
    phone: pick<string>(branch?.phone, tIdentity.phone, tenant?.phone),
    website: pick<string>(branch?.website_url, tIdentity.website, tenant?.website),
    address_lines,
    banking,
  };
}

/* ─── Logo loader ────────────────────────────────────────────────────────── */
async function fetchLogo(url?: string | null): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (ct.includes("png") || url.toLowerCase().endsWith(".png")) return { bytes: buf, kind: "png" };
    if (ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g$/i.test(url)) return { bytes: buf, kind: "jpg" };
    return null; // svg/webp not supported
  } catch {
    return null;
  }
}

/* ─── Text helpers ───────────────────────────────────────────────────────── */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) cur = next;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/* ─── Main handler ───────────────────────────────────────────────────────── */
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

    // Tenant + branch
    const [{ data: tenant }, { data: branch }] = await Promise.all([
      supa.from("tenants").select("*").eq("id", q.tenant_id).maybeSingle(),
      q.branch_id
        ? supa.from("branches").select("*").eq("id", q.branch_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const from = resolveFromParty(tenant, branch);
    const tSettings = (tenant?.settings ?? {}) as any;
    const tBranding = (tSettings.branding ?? {}) as any;
    const brand = hexToRgb(tBranding.primary_color ?? tBranding.brand_color ?? tenant?.brand_color);
    const brandSoft = tint(brand, 0.85);

    // Online payment gateway: branch override, else tenant
    let payOnlineEnabled = false;
    if (q.branch_id) {
      const { data: bGw } = await supa
        .from("branch_payment_gateways")
        .select("provider, mode, credentials_secret_id")
        .eq("branch_id", q.branch_id)
        .not("credentials_secret_id", "is", null);
      payOnlineEnabled = !!bGw?.length;
    }
    if (!payOnlineEnabled) {
      const { data: tGw } = await supa
        .from("tenant_payment_gateways")
        .select("provider, mode, credentials_secret_id, is_enabled")
        .eq("tenant_id", q.tenant_id)
        .eq("is_enabled", true)
        .not("credentials_secret_id", "is", null);
      payOnlineEnabled = !!tGw?.length;
    }

    // Terms
    const { data: terms } = await supa
      .from("tenant_settings")
      .select("setting_value")
      .eq("tenant_id", q.tenant_id)
      .eq("category", "quotes")
      .eq("setting_key", "pdf_terms")
      .maybeSingle();
    const termsTxt = (terms?.setting_value as string | null) ?? "";

    // Logo
    const logoUrl = tBranding.logo_url ?? tenant?.logo_url ?? null;
    const logo = await fetchLogo(logoUrl);

    /* ─── Build PDF ─── */
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const dark = rgb(0.1, 0.1, 0.12);
    const muted = rgb(0.42, 0.45, 0.5);
    const border = rgb(0.86, 0.88, 0.92);

    const W = 595, H = 842;
    const M = 44;

    let logoImg: any = null;
    if (logo) {
      try {
        logoImg = logo.kind === "png" ? await pdf.embedPng(logo.bytes) : await pdf.embedJpg(logo.bytes);
      } catch { /* ignore */ }
    }

    const pages: PDFPage[] = [];
    const newPage = () => {
      const p = pdf.addPage([W, H]);
      pages.push(p);
      return p;
    };

    /* ─── Header (page 1 only) ─── */
    let page = newPage();
    let y = H - M;

    // Logo (left) — fit into 140x48
    let headerLeftBottom = y;
    if (logoImg) {
      const maxW = 140, maxH = 48;
      const s = Math.min(maxW / logoImg.width, maxH / logoImg.height);
      const w = logoImg.width * s, h = logoImg.height * s;
      page.drawImage(logoImg, { x: M, y: y - h, width: w, height: h });
      headerLeftBottom = y - h;
    } else {
      page.drawText(from.trading_name, { x: M, y: y - 16, size: 16, font: bold, color: brand });
      headerLeftBottom = y - 22;
    }

    // Right block — QUOTATION + quote #
    page.drawText("QUOTATION", { x: W - M - 200, y: y - 16, size: 22, font: bold, color: brand });
    page.drawText(String(q.quote_number ?? ""), {
      x: W - M - 200, y: y - 36, size: 11, font: bold, color: dark,
    });
    page.drawText(`Issued ${fmtDate(q.created_at)}`, {
      x: W - M - 200, y: y - 50, size: 9, font, color: muted,
    });
    if (q.valid_until) {
      page.drawText(`Valid until ${fmtDate(q.valid_until)}`, {
        x: W - M - 200, y: y - 62, size: 9, font, color: muted,
      });
    }

    y = Math.min(headerLeftBottom, y - 70) - 14;

    // Brand divider
    page.drawRectangle({ x: M, y: y, width: W - 2 * M, height: 3, color: brand });
    y -= 18;

    /* ─── From / Bill To ─── */
    const colW = (W - 2 * M - 20) / 2;
    let yFrom = y, yBill = y;

    const writeLine = (text: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: RGB } = {}) => {
      const s = opts.size ?? 9;
      page.drawText(text, { x, y: yy, size: s, font: opts.bold ? bold : font, color: opts.color ?? dark });
    };

    // From
    writeLine("FROM", M, yFrom, { size: 8, bold: true, color: muted }); yFrom -= 12;
    writeLine(from.trading_name, M, yFrom, { size: 11, bold: true }); yFrom -= 14;
    if (from.legal_name && from.legal_name !== from.trading_name) { writeLine(from.legal_name, M, yFrom, { color: muted }); yFrom -= 11; }
    for (const ln of from.address_lines) { writeLine(ln, M, yFrom); yFrom -= 11; }
    if (from.phone) { writeLine(from.phone, M, yFrom); yFrom -= 11; }
    if (from.email) { writeLine(from.email, M, yFrom); yFrom -= 11; }
    if (from.website) { writeLine(from.website, M, yFrom, { color: muted }); yFrom -= 11; }
    if (from.vat_number) { writeLine(`VAT: ${from.vat_number}`, M, yFrom, { color: muted }); yFrom -= 11; }
    if (from.registration_number) { writeLine(`Reg: ${from.registration_number}`, M, yFrom, { color: muted }); yFrom -= 11; }

    // Bill To
    const billX = M + colW + 20;
    writeLine("BILL TO", billX, yBill, { size: 8, bold: true, color: muted }); yBill -= 12;
    const billName = q.customer_name ?? q.customer_email ?? "Customer";
    writeLine(String(billName), billX, yBill, { size: 11, bold: true }); yBill -= 14;
    if (q.customer_name && q.customer_email) { writeLine(String(q.customer_email), billX, yBill, { color: muted }); yBill -= 11; }
    if ((q as any).customer_phone) { writeLine(String((q as any).customer_phone), billX, yBill); yBill -= 11; }

    y = Math.min(yFrom, yBill) - 18;

    /* ─── Items table — paginated ─── */
    const currency = (q.currency as string) ?? "ZAR";
    const items = (q.quote_items as any[]) ?? [];

    const cols = {
      item: { x: M, w: 280 },
      qty: { x: M + 290, w: 40, align: "right" as const },
      unit: { x: M + 340, w: 80, align: "right" as const },
      total: { x: M + 430, w: W - M - (M + 430), align: "right" as const },
    };

    const drawHeader = (yy: number) => {
      page.drawRectangle({ x: M, y: yy - 4, width: W - 2 * M, height: 22, color: brandSoft });
      const ty = yy + 5;
      writeLine("DESCRIPTION", cols.item.x + 6, ty, { size: 8, bold: true, color: dark });
      const rightText = (label: string, c: typeof cols.qty) => {
        const w = bold.widthOfTextAtSize(label, 8);
        page.drawText(label, { x: c.x + c.w - w - 6, y: ty, size: 8, font: bold, color: dark });
      };
      rightText("QTY", cols.qty);
      rightText("UNIT", cols.unit);
      rightText("TOTAL", cols.total);
      return yy - 22;
    };

    const ensureSpace = (need: number) => {
      if (y - need < M + 120) {
        // footer & new page
        page = newPage();
        y = H - M;
        y = drawHeader(y);
      }
    };

    y = drawHeader(y);

    for (const item of items) {
      const name = String(item.job_name ?? item.product_name ?? "Item");
      const desc = item.description ? String(item.description) : "";
      const nameLines = wrap(name, bold, 10, cols.item.w - 12);
      const descLines = desc ? wrap(desc, font, 8, cols.item.w - 12) : [];
      const rowH = 10 + nameLines.length * 12 + descLines.length * 10 + 8;

      ensureSpace(rowH + 6);

      const rowTop = y - 4;
      // Name
      let ly = rowTop - 8;
      for (const ln of nameLines) {
        page.drawText(ln, { x: cols.item.x + 6, y: ly, size: 10, font: bold, color: dark });
        ly -= 12;
      }
      for (const ln of descLines) {
        page.drawText(ln, { x: cols.item.x + 6, y: ly, size: 8, font, color: muted });
        ly -= 10;
      }

      // Right columns aligned to first line
      const fy = rowTop - 8;
      const drawRight = (txt: string, c: typeof cols.qty, f = font, s = 10, color = dark) => {
        const w = f.widthOfTextAtSize(txt, s);
        page.drawText(txt, { x: c.x + c.w - w - 6, y: fy, size: s, font: f, color });
      };
      drawRight(String(item.quantity ?? 0), cols.qty);
      drawRight(fmtMoney(Number(item.unit_price), currency), cols.unit);
      drawRight(fmtMoney(Number(item.net_price), currency), cols.total, bold);

      y = ly - 4;
      page.drawLine({
        start: { x: M, y },
        end: { x: W - M, y },
        thickness: 0.5,
        color: border,
      });
    }

    /* ─── Totals ─── */
    ensureSpace(80);
    y -= 16;
    const totalsX = W - M - 220;
    const totalRow = (label: string, value: string, opts: { bold?: boolean; size?: number; color?: RGB } = {}) => {
      const s = opts.size ?? 10;
      const f = opts.bold ? bold : font;
      page.drawText(label, { x: totalsX, y, size: s, font: f, color: opts.color ?? dark });
      const w = f.widthOfTextAtSize(value, s);
      page.drawText(value, { x: W - M - w, y, size: s, font: f, color: opts.color ?? dark });
      y -= s + 6;
    };

    const sub = Number(q.subtotal ?? q.total_amount ?? 0);
    const vat = Number(q.vat_amount ?? 0);
    const total = Number(q.total_amount ?? 0);
    if (vat > 0 || sub !== total) {
      totalRow("Subtotal", fmtMoney(sub, currency));
      if (vat > 0) totalRow("VAT", fmtMoney(vat, currency));
    }
    page.drawRectangle({ x: totalsX, y: y + 2, width: W - M - totalsX, height: 1, color: border });
    y -= 4;
    totalRow("Total", fmtMoney(total, currency), { bold: true, size: 13, color: brand });

    /* ─── Payment block ─── */
    const hasEft = !!from.banking?.eft_enabled && (from.banking?.bank_name || from.banking?.account_number);
    if (hasEft || payOnlineEnabled || from.banking?.payment_instructions) {
      ensureSpace(120);
      y -= 14;
      page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 22, color: brandSoft });
      page.drawText("HOW TO PAY", { x: M + 8, y: y + 5, size: 9, font: bold, color: dark });
      y -= 28;

      if (hasEft && from.banking) {
        page.drawText("EFT / Bank transfer", { x: M, y, size: 10, font: bold, color: dark }); y -= 14;
        const kv: [string, string | undefined][] = [
          ["Bank", from.banking.bank_name],
          ["Account name", from.banking.account_name],
          ["Account number", from.banking.account_number],
          ["Branch code", from.banking.branch_code],
          ["SWIFT", from.banking.swift_code],
          ["Reference", String(q.quote_number ?? "")],
        ];
        for (const [k, v] of kv) {
          if (!v) continue;
          page.drawText(k, { x: M, y, size: 9, font, color: muted });
          page.drawText(String(v), { x: M + 110, y, size: 9, font: bold, color: dark });
          y -= 12;
        }
        y -= 4;
      }

      if (payOnlineEnabled) {
        page.drawText("Pay online", { x: M, y, size: 10, font: bold, color: dark }); y -= 14;
        page.drawText(
          "A secure online payment link is available — please contact us or use the customer portal to pay by card.",
          { x: M, y, size: 9, font, color: muted },
        );
        y -= 14;
      }

      if (from.banking?.payment_instructions) {
        const wrapped = wrap(from.banking.payment_instructions, font, 9, W - 2 * M);
        for (const ln of wrapped) {
          ensureSpace(12);
          page.drawText(ln, { x: M, y, size: 9, font, color: muted });
          y -= 12;
        }
      }
    }

    /* ─── Notes (customer-facing) ─── */
    if (q.notes_customer) {
      ensureSpace(60);
      y -= 12;
      page.drawText("Notes", { x: M, y, size: 10, font: bold, color: dark }); y -= 14;
      for (const ln of wrap(String(q.notes_customer), font, 9, W - 2 * M)) {
        ensureSpace(12);
        page.drawText(ln, { x: M, y, size: 9, font, color: muted });
        y -= 11;
      }
    }

    /* ─── Terms ─── */
    if (termsTxt) {
      ensureSpace(60);
      y -= 14;
      page.drawText("Terms & Conditions", { x: M, y, size: 9, font: bold, color: dark }); y -= 12;
      const paras = termsTxt.split(/\r?\n/);
      for (const p of paras) {
        const lines = wrap(p, font, 8, W - 2 * M);
        for (const ln of lines) {
          ensureSpace(11);
          page.drawText(ln, { x: M, y, size: 8, font, color: muted });
          y -= 10;
        }
      }
    }

    /* ─── Footer on each page ─── */
    const footerText = [
      from.trading_name,
      from.vat_number ? `VAT ${from.vat_number}` : null,
      from.email,
      from.phone,
    ].filter(Boolean).join("  •  ");
    pages.forEach((p, i) => {
      p.drawText(footerText, { x: M, y: 24, size: 7, font, color: muted });
      const pageLbl = `Page ${i + 1} of ${pages.length}`;
      const w = font.widthOfTextAtSize(pageLbl, 7);
      p.drawText(pageLbl, { x: W - M - w, y: 24, size: 7, font, color: muted });
    });

    const bytes = await pdf.save();

    // Upload to storage
    const storagePath = `quotes/${q.tenant_id}/${q.id}.pdf`;
    const { error: upErr } = await supa.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return json({ error: upErr.message }, 500);

    await supa.from("quotes")
      .update({
        pdf_storage_path: storagePath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", q.id);

    const { data: signed, error: signErr } = await supa.storage
      .from("documents")
      .createSignedUrl(storagePath, 300);
    if (signErr || !signed?.signedUrl) {
      return json({ error: signErr?.message ?? "Failed to sign URL" }, 500);
    }

    return json({ success: true, storage_path: storagePath, signed_url: signed.signedUrl });
  } catch (e: any) {
    console.error("quote-pdf error", e);
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
