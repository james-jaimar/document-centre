// Gatekeeper in front of the Document Centre print server.
// Copy to: supabase/functions/pdf-api/index.ts
//
// The print server has no key check of its own — it trusts whatever reaches
// it. This function is the only thing standing in front of it, so keep the
// login check and the path allowlist intact.
//
// Required secrets: DOCUMENT_CENTRE_API_URL, OPS_APP_ID

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Paths this app may reach. `v1/ops` (platform operations) is intentionally
// absent — that surface belongs to Document Centre only.
const ALLOWED_PREFIXES = [
  "v1/assets",
  "v1/jobs",
  "v1/operations",
  "health",
];

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

function requireApiBase(): string {
  const raw = (Deno.env.get("DOCUMENT_CENTRE_API_URL") ?? "").replace(/\/+$/, "");
  if (!raw) throw new Error("DOCUMENT_CENTRE_API_URL missing");
  const host = new URL(raw).hostname;
  if (host === "api.document-centre.com" || host.endsWith(".run.app")) return raw;
  throw new Error(`DOCUMENT_CENTRE_API_URL must point at the print server, got ${host}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", source: "edge_no_bearer" }),
        { status: 401, headers: jsonHeaders },
      );
    }

    // Decode the JWT locally: avoids a round-trip to the auth server, which
    // returns "Auth session missing!" for stale-but-well-formed tokens.
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let user: { id: string; email: string };
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (!payload?.sub) throw new Error("missing sub");
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return new Response(
          JSON.stringify({ error: "Unauthorized", source: "edge_token_expired" }),
          { status: 401, headers: jsonHeaders },
        );
      }
      user = { id: payload.sub, email: payload.email ?? "" };
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", source: "edge_token_decode", detail: (e as Error).message }),
        { status: 401, headers: jsonHeaders },
      );
    }

    const body = await req.json();
    const { path, method: forwardMethod, tenant_id, ...payload } = body;

    if (!path || !isAllowedPath(path)) {
      return new Response(
        JSON.stringify({ error: `Invalid path: ${path}`, source: "edge_invalid_path" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const fullUrl = `${requireApiBase()}/${path}`;
    const httpMethod = (forwardMethod || "POST").toUpperCase();

    const upstreamHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Ops-Actor-Id": user.id,
      "X-Ops-Actor-Email": user.email ?? "",
      "X-Ops-Actor-Role": "user",
      // Tags every job with the calling app so the shared platform screens
      // can tell workloads apart. Do not leave this blank.
      "X-Ops-App-Id": Deno.env.get("OPS_APP_ID") ?? "unknown-app",
    };
    if (tenant_id) upstreamHeaders["X-Ops-Tenant-Id"] = String(tenant_id);

    const fetchOptions: RequestInit = { method: httpMethod, headers: upstreamHeaders };
    if (httpMethod !== "GET" && httpMethod !== "HEAD" && Object.keys(payload).length > 0) {
      fetchOptions.body = JSON.stringify(payload);
    }

    const upstream = await fetch(fullUrl, fetchOptions);
    const responseText = await upstream.text();

    if (upstream.status >= 400) {
      console.log(`pdf-api: upstream ${upstream.status}: ${responseText.slice(0, 1000)}`);
      const contentType = upstream.headers.get("content-type") ?? "";
      const looksLikeJson = contentType.includes("application/json") ||
        responseText.trim().startsWith("{") || responseText.trim().startsWith("[");
      if (!looksLikeJson) {
        // Python tracebacks come back as text/plain; the first line is the
        // actionable part. Never show the whole stack to a user.
        const firstLine = responseText.split("\n").find((l) => l.trim().length > 0) ?? "PDF service error";
        const summary = firstLine.length > 240 ? firstLine.slice(0, 237) + "..." : firstLine;
        return new Response(
          JSON.stringify({
            error: `PDF service error (${upstream.status}): ${summary}`,
            source: "edge_upstream_error",
            upstream_status: upstream.status,
          }),
          { status: upstream.status, headers: jsonHeaders },
        );
      }
    }

    return new Response(responseText, { status: upstream.status, headers: jsonHeaders });
  } catch (error) {
    console.error("pdf-api proxy error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
