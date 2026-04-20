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
  "health",
];

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized", source: "edge_user_lookup", detail: userError?.message }), {
        status: 401, headers: jsonHeaders,
      });
    }

    // Parse the proxied path and method from the request body
    const body = await req.json();
    const { path, method: forwardMethod, ...payload } = body;

    if (!path || !isAllowedPath(path)) {
      return new Response(
        JSON.stringify({ error: `Invalid path: ${path}`, source: "edge_invalid_path" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const baseUrl = Deno.env.get("DOCUMENT_CENTRE_API_URL")!.replace(/\/+$/, "");
    const fullUrl = `${baseUrl}/${path}`;
    const httpMethod = (forwardMethod || "POST").toUpperCase();

    console.log(`pdf-api: ${httpMethod} ${fullUrl}`);

    const fetchOptions: RequestInit = {
      method: httpMethod,
      headers: { "Content-Type": "application/json" },
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
