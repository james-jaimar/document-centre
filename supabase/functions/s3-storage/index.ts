import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const GATEWAY_URL = "https://connector-gateway.lovable.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
  if (!AWS_S3_API_KEY) return json({ error: "AWS_S3_API_KEY not configured" }, 500);

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: claimsData, error: claimsErr } = await supabase.auth.getUser();
  if (claimsErr || !claimsData?.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "sign-upload") {
      const { object_path, content_type } = body;
      if (!object_path) return json({ error: "object_path required" }, 400);

      const signRes = await fetch(
        `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=write`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": AWS_S3_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ object_path }),
        }
      );

      if (!signRes.ok) {
        const errText = await signRes.text();
        throw new Error(`Gateway sign-upload failed [${signRes.status}]: ${errText}`);
      }

      const data = await signRes.json();
      return json({ url: data.url, expires_in: data.expires_in, method: data.method });
    }

    if (action === "sign-download") {
      const { object_paths } = body;
      if (!Array.isArray(object_paths) || object_paths.length === 0) {
        return json({ error: "object_paths array required" }, 400);
      }

      // Sign each path (gateway only supports one at a time)
      const results: Record<string, string> = {};
      const batchSize = 10;

      for (let i = 0; i < object_paths.length; i += batchSize) {
        const batch = object_paths.slice(i, i + batchSize);
        const promises = batch.map(async (path: string) => {
          const signRes = await fetch(
            `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=read`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "X-Connection-Api-Key": AWS_S3_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ object_path: path }),
            }
          );
          if (!signRes.ok) {
            console.error(`Failed to sign ${path}: ${signRes.status}`);
            return { path, url: "" };
          }
          const data = await signRes.json();
          return { path, url: data.url };
        });

        const batchResults = await Promise.all(promises);
        for (const r of batchResults) {
          results[r.path] = r.url;
        }
      }

      return json({ signed_urls: results });
    }

    if (action === "delete") {
      const { object_paths } = body;
      if (!Array.isArray(object_paths) || object_paths.length === 0) {
        return json({ error: "object_paths array required" }, 400);
      }

      // Delete by signing a write URL isn't the right approach.
      // Use the gateway proxy to issue DELETE requests for each object.
      const errors: string[] = [];
      for (const path of object_paths) {
        const delRes = await fetch(`${GATEWAY_URL}/aws_s3/${path}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": AWS_S3_API_KEY,
          },
        });
        if (!delRes.ok && delRes.status !== 404) {
          errors.push(`${path}: ${delRes.status}`);
        }
      }

      if (errors.length > 0) {
        return json({ error: "Some deletes failed", details: errors }, 207);
      }
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: unknown) {
    console.error("s3-storage error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
