import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

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
    // Neutralise links — replace href with "#" so they don't navigate away
    if (element.tagName === "A") {
      const href = element.getAttribute("href") || "";
      if (href.startsWith("javascript:")) {
        element.removeAttribute("href");
      } else {
        // Keep the link visually but make it inert
        element.setAttribute("href", "#");
        element.setAttribute("data-original-href", href);
        // Prevent click via inline attribute (will also be handled client-side)
        element.setAttribute("onclick", "return false;");
      }
    }
  }

  return doc.body?.innerHTML ?? "";
}

/** Extract the first matching element's outerHTML from a full HTML document */
function extractSection(html: string, selectors: string[]): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return null;

  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      return (el as Element).outerHTML;
    }
  }
  return null;
}

/** Extract inline and linked stylesheet content hints from <head> */
function extractHeadStyles(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return "";
  const styles: string[] = [];
  for (const el of doc.querySelectorAll("style")) {
    styles.push((el as Element).textContent || "");
  }
  return styles.join("\n");
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

    // Choose formats based on mode
    const formats: string[] = ["branding", "screenshot"];
    if (mode === "facsimile" || mode === "both") {
      formats.push("html");
    }
    if (mode === "branding" || mode === "both") {
      formats.push("markdown");
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
        waitFor: 3000,
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
      scrapeData?.data?.html ?? scrapeData?.html ?? null;

    // Build facsimile data if HTML is available
    let facsimile: {
      header_html: string | null;
      footer_html: string | null;
      head_styles: string | null;
    } | null = null;

    if (rawHtml && (mode === "facsimile" || mode === "both")) {
      const headerSelectors = ["header", "nav", "[role='banner']", ".header", "#header", ".navbar", ".nav-bar", ".site-header"];
      const footerSelectors = ["footer", "[role='contentinfo']", ".footer", "#footer", ".site-footer"];

      const rawHeader = extractSection(rawHtml, headerSelectors);
      const rawFooter = extractSection(rawHtml, footerSelectors);
      const headStyles = extractHeadStyles(rawHtml);

      facsimile = {
        header_html: rawHeader ? sanitiseHtml(rawHeader, url) : null,
        footer_html: rawFooter ? sanitiseHtml(rawFooter, url) : null,
        head_styles: headStyles ? headStyles.substring(0, 50000) : null,
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
