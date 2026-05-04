import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

/** Resolve a relative URL to absolute based on the page origin */
function resolveUrl(relative: string, baseUrl: string): string {
  try {
    return new URL(relative, baseUrl).href;
  } catch {
    return relative;
  }
}

/** Make all src, href, srcset, action, poster, data attributes absolute */
function resolveAllUrls(html: string, baseUrl: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return html;

  const attrs = ["src", "href", "action", "poster", "data"];
  for (const el of doc.querySelectorAll("*")) {
    const element = el as Element;
    for (const attr of attrs) {
      const val = element.getAttribute(attr);
      if (val && !val.startsWith("data:") && !val.startsWith("javascript:") && !val.startsWith("#") && !val.startsWith("mailto:")) {
        element.setAttribute(attr, resolveUrl(val, baseUrl));
      }
    }
    // Handle srcset
    const srcset = element.getAttribute("srcset");
    if (srcset) {
      const resolved = srcset.split(",").map(part => {
        const [url, ...rest] = part.trim().split(/\s+/);
        return [resolveUrl(url, baseUrl), ...rest].join(" ");
      }).join(", ");
      element.setAttribute("srcset", resolved);
    }
    // Handle style with url()
    const style = element.getAttribute("style");
    if (style && style.includes("url(")) {
      const resolved = style.replace(/url\(['"]?([^'")]+)['"]?\)/g, (_match, url) => {
        return `url('${resolveUrl(url, baseUrl)}')`;
      });
      element.setAttribute("style", resolved);
    }
  }
  return doc.body?.innerHTML ?? html;
}

/** Remove all <script>, <iframe>, <form>, <noscript> tags and on* attributes */
function sanitiseHtml(html: string, originUrl: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return "";

  // Remove dangerous elements
  for (const tag of ["script", "iframe", "form", "noscript", "object", "embed", "applet"]) {
    for (const el of [...doc.querySelectorAll(tag)]) {
      el.remove();
    }
  }

  // Remove event handlers and javascript: hrefs
  const allEls = doc.querySelectorAll("*");
  for (const el of allEls) {
    const element = el as Element;
    const attrs = [...element.attributes];
    for (const attr of attrs) {
      if (attr.name.startsWith("on")) {
        element.removeAttribute(attr.name);
      }
    }
    // Neutralise links
    if (element.tagName === "A") {
      const href = element.getAttribute("href") || "";
      if (href.startsWith("javascript:")) {
        element.removeAttribute("href");
      } else {
        element.setAttribute("href", "#");
        element.setAttribute("data-original-href", href);
        element.setAttribute("onclick", "return false;");
      }
    }
  }

  return doc.body?.innerHTML ?? "";
}

/** Extract ALL matching elements and return the LONGEST one (most content) */
function extractBestSection(html: string, selectors: string[]): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return null;

  let best: string | null = null;
  let bestLen = 0;

  for (const sel of selectors) {
    try {
      const els = doc.querySelectorAll(sel);
      for (const el of els) {
        const outer = (el as Element).outerHTML;
        if (outer.length > bestLen) {
          best = outer;
          bestLen = outer.length;
        }
      }
    } catch {
      // Skip invalid selectors
    }
  }
  return best;
}

/** Extract inline <style> content from <head> */
function extractHeadStyles(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return "";
  const styles: string[] = [];
  for (const el of doc.querySelectorAll("style")) {
    styles.push((el as Element).textContent || "");
  }
  return styles.join("\n");
}

/** Extract external stylesheet URLs from <link rel="stylesheet"> */
function extractLinkedStylesheetUrls(html: string, baseUrl: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];
  const urls: string[] = [];
  for (const el of doc.querySelectorAll('link[rel="stylesheet"], link[rel="Stylesheet"]')) {
    const href = (el as Element).getAttribute("href");
    if (href) {
      urls.push(resolveUrl(href, baseUrl));
    }
  }
  return urls;
}

