// Minimal HTML → plain-text converter used to generate a text/plain
// alternative when an email template only has HTML body. Goal is not
// perfect Markdown, but a clean snippet that:
//   1. Lets Outlook/Gmail show readable preview text (not raw URLs)
//   2. Provides a usable text body for plain-text mail clients
//
// Deliberately tiny — no DOM, no deps. Strips tags, decodes a few common
// entities, collapses whitespace, and preserves anchor URLs as "label (url)".

export function htmlToText(html: string): string {
  if (!html) return "";
  let s = String(html);

  // Drop <style> / <script> blocks entirely.
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  // Hide blocks that are clearly preheader / hidden spacers.
  s = s.replace(/<div[^>]*style="[^"]*display\s*:\s*none[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");

  // Anchor → "label (url)" when label differs from url.
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
    const text = stripTags(label).trim();
    if (!text) return href;
    if (text === href) return href;
    return `${text} (${href})`;
  });

  // <br> / </p> / </div> / <li> → newline.
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/\s*(p|div|tr|h[1-6]|li)\s*>/gi, "\n");
  s = s.replace(/<\s*li[^>]*>/gi, "• ");

  // Strip remaining tags.
  s = stripTags(s);

  // Decode common entities.
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)));

  // Collapse whitespace.
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/^[ \t]+|[ \t]+$/gm, "");
  return s.trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

/** First non-empty line of text, truncated for inbox preview text. */
export function deriveSnippet(text: string, max = 140): string {
  const firstLine = (text.split(/\n+/).find((l) => l.trim()) ?? "").trim();
  if (firstLine.length <= max) return firstLine;
  return firstLine.slice(0, max - 1).trimEnd() + "…";
}
