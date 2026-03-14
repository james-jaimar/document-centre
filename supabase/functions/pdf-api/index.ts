import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_PATHS = [
  "health",
  "preflight",
  "page-boxes",
  "analyze-pdf",
  "manipulate/rotate",
  "manipulate/crop",
  "manipulate/split",
  "convert/cmyk",
  "imposition/labels",
  "verify-pdf",
  "rasterize",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: jsonHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: jsonHeaders,
      });
    }

    // Parse body
    const body = await req.json();
    const { path, ...payload } = body;

    if (!path || !ALLOWED_PATHS.includes(path)) {
      return new Response(
        JSON.stringify({ error: `Invalid path. Allowed: ${ALLOWED_PATHS.join(", ")}` }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Forward to VPS
    const vpsUrl = Deno.env.get("VPS_PDF_API_URL")!;
    const vpsKey = Deno.env.get("VPS_PDF_API_KEY")!;

    const vpsResponse = await fetch(`${vpsUrl}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": vpsKey,
      },
      body: JSON.stringify(payload),
    });

    // Handle 503 busy
    if (vpsResponse.status === 503) {
      return new Response(
        JSON.stringify({ error: "PDF server is busy. Please retry in a few seconds.", busy: true }),
        { status: 503, headers: jsonHeaders }
      );
    }

    // Forward error responses
    if (!vpsResponse.ok) {
      const errorText = await vpsResponse.text();
      let errorBody: unknown;
      try { errorBody = JSON.parse(errorText); } catch { errorBody = { error: errorText }; }
      return new Response(JSON.stringify(errorBody), {
        status: vpsResponse.status, headers: jsonHeaders,
      });
    }

    // Forward success response as JSON
    const data = await vpsResponse.json();
    return new Response(JSON.stringify(data), {
      status: 200, headers: jsonHeaders,
    });

  } catch (error) {
    console.error("pdf-api proxy error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
