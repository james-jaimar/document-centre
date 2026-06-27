// Public, app-domain-facing proxy for tenant logos used inside emails.
//
// Why this exists: embedding raw Supabase Storage URLs in outbound emails
// leaks the project's *.supabase.co host into recipients' inboxes (visible
// in preview snippets, "View source", and forwarded copies). Routing the
// logo through our own app domain keeps URLs branded and lets us swap the
// underlying storage location without re-sending email.
//
// Request:   GET /logo/<tenant_id>[.png|.jpg|...]
// Response:  the binary contents of brandMap.email_logo_url (preferred) or
//            brandMap.logo_url, with long cache headers.
//
// In production the path /logo/* is rewritten to this function URL by the
// AWS Amplify console (one rule per app domain). For local/preview use the
// function is also reachable directly at /functions/v1/tenant-logo/<id>.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function notFound(msg = "Not found") {
  return new Response(msg, { status: 404, headers: HEADERS });
}

function extractTenantId(url: URL): string | null {
  // Accept either path-style /tenant-logo/<id>[.ext] or query ?t=<id>
  const q = url.searchParams.get("t");
  if (q) return q.trim();
  const segments = url.pathname.split("/").filter(Boolean);
  // segments: ["functions", "v1", "tenant-logo", "<id>.png"] OR ["logo", "<id>.png"]
  const last = segments[segments.length - 1];
  if (!last) return null;
  return last.replace(/\.(png|jpe?g|gif|webp|svg)$/i, "").trim();
}

function contentTypeFromExt(url: string): string {
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":  return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif":  return "image/gif";
    case "webp": return "image/webp";
    case "svg":  return "image/svg+xml";
    default:     return "application/octet-stream";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: HEADERS });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: HEADERS });
  }

  const url = new URL(req.url);
  const tenantId = extractTenantId(url);
  if (!tenantId || !/^[0-9a-f-]{10,}$/i.test(tenantId)) return notFound("Invalid tenant id");

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supaUrl, serviceKey);

  const { data: rows, error } = await admin
    .from("tenant_settings")
    .select("setting_key, setting_value")
    .eq("tenant_id", tenantId)
    .eq("category", "branding")
    .in("setting_key", ["email_logo_url", "logo_url"]);
  if (error) return notFound("Branding lookup failed");

  const map: Record<string, string> = {};
  for (const r of rows ?? []) {
    if (typeof r.setting_value === "string") map[r.setting_key] = r.setting_value;
  }
  const targetUrl = map.email_logo_url || map.logo_url;
  if (!targetUrl) return notFound("No logo configured");

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, { method: req.method, redirect: "follow" });
  } catch (e) {
    console.error("tenant-logo fetch failed", { tenantId, targetUrl, err: (e as Error).message });
    return notFound("Logo unreachable");
  }
  if (!upstream.ok) {
    return new Response(`Upstream ${upstream.status}`, { status: 502, headers: HEADERS });
  }

  const contentType = upstream.headers.get("content-type") || contentTypeFromExt(targetUrl);
  const headers: Record<string, string> = {
    ...HEADERS,
    "Content-Type": contentType,
    // 24h public cache + 7d stale-while-revalidate — logos rarely change and
    // many email clients re-fetch on every open.
    "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800, immutable",
    "X-Tenant-Logo": "1",
  };
  const len = upstream.headers.get("content-length");
  if (len) headers["Content-Length"] = len;

  return new Response(upstream.body, { status: 200, headers });
});