/** Fetch external CSS files and concatenate (with size limit) */
async function fetchExternalCss(urls: string[], maxTotalBytes = 200_000): Promise<string> {
  const parts: string[] = [];
  let totalLen = 0;

  for (const url of urls.slice(0, 10)) { // max 10 stylesheets
    try {
      const res = await fetch(url, { 
        headers: { "Accept": "text/css,*/*" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (totalLen + text.length > maxTotalBytes) break;
      parts.push(`/* Source: ${url} */\n${text}`);
      totalLen += text.length;
    } catch {
      // Skip failed fetches
    }
  }
  return parts.join("\n\n");
}

/** Resolve url() references inside CSS to absolute URLs */
function resolveCssUrls(css: string, baseUrl: string): string {
  return css.replace(/url\(['"]?([^'")]+)['"]?\)/g, (_match, url) => {
    if (url.startsWith("data:") || url.startsWith("#")) return _match;
    return `url('${resolveUrl(url, baseUrl)}')`;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2.57.4"
    );
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const url = body?.url;
    const mode = body?.mode ?? "branding"; // "branding" | "facsimile" | "both"

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing required field: url" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Choose formats based on mode — always include rawHtml for facsimile
    const formats: string[] = ["screenshot"];
    if (mode === "facsimile" || mode === "both") {
      formats.push("rawHtml");
    }
    if (mode === "branding" || mode === "both") {
      formats.push("branding", "markdown");
    }

    // Scrape with Firecrawl
    const scrapeRes = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats,
        onlyMainContent: false,
        waitFor: 5000,
      }),
    });

    const scrapeData = await scrapeRes.json();

    if (!scrapeRes.ok) {
      const errMsg =
        scrapeData?.error || `Firecrawl error: ${scrapeRes.status}`;
      return new Response(JSON.stringify({ error: errMsg }), {
        status: scrapeRes.status === 402 ? 402 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract relevant branding info
    const branding = scrapeData?.data?.branding ?? scrapeData?.branding ?? null;
    const screenshot =
      scrapeData?.data?.screenshot ?? scrapeData?.screenshot ?? null;
    const markdown =
      scrapeData?.data?.markdown ?? scrapeData?.markdown ?? null;
    const metadata =
      scrapeData?.data?.metadata ?? scrapeData?.metadata ?? null;
    const rawHtml =
      scrapeData?.data?.rawHtml ?? scrapeData?.rawHtml ??
      scrapeData?.data?.html ?? scrapeData?.html ?? null;

    // Build facsimile data if HTML is available
    let facsimile: {
      header_html: string | null;
      footer_html: string | null;
      head_styles: string | null;
      header_length: number;
      footer_length: number;
      external_css_count: number;
    } | null = null;

    if (rawHtml && (mode === "facsimile" || mode === "both")) {
      const headerSelectors = [
        "header", 
        "nav", 
        "[role='banner']", 
        ".header", 
        "#header", 
        ".navbar", 
        ".nav-bar", 
        ".site-header",
        ".main-header",
        "#main-header",
        ".top-bar",
        "#masthead",
        ".masthead",
      ];
      const footerSelectors = [
        "footer", 
        "[role='contentinfo']", 
        ".footer", 
        "#footer", 
        ".site-footer",
        ".main-footer",
        "#main-footer",
      ];

      // Pick the best (largest) match
      const rawHeader = extractBestSection(rawHtml, headerSelectors);
      const rawFooter = extractBestSection(rawHtml, footerSelectors);
      
      // Get inline styles from head
      const inlineStyles = extractHeadStyles(rawHtml);
      
      // Get external stylesheets and fetch them
      const externalCssUrls = extractLinkedStylesheetUrls(rawHtml, url);
      const externalCss = await fetchExternalCss(externalCssUrls);
      
      // Combine all CSS and resolve URLs
      let combinedCss = [inlineStyles, externalCss].filter(Boolean).join("\n\n");
      if (combinedCss) {
        combinedCss = resolveCssUrls(combinedCss, url);
      }

      // Process header/footer: sanitise then resolve URLs
      const processedHeader = rawHeader 
        ? resolveAllUrls(sanitiseHtml(rawHeader, url), url) 
        : null;
      const processedFooter = rawFooter 
        ? resolveAllUrls(sanitiseHtml(rawFooter, url), url) 
        : null;

      facsimile = {
        header_html: processedHeader,
        footer_html: processedFooter,
        head_styles: combinedCss ? combinedCss.substring(0, 300_000) : null,
        header_length: processedHeader?.length ?? 0,
        footer_length: processedFooter?.length ?? 0,
        external_css_count: externalCssUrls.length,
      };
    }

    // Build a normalized response
    const result: Record<string, unknown> = {
      success: true,
      branding: branding
        ? {
            logo: branding.logo ?? branding.images?.logo ?? null,
            colors: branding.colors ?? {},
            fonts: branding.fonts ?? [],
            typography: branding.typography ?? {},
            colorScheme: branding.colorScheme ?? null,
          }
        : null,
      screenshot,
      title: metadata?.title ?? null,
      description: metadata?.description ?? null,
      markdown: markdown ? markdown.substring(0, 2000) : null,
    };

    if (facsimile) {
      result.facsimile = facsimile;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("scrape-branding error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
