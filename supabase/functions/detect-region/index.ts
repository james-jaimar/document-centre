// Public edge function: detects visitor country from request headers / IP.
// Returns { country_code: string | null, source: 'header' | 'ipapi' | 'none' }
// No auth required. Safe to call from the browser.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// In-memory cache per function instance (small TTL, polite to upstream)
const ipCache = new Map<string, { code: string; ts: number }>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

function getHeaderCountry(req: Request): string | null {
  // Common CDN headers (Cloudflare, Vercel, Netlify, Fly)
  const candidates = [
    req.headers.get("cf-ipcountry"),
    req.headers.get("x-vercel-ip-country"),
    req.headers.get("x-country-code"),
    req.headers.get("fly-client-country"),
  ];
  for (const c of candidates) {
    if (c && c.length === 2 && c !== "XX" && c !== "T1") {
      return c.toUpperCase();
    }
  }
  // Netlify packs geo into x-nf-geo as base64 JSON
  const nfGeo = req.headers.get("x-nf-geo");
  if (nfGeo) {
    try {
      const decoded = JSON.parse(atob(nfGeo));
      if (decoded?.country?.code) return String(decoded.country.code).toUpperCase();
    } catch {
      // ignore
    }
  }
  return null;
}

async function lookupViaIpapi(ip: string): Promise<string | null> {
  const cached = ipCache.get(ip);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.code;

  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      signal: AbortSignal.timeout(2500),
      headers: { "User-Agent": "document-centre/1.0 (region-detect)" },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim().toUpperCase();
    if (text.length === 2 && /^[A-Z]{2}$/.test(text)) {
      ipCache.set(ip, { code: text, ts: Date.now() });
      return text;
    }
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 1) CDN header
  const headerCountry = getHeaderCountry(req);
  if (headerCountry) {
    return new Response(
      JSON.stringify({ country_code: headerCountry, source: "header" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2) IP-based lookup
  const ip = getClientIp(req);
  if (ip) {
    const code = await lookupViaIpapi(ip);
    if (code) {
      return new Response(
        JSON.stringify({ country_code: code, source: "ipapi" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // 3) Nothing — be honest
  return new Response(
    JSON.stringify({ country_code: null, source: "none" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
