/**
 * Scope raw CSS text so every rule only applies inside `scopeSelector`.
 *
 * - Regular selectors are prefixed: `.foo` → `.facsimile-header .foo`
 * - `body` / `html` / `:root` selectors become the scope itself
 * - `@font-face`, `@keyframes`, `@charset` blocks pass through unchanged
 * - `@media` / `@supports` blocks are recursively scoped
 * - Universal `*` selector is scoped: `* { }` → `.facsimile-header * { }`
 */
export function scopeCss(raw: string | null | undefined, scopeSelector: string): string {
  if (!raw) return "";

  // We operate on a simplified, regex-based approach that handles the
  // majority of real-world scraped CSS without pulling in a full parser.

  const lines = raw.split("\n");
  const out: string[] = [];
  let insidePassthrough = 0; // depth counter for @font-face / @keyframes
  let insideAt = 0; // depth counter for @media / @supports
  let braceDepth = 0;
  let passthroughDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track passthrough blocks (@font-face, @keyframes, @charset)
    if (insidePassthrough > 0) {
      out.push(line);
      for (const ch of trimmed) {
        if (ch === "{") insidePassthrough++;
        if (ch === "}") insidePassthrough--;
      }
      continue;
    }

    // Detect passthrough at-rules
    if (/^@(font-face|keyframes|charset)\b/i.test(trimmed)) {
      out.push(line);
      insidePassthrough = 1;
      for (const ch of trimmed) {
        if (ch === "{") insidePassthrough++;
        if (ch === "}") insidePassthrough--;
      }
      // If it closed on the same line, reset
      if (insidePassthrough <= 0) insidePassthrough = 0;
      continue;
    }

    // Detect scoped at-rules (@media, @supports) — pass the at-rule line through, scope contents
    if (/^@(media|supports|layer)\b/i.test(trimmed)) {
      out.push(line);
      continue;
    }

    // If line contains a selector (something before {), scope it
    const selectorMatch = trimmed.match(/^([^{}@/]+)\{(.*)$/);
    if (selectorMatch) {
      const rawSelectors = selectorMatch[1];
      const rest = selectorMatch[2];
      const scoped = rawSelectors
        .split(",")
        .map((s) => scopeOneSelector(s.trim(), scopeSelector))
        .join(", ");
      out.push(`${scoped} {${rest}`);
      continue;
    }

    // Everything else (properties, closing braces, comments) passes through
    out.push(line);
  }

  return out.join("\n");
}

function scopeOneSelector(sel: string, scope: string): string {
  if (!sel) return sel;
  // Replace body/html/:root with the scope element itself
  if (/^(body|html|:root)$/i.test(sel)) return scope;
  if (/^(body|html|:root)\s+/i.test(sel)) {
    return sel.replace(/^(body|html|:root)\s+/i, `${scope} `);
  }
  if (/^(body|html|:root)\./i.test(sel)) {
    return sel.replace(/^(body|html|:root)/i, scope);
  }
  return `${scope} ${sel}`;
}
