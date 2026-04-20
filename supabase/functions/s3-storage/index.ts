import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { deleteS3Objects } from "../_shared/s3Delete.ts";

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

    if (action === "copy") {
      const { source_path, dest_path } = body;
      if (!source_path || !dest_path) {
        return json({ error: "source_path and dest_path required" }, 400);
      }

      // Sign a read URL for the source, download the bytes, then PUT to dest.
      // (The gateway doesn't expose S3 CopyObject directly, so we stream.)
      const signReadRes = await fetch(
        `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=read`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": AWS_S3_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ object_path: source_path }),
        }
      );
      if (!signReadRes.ok) {
        const errText = await signReadRes.text();
        throw new Error(`sign-read failed [${signReadRes.status}]: ${errText}`);
      }
      const { url: readUrl } = await signReadRes.json();

      const signWriteRes = await fetch(
        `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=write`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": AWS_S3_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ object_path: dest_path }),
        }
      );
      if (!signWriteRes.ok) {
        const errText = await signWriteRes.text();
        throw new Error(`sign-write failed [${signWriteRes.status}]: ${errText}`);
      }
      const { url: writeUrl } = await signWriteRes.json();

      // Stream bytes from source → dest
      const getRes = await fetch(readUrl);
      if (!getRes.ok) {
        const errText = await getRes.text();
        throw new Error(`S3 source fetch failed [${getRes.status}]: ${errText}`);
      }
      const bytes = await getRes.arrayBuffer();
      const contentType = getRes.headers.get("Content-Type") || "application/octet-stream";

      const putRes = await fetch(writeUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: bytes,
      });
      if (!putRes.ok) {
        const errText = await putRes.text();
        throw new Error(`S3 dest PUT failed [${putRes.status}]: ${errText}`);
      }

      console.log(`[s3-storage] copy ok: ${source_path} -> ${dest_path} (${bytes.byteLength}b)`);
      return json({ success: true, dest_path });
    }

    if (action === "delete") {
      const { object_paths } = body;
      if (!Array.isArray(object_paths) || object_paths.length === 0) {
        return json({ error: "object_paths array required" }, 400);
      }

      // The connector gateway does not support DELETE for S3 — sign directly with SigV4.
      const result = await deleteS3Objects(object_paths);
      console.log(
        `[s3-storage] delete: ${result.deleted} ok, ${result.failed.length} failed`
      );
      if (result.failed.length > 0) {
        return json(
          { error: "Some deletes failed", details: result.failed, deleted: result.deleted },
          207
        );
      }
      return json({ success: true, deleted: result.deleted });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: unknown) {
    console.error("s3-storage error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
