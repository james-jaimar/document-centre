const COMPLETE_DOCUMENT = /<!doctype\s+html|<html[\s>]/i;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] ?? char));
}

export function renderAuthoredEmail(bodyHtml: string, preheader?: string | null): string {
  if (COMPLETE_DOCUMENT.test(bodyHtml)) return bodyHtml;
  const hidden = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;">${hidden}${bodyHtml}</body></html>`;
}

export function normalizeBroadcastTokens(html: string): string {
  return html
    .replace(/\{\{\s*(?:unsubscribe_url|unsubscribe_link)\s*\}\}/gi, "{{{RESEND_UNSUBSCRIBE_URL}}}");
}

export function findRelativeImages(html: string): string[] {
  return [...new Set(Array.from(html.matchAll(/<img\b[^>]*\bsrc=["']((?!https?:|data:|cid:|\/\/)[^"']+)["'][^>]*>/gi), (match) => match[1]))];
}