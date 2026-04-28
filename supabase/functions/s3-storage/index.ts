import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { deleteS3Objects } from "../_shared/s3Delete.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Resilience plumbing ──────────────────────────────────────────────
//
// The connector gateway and S3 itself can both have transient hiccups
// (worker recycles, throttling, momentary 5xx). Wrap every outbound fetch
// in this helper so a single blip doesn't propagate as a hard error to the
// browser. Customers should never see "S3" or status codes in error text.

const DEFAULT_MAX_RETRIES = 6;

function backoffDelay(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 5000);
  const jitter = Math.floor(Math.random() * 200);
  return base + jitter;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

interface RetryFetchOpts {
  /** Outbound label for log lines. */
  label: string;
  /** Override max attempts on top of the initial. Defaults to 4. */
  maxRetries?: number;
}

/**
 * fetch() with exponential-backoff retries on transient HTTP failures and
 * network errors. The caller still inspects res.ok for permanent 4xx and
 * decides what to surface.
 */
async function resilientFetch(
  url: string,
  init: RequestInit,
  opts: RetryFetchOpts,
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (networkErr) {
      lastError = networkErr;
      if (attempt < maxRetries) {
        const delay = backoffDelay(attempt);
        console.warn(
          `[s3-storage] ${opts.label} network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`,
          networkErr instanceof Error ? networkErr.message : networkErr,
        );
        await sleep(delay);
        continue;
      }
      throw networkErr;
    }

    if (res.ok) return res;

    if (isTransientStatus(res.status) && attempt < maxRetries) {
      const delay = backoffDelay(attempt);
      console.warn(
        `[s3-storage] ${opts.label} transient ${res.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
      );
      // Drain body so the connection can be reused.
      try {
        await res.text();
      } catch (_) { /* noop */ }
      await sleep(delay);
      continue;
    }

    return res;
  }

  // Loop exhausted on a network-error path.
  throw lastError ?? new Error(`${opts.label} failed`);
}

/** Sanitise upstream error text so the user never sees raw S3/gateway wording. */
function friendlyError(action: string, ref: string): string {
  return `Storage is temporarily unavailable while ${action}. Please retry shortly. (ref: ${ref})`;
}

/** Short opaque ref id (8 chars) included in log lines and error responses. */
function newRefId(): string {
  return Math.random().toString(36).slice(2, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const ref = newRefId();

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
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: claimsData, error: claimsErr } = await supabase.auth.getUser();
  if (claimsErr || !claimsData?.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const gatewayHeaders = {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": AWS_S3_API_KEY,
    "Content-Type": "application/json",
  };

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "sign-upload") {
      const { object_path } = body;
      if (!object_path) return json({ error: "object_path required" }, 400);

      const signRes = await resilientFetch(
        `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=write`,
        {
          method: "POST",
          headers: gatewayHeaders,
          body: JSON.stringify({ object_path }),
        },
        { label: "sign-upload" },
      );

      if (!signRes.ok) {
        const errText = await signRes.text().catch(() => "");
        console.error(`[s3-storage] sign-upload failed [${signRes.status}]: ${errText}`);
        return json({ error: friendlyError("preparing your upload") }, 503);
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
      let anyHardFailure = false;

      for (let i = 0; i < object_paths.length; i += batchSize) {
        const batch = object_paths.slice(i, i + batchSize);
        const promises = batch.map(async (path: string) => {
          try {
            const signRes = await resilientFetch(
              `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=read`,
              {
                method: "POST",
                headers: gatewayHeaders,
                body: JSON.stringify({ object_path: path }),
              },
              { label: `sign-download(${path})` },
            );
            if (!signRes.ok) {
              const txt = await signRes.text().catch(() => "");
              console.error(`[s3-storage] sign-download ${path} [${signRes.status}]: ${txt}`);
              anyHardFailure = true;
              return { path, url: "" };
            }
            const data = await signRes.json();
            return { path, url: data.url };
          } catch (err) {
            console.error(`[s3-storage] sign-download ${path} threw:`, err);
            anyHardFailure = true;
            return { path, url: "" };
          }
        });

        const batchResults = await Promise.all(promises);
        for (const r of batchResults) {
          results[r.path] = r.url;
        }
      }

      // Always return whatever URLs we got — partial success is better than
      // total failure. Caller can detect empty URLs and re-request.
      return json({ signed_urls: results, partial_failure: anyHardFailure });
    }

    if (action === "copy") {
      const { source_path, dest_path } = body;
      if (!source_path || !dest_path) {
        return json({ error: "source_path and dest_path required" }, 400);
      }

      // Sign a read URL for the source, download the bytes, then PUT to dest.
      const signReadRes = await resilientFetch(
        `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=read`,
        {
          method: "POST",
          headers: gatewayHeaders,
          body: JSON.stringify({ object_path: source_path }),
        },
        { label: "copy.sign-read" },
      );
      if (!signReadRes.ok) {
        const errText = await signReadRes.text().catch(() => "");
        console.error(`[s3-storage] copy sign-read [${signReadRes.status}]: ${errText}`);
        return json({ error: friendlyError("copying your file") }, 503);
      }
      const { url: readUrl } = await signReadRes.json();

      const signWriteRes = await resilientFetch(
        `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=write`,
        {
          method: "POST",
          headers: gatewayHeaders,
          body: JSON.stringify({ object_path: dest_path }),
        },
        { label: "copy.sign-write" },
      );
      if (!signWriteRes.ok) {
        const errText = await signWriteRes.text().catch(() => "");
        console.error(`[s3-storage] copy sign-write [${signWriteRes.status}]: ${errText}`);
        return json({ error: friendlyError("copying your file") }, 503);
      }
      const { url: writeUrl } = await signWriteRes.json();

      // Stream bytes from source → dest, with retries on each leg.
      const getRes = await resilientFetch(readUrl, { method: "GET" }, {
        label: "copy.fetch-source",
      });
      if (!getRes.ok) {
        const errText = await getRes.text().catch(() => "");
        console.error(`[s3-storage] copy fetch-source [${getRes.status}]: ${errText}`);
        return json({ error: friendlyError("copying your file") }, 503);
      }
      const bytes = await getRes.arrayBuffer();
      const contentType = getRes.headers.get("Content-Type") || "application/octet-stream";

      const putRes = await resilientFetch(
        writeUrl,
        { method: "PUT", headers: { "Content-Type": contentType }, body: bytes },
        { label: "copy.put-dest" },
      );
      if (!putRes.ok) {
        const errText = await putRes.text().catch(() => "");
        console.error(`[s3-storage] copy put-dest [${putRes.status}]: ${errText}`);
        return json({ error: friendlyError("copying your file") }, 503);
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
        `[s3-storage] delete: ${result.deleted} ok, ${result.failed.length} failed`,
      );
      if (result.failed.length > 0) {
        return json(
          { error: "Some files could not be removed", details: result.failed, deleted: result.deleted },
          207,
        );
      }
      return json({ success: true, deleted: result.deleted });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: unknown) {
    console.error("s3-storage error:", err);
    return json({ error: friendlyError("processing your request") }, 500);
  }
});
