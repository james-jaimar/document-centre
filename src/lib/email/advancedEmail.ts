const COMPLETE_DOCUMENT = /<!doctype\s+html|<html[\s>]/i;
const RELATIVE_IMAGE = /<img\b[^>]*\bsrc=["']((?!https?:|data:|cid:|\/\/)[^"']+)["'][^>]*>/gi;
const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export const EMAIL_TOKENS = [
  "contact_name", "customer_name", "company_name", "branch_name",
  "tenant_name", "tenant_website", "sender_postal_address",
  "activation_link", "action_link", "unsubscribe_url",
  "RESEND_UNSUBSCRIBE_URL",
];

export function isCompleteEmailDocument(html: string): boolean {
  return COMPLETE_DOCUMENT.test(html ?? "");
}

export function renderAuthoredEmail(html: string, preheader = ""): string {
  if (isCompleteEmailDocument(html)) return html;
  const hidden = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;">${hidden}${html}</body></html>`;
}

export function unresolvedEmailImages(html: string): string[] {
  return [...new Set(Array.from((html ?? "").matchAll(RELATIVE_IMAGE), (match) => match[1]))];
}

export function unknownEmailTokens(html: string): string[] {
  const allowed = new Set(EMAIL_TOKENS);
  return [...new Set(Array.from((html ?? "").matchAll(TOKEN), (match) => match[1]).filter((token) => !allowed.has(token)))];
}

export function replaceEmailImage(html: string, oldUrl: string, nextUrl: string, alt?: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src !== oldUrl) return tag;
    let next = tag.replace(/\bsrc=(["'])[^"']+\1/i, `src="${nextUrl}"`);
    if (alt) {
      next = /\balt=["'][^"']*["']/i.test(next)
        ? next.replace(/\balt=(["'])[^"']*\1/i, `alt="${alt.replace(/"/g, "&quot;")}"`)
        : next.replace(/>$/, ` alt="${alt.replace(/"/g, "&quot;")}">`);
    }
    return next;
  });
}

export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}