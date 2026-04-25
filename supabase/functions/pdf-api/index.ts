import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Allowed path prefixes for the Document Centre API
const ALLOWED_PREFIXES = [
  "v1/assets",
  "v1/jobs",
  "v1/operations",
  "v1/ops",
  "health",
];

// ops/* paths require platform_admin
const OPS_PREFIXES = ["v1/ops"];

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

function isOpsPath(path: string): boolean {
  return OPS_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized", source: "edge_no_bearer" }), {
        status: 401, headers: jsonHeaders,
      });
    }

    // Decode JWT directly to avoid round-trip to auth server (which returns
    // "Auth session missing!" for stale-but-valid-format tokens).
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let user: { id: string; email: string };
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (!payload?.sub) throw new Error("missing sub");
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return new Response(
          JSON.stringify({ error: "Unauthorized", source: "edge_token_expired" }),
          { status: 401, headers: jsonHeaders }
        );
      }
      user = { id: payload.sub, email: payload.email ?? "" };
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", source: "edge_token_decode", detail: (e as Error).message }),
        { status: 401, headers: jsonHeaders }
      );
    }

    // Service-role client for role lookups (bypasses RLS, no auth dependency).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Parse the proxied path and method from the request body
    const body = await req.json();
    const { path, method: forwardMethod, tenant_id, app_id, ...payload } = body;

    if (!path || !isAllowedPath(path)) {
      return new Response(
        JSON.stringify({ error: `Invalid path: ${path}`, source: "edge_invalid_path" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Gate ops/* — require platform_admin role
    let actorRole = "user";
    if (isOpsPath(path)) {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const roles = (roleData ?? []).map((r: { role: string }) => r.role);
      if (!roles.includes("platform_admin")) {
        return new Response(
          JSON.stringify({ error: "Forbidden: platform_admin required", source: "edge_ops_forbidden" }),
          { status: 403, headers: jsonHeaders }
        );
      }
      actorRole = "platform_admin";
    }

    const baseUrl = Deno.env.get("DOCUMENT_CENTRE_API_URL")!.replace(/\/+$/, "");
    const fullUrl = `${baseUrl}/${path}`;
    const httpMethod = (forwardMethod || "POST").toUpperCase();

    console.log(`pdf-api: ${httpMethod} ${fullUrl}`);

    // Forward actor + tenant context for audit + JobEvent attribution
    const upstreamHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Ops-Actor-Id": user.id,
      "X-Ops-Actor-Email": user.email ?? "",
      "X-Ops-Actor-Role": actorRole,
    };
    if (tenant_id) upstreamHeaders["X-Ops-Tenant-Id"] = String(tenant_id);
    if (app_id) upstreamHeaders["X-Ops-App-Id"] = String(app_id);

    const fetchOptions: RequestInit = {
      method: httpMethod,
      headers: upstreamHeaders,
    };

    // Only include body for methods that support it
    if (httpMethod !== "GET" && httpMethod !== "HEAD" && Object.keys(payload).length > 0) {
      fetchOptions.body = JSON.stringify(payload);
    }

    const upstream = await fetch(fullUrl, fetchOptions);

    console.log(`pdf-api: upstream responded ${upstream.status} ${upstream.statusText} for ${httpMethod} ${path}`);

    // Forward the response
    const responseText = await upstream.text();
    if (upstream.status >= 400) {
      console.log(`pdf-api: upstream error body: ${responseText.slice(0, 500)}`);
    }
    return new Response(responseText, {
      status: upstream.status,
      headers: jsonHeaders,
    });

  } catch (error) {
    console.error("pdf-api proxy error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
