// Public contact-form submission endpoint.
// - Accepts an unauthenticated POST from the marketing site.
// - Validates input, then runs bot/spam defences:
//     honeypot -> timing trap -> Turnstile -> IP/email rate limits -> heuristics
// - Stores every submission in public.contact_submissions (spam rows flagged).
// - Emails are ONLY sent for clean submissions:
//     1. Internal notification → hello@document-centre.com
//     2. Branded auto-reply    → the visitor
//   Spam never triggers the auto-reply, which is what stopped the bounce-back
//   backscatter from forged sender addresses.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { enqueueEmail } from "../_shared/email-queue.ts";
import { kickEmailWorker } from "../_shared/email-kick.ts";
import { DC_BRAND, escapeHtml, renderBrandedEmail, renderBrandedText } from "../_shared/branded-shell.ts";
import { scoreSubmission, verifyTurnstile } from "../_shared/contact-spam.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limits, per source.
const IP_LIMIT_HOUR = 3;
const IP_LIMIT_DAY = 10;
const EMAIL_LIMIT_DAY = 3;

interface ContactBody {
  name?: string;
  email?: string;
  company?: string;
  phone?: string;
  subject?: string;
  message?: string;
  source?: string;
  /** Hidden honeypot field — humans leave it empty. */
  website?: string;
  /** ms between form render and submit. */
  elapsed_ms?: number;
  turnstile_token?: string;
}

