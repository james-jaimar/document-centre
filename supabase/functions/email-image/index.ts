// Public, app-domain-facing proxy for marketing-email images.
//
// Mirrors the tenant-logo function: keeps Supabase Storage URLs out of
// outbound email HTML by streaming the underlying file from our own
// domain. Path-style URL: /email-image/<storage-path>
//
// In production /email-image/* is rewritten to this function URL by the
// AWS Amplify console. In local/preview the function is also reachable
// at /functions/v1/email-image/<path>.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function notFound(msg = "Not found") {
  return new Response(msg, { status: 404, headers: HEADERS });
}

function contentTypeFromPath(p: string): string {
  const ext = p.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
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

function extractStoragePath(url: URL): string | null {
  // Accept ?p=<path> or path segments after /email-image/
  const q = url.searchParams.get("p");
  if (q) return q.replace(/^\/+/, "").trim();
  const segments = url.pathname.split("/").filter(Boolean);
  // segments: ["functions","v1","email-image", ...rest] OR ["email-image", ...rest]
  const idx = segments.findIndex((s) => s === "email-image");
  if (idx === -1) return null;
  const rest = segments.slice(idx + 1).join("/");
  return rest || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: HEADERS });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: HEADERS });
  }

  const url = new URL(req.url);
  const path = extractStoragePath(url);
  if (!path || path.includes("..")) return notFound("Invalid path");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin.storage.from("email-assets").download(path);
  if (error || !data) return notFound("Image not found");

  return new Response(data, {
    status: 200,
    headers: {
      ...HEADERS,
      "Content-Type": contentTypeFromPath(path),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
