// Shared branded HTML shell for Document Centre platform emails.
// Used by platform-level transactional emails (contact form, marketing,
// and any send not tied to a specific tenant's branding).
//
// Tenant-scoped emails (auth resets, order updates) should continue to use
// the tenant's own brand colours and logo — see request-password-reset and
// send-order-email for those patterns.

export const DC_BRAND = {
  name: "Document Centre",
  fromEmail: "hello@document-centre.com",
  fromName: "Document Centre",
  replyTo: "hello@document-centre.com",
  primary: "#0a2358",       // dc-navy
  accent: "#2b6cb0",        // dc-blue
  green: "#1f9d55",         // dc-green
  bg: "#f5f7fb",
  cardBg: "#ffffff",
  border: "#e6ecf3",
  textBody: "#374151",
  textMuted: "#6b7280",
  siteUrl: "https://document-centre.jaimar.dev",
  privacyUrl: "https://document-centre.jaimar.dev/privacy",
  termsUrl: "https://document-centre.jaimar.dev/terms",
} as const;

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

export interface BrandedShellOptions {
  preheader?: string;       // Hidden inbox preview text
  heading: string;
  bodyHtml: string;         // Already-escaped HTML for the main body
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;      // Small text below the body
}

/**
 * Render a Document Centre branded HTML email.
 * The bodyHtml is inserted as-is — callers must escape user content themselves.
 */
export function renderBrandedEmail(opts: BrandedShellOptions): string {
  const {
    preheader = "",
    heading,
    bodyHtml,
    ctaLabel,
    ctaUrl,
    footerNote,
  } = opts;

  const ctaBlock = ctaLabel && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
         <tr><td>
           <a href="${escapeHtml(ctaUrl)}"
              style="display:inline-block;background:${DC_BRAND.accent};color:#ffffff;
                     text-decoration:none;padding:13px 28px;border-radius:8px;
                     font-weight:600;font-size:15px;font-family:Inter,Arial,sans-serif;">
             ${escapeHtml(ctaLabel)}
           </a>
         </td></tr>
       </table>`
    : "";

  const footerBlock = footerNote
    ? `<p style="font-size:13px;color:${DC_BRAND.textMuted};margin:24px 0 0;line-height:1.6;">${footerNote}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${DC_BRAND.bg};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${DC_BRAND.textBody};">
  <div style="display:none;font-size:1px;color:${DC_BRAND.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${DC_BRAND.bg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:${DC_BRAND.cardBg};
                    border-radius:14px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(10,35,88,0.06);
                    border:1px solid ${DC_BRAND.border};">
        <!-- Header bar -->
        <tr>
          <td style="background:linear-gradient(135deg,${DC_BRAND.primary} 0%,#051640 100%);padding:22px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;font-family:Inter,Arial,sans-serif;">
                  ${escapeHtml(DC_BRAND.name)}
                </td>
                <td align="right" style="color:rgba(255,255,255,0.75);font-size:12px;font-family:Inter,Arial,sans-serif;">
                  Web-to-Print, made easy
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 32px 32px;">
            <h1 style="font-size:22px;font-weight:700;color:${DC_BRAND.primary};margin:0 0 18px;line-height:1.3;font-family:Inter,Arial,sans-serif;">
              ${escapeHtml(heading)}
            </h1>
            <div style="font-size:15px;line-height:1.65;color:${DC_BRAND.textBody};font-family:Inter,Arial,sans-serif;">
              ${bodyHtml}
            </div>
            ${ctaBlock}
            ${footerBlock}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#fafbfd;padding:22px 32px;border-top:1px solid ${DC_BRAND.border};">
            <p style="margin:0 0 6px;font-size:12px;color:${DC_BRAND.textMuted};font-family:Inter,Arial,sans-serif;">
              © ${new Date().getFullYear()} ${escapeHtml(DC_BRAND.name)} · Web-to-Print software for copy shops &amp; small printers
            </p>
            <p style="margin:0;font-size:12px;color:${DC_BRAND.textMuted};font-family:Inter,Arial,sans-serif;">
              <a href="${DC_BRAND.siteUrl}" style="color:${DC_BRAND.accent};text-decoration:none;">document-centre.com</a>
              &nbsp;·&nbsp;
              <a href="${DC_BRAND.privacyUrl}" style="color:${DC_BRAND.accent};text-decoration:none;">Privacy</a>
              &nbsp;·&nbsp;
              <a href="${DC_BRAND.termsUrl}" style="color:${DC_BRAND.accent};text-decoration:none;">Terms</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Plain-text fallback derived from the same content. */
export function renderBrandedText(opts: { heading: string; bodyText: string; ctaLabel?: string; ctaUrl?: string; footerNote?: string }): string {
  const cta = opts.ctaLabel && opts.ctaUrl ? `\n\n${opts.ctaLabel}: ${opts.ctaUrl}` : "";
  const footer = opts.footerNote ? `\n\n${opts.footerNote}` : "";
  return `${opts.heading}\n\n${opts.bodyText}${cta}${footer}\n\n— ${DC_BRAND.name}\n${DC_BRAND.siteUrl}`;
}