function clean(v: unknown, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br/>");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Bots get the same success shape a human gets — never tell them why they failed.
const SILENT_OK = { success: true, id: null as string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as ContactBody;

    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const company = clean(body.company, 200);
    const phone = clean(body.phone, 60);
    const subject = clean(body.subject, 200);
    const message = clean(body.message, 4000);
    const source = clean(body.source ?? "marketing_landing", 80);
    const honeypot = clean(body.website, 200);
    const elapsedMs = typeof body.elapsed_ms === "number" ? body.elapsed_ms : null;

    // Required field validation
    if (!name || name.length < 2) {
      return json({ error: "Please enter your name" }, 400);
    }
    if (!email || !isEmail(email)) {
      return json({ error: "Please enter a valid email address" }, 400);
    }
    if (!message || message.length < 10) {
      return json({ error: "Please share a few details about your enquiry" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    // Capture light request metadata for spam triage
    const ipHeader =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const userAgent = req.headers.get("user-agent") ?? null;

    // ---- Bot defences -----------------------------------------------------
    const verdict = scoreSubmission({
      name, email, company, phone, subject, message, honeypot, elapsedMs,
    });
    const reasons = [...verdict.reasons];
    let score = verdict.score;

    // Honeypot filled: discard entirely, don't even store. Nothing of value.
    if (honeypot) {
      console.log("submit-contact: honeypot triggered, discarding");
      return json(SILENT_OK);
    }

    // Cloudflare Turnstile (skipped when TURNSTILE_SECRET_KEY isn't set).
    const turnstileOk = await verifyTurnstile(body.turnstile_token, ipHeader);
    if (turnstileOk === false) {
      score += 6;
      reasons.push("turnstile_failed");
    }

    // Rate limits, per IP and per email address.
    const nowMs = Date.now();
    const hourAgo = new Date(nowMs - 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

    if (ipHeader) {
      const [{ count: ipHour }, { count: ipDay }] = await Promise.all([
        admin.from("contact_submissions").select("id", { count: "exact", head: true })
          .eq("ip_address", ipHeader).gte("created_at", hourAgo),
        admin.from("contact_submissions").select("id", { count: "exact", head: true })
          .eq("ip_address", ipHeader).gte("created_at", dayAgo),
      ]);
      if ((ipHour ?? 0) >= IP_LIMIT_HOUR) { score += 5; reasons.push("rate_limit_ip_hour"); }
      else if ((ipDay ?? 0) >= IP_LIMIT_DAY) { score += 5; reasons.push("rate_limit_ip_day"); }
    }

    const { count: emailDay } = await admin
      .from("contact_submissions").select("id", { count: "exact", head: true })
      .eq("email", email).gte("created_at", dayAgo);
    if ((emailDay ?? 0) >= EMAIL_LIMIT_DAY) { score += 5; reasons.push("rate_limit_email_day"); }

    const isSpam = score >= 3;
    // -----------------------------------------------------------------------

    const { data: inserted, error: insertErr } = await admin
      .from("contact_submissions")
      .insert({
        name,
        email,
        company: company || null,
        phone: phone || null,
        subject: subject || null,
        message,
        source,
        ip_address: ipHeader,
        user_agent: userAgent,
        status: isSpam ? "spam" : "new",
        spam_score: score,
        spam_reasons: reasons,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("submit-contact insert error:", insertErr.message);
      return json({ error: "Could not save your message. Please try again." }, 500);
    }

    const submissionId = inserted.id as string;

    if (isSpam) {
      // Stored and flagged, but NO email leaves the system — this is what
      // prevents auto-replies bouncing off forged third-party addresses.
      console.log(
        `submit-contact: flagged as spam (score ${score}) [${reasons.join(",")}] id=${submissionId}`,
      );
      return json({ success: true, id: submissionId });
    }

    // 1. Internal notification → hello@
    const internalBodyHtml = `
      <p style="margin:0 0 14px;">A new enquiry just came in via the website.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:6px 0 18px;">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px;">Name</td><td style="padding:8px 0;font-size:14px;color:#111827;font-weight:500;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Email</td><td style="padding:8px 0;font-size:14px;color:#111827;"><a href="mailto:${escapeHtml(email)}" style="color:${DC_BRAND.accent};text-decoration:none;">${escapeHtml(email)}</a></td></tr>
        ${company ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Company</td><td style="padding:8px 0;font-size:14px;color:#111827;">${escapeHtml(company)}</td></tr>` : ""}
        ${phone ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Phone</td><td style="padding:8px 0;font-size:14px;color:#111827;">${escapeHtml(phone)}</td></tr>` : ""}
        ${subject ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Subject</td><td style="padding:8px 0;font-size:14px;color:#111827;">${escapeHtml(subject)}</td></tr>` : ""}
      </table>
      <div style="background:#f9fafb;border-left:3px solid ${DC_BRAND.accent};padding:14px 16px;border-radius:6px;font-size:14px;line-height:1.6;color:#1f2937;">
        ${nl2br(message)}
      </div>
    `;
    const internalHtml = renderBrandedEmail({
      preheader: `New enquiry from ${name}`,
      heading: "📬 New website enquiry",
      bodyHtml: internalBodyHtml,
      ctaLabel: "Reply now",
      ctaUrl: `mailto:${email}?subject=${encodeURIComponent("Re: " + (subject || "Your Document Centre enquiry"))}`,
      footerNote: `Submission ID: ${submissionId}`,
    });
    const internalText = renderBrandedText({
      heading: "New website enquiry",
      bodyText: `${name} <${email}>${company ? `\nCompany: ${company}` : ""}${phone ? `\nPhone: ${phone}` : ""}${subject ? `\nSubject: ${subject}` : ""}\n\n${message}`,
      footerNote: `Submission ID: ${submissionId}`,
    });

    await enqueueEmail(admin, {
      to: DC_BRAND.fromEmail,
      from_name: DC_BRAND.fromName,
      from_email: DC_BRAND.fromEmail,
      reply_to: email,
      subject: subject ? `Enquiry: ${subject}` : `New enquiry from ${name}`,
      html: internalHtml,
      text: internalText,
      category: "transactional",
      related_type: "contact_submission",
      related_id: submissionId,
      metadata: { kind: "contact_internal", source },
    });

    // 2. Branded auto-reply → visitor
    const replyBodyHtml = `
      <p style="margin:0 0 14px;">Hi ${escapeHtml(name.split(" ")[0])},</p>
      <p style="margin:0 0 14px;">
        Thanks for reaching out to <strong>${escapeHtml(DC_BRAND.name)}</strong> — we've received your enquiry and a real human will get back to you shortly (usually within one business day).
      </p>
      <p style="margin:0 0 14px;">For your records, here's what you sent us:</p>
      <div style="background:#f9fafb;border-left:3px solid ${DC_BRAND.accent};padding:14px 16px;border-radius:6px;font-size:14px;line-height:1.6;color:#1f2937;margin:0 0 18px;">
        ${nl2br(message)}
      </div>
      <p style="margin:0 0 14px;">
        In the meantime, feel free to explore the platform or take a no-signup test drive.
      </p>
    `;
    const replyHtml = renderBrandedEmail({
      preheader: `Thanks ${name.split(" ")[0]} — we'll be in touch shortly.`,
      heading: "Thanks — we've got your message",
      bodyHtml: replyBodyHtml,
      ctaLabel: "Try Document Centre",
      ctaUrl: `${DC_BRAND.siteUrl}/try`,
      footerNote: "If you didn't submit this enquiry, you can safely ignore this email.",
    });
    const replyText = renderBrandedText({
      heading: "Thanks — we've got your message",
      bodyText: `Hi ${name.split(" ")[0]},\n\nThanks for reaching out to ${DC_BRAND.name}. We've received your enquiry and will get back to you shortly (usually within one business day).\n\nYour message:\n${message}`,
      ctaLabel: "Try Document Centre",
      ctaUrl: `${DC_BRAND.siteUrl}/try`,
    });

    await enqueueEmail(admin, {
      to: email,
      from_name: DC_BRAND.fromName,
      from_email: DC_BRAND.fromEmail,
      reply_to: DC_BRAND.replyTo,
      subject: `Thanks for contacting ${DC_BRAND.name}`,
      html: replyHtml,
      text: replyText,
      category: "transactional",
      related_type: "contact_submission",
      related_id: submissionId,
      metadata: { kind: "contact_autoreply", source },
    });

    // Kick the Cloud Run email worker for prompt delivery.
    kickEmailWorker();

    return json({ success: true, id: submissionId });
  } catch (e) {
    console.error("submit-contact error:", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
