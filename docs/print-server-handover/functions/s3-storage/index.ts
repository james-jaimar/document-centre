// Storage helper for the shared Cape Town bucket.
// Copy to: supabase/functions/s3-storage/index.ts
//
// Every object path is forced under APP_STORAGE_PREFIX so this app can never
// read or overwrite another app's files in the shared bucket. Do not remove
// the guard.
//
// Required secrets: APP_STORAGE_PREFIX, AWS_S3_BUCKET, AWS_S3_REGION,
// AWS_S3_ACCESS_KEY_ID, AWS_S3_SECRET_ACCESS_KEY,
// plus LOVABLE_API_KEY + AWS_S3_API_KEY from the AWS S3 connector.
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

// ── Prefix guard ─────────────────────────────────────────────────────
function storagePrefix(): string {
  const raw = (Deno.env.get("APP_STORAGE_PREFIX") ?? "").replace(/^\/+/, "");
  if (!raw) throw new Error("APP_STORAGE_PREFIX missing");
  return raw.endsWith("/") ? raw : raw + "/";
}

/** Throws unless `path` is a clean key under this app's prefix. */
function assertInPrefix(path: unknown, prefix: string): string {
  if (typeof path !== "string" || !path.trim()) throw new Error("object path required");
  const clean = path.replace(/^\/+/, "");
  if (clean.includes("..")) throw new Error(`Path not allowed: ${path}`);
  if (!clean.startsWith(prefix)) throw new Error(`Path must start with "${prefix}": ${path}`);
  return clean;
}

// ── Resilience ───────────────────────────────────────────────────────
const DEFAULT_MAX_RETRIES = 6;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function backoffDelay(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 5000) + Math.floor(Math.random() * 200);
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

async function resilientFetch(
  url: string,
  init: RequestInit,
  opts: { label: string; maxRetries?: number },
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
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw networkErr;
    }
    if (res.ok) return res;
    if (isTransientStatus(res.status) && attempt < maxRetries) {
      try { await res.text(); } catch (_) { /* drain */ }
      await sleep(backoffDelay(attempt));
      continue;
    }
    return res;
  }
  throw lastError ?? new Error(`${opts.label} failed`);
}

function friendlyError(action: string, ref: string): string {
  return `Storage is temporarily unavailable while ${action}. Please retry shortly. (ref: ${ref})`;
}

const newRefId = () => Math.random().toString(36).slice(2, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ref = newRefId();

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
  if (!AWS_S3_API_KEY) return json({ error: "AWS_S3_API_KEY not configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsErr } = await supabase.auth.getUser();
  if (claimsErr || !claims?.user) return json({ error: "Unauthorized" }, 401);

  const gatewayHeaders = {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": AWS_S3_API_KEY,
    "Content-Type": "application/json",
  };

  let prefix: string;
  try {
    prefix = storagePrefix();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  async function signUrl(objectPath: string, mode: "read" | "write", label: string) {
    const res = await resilientFetch(
      `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=${mode}`,
      { method: "POST", headers: gatewayHeaders, body: JSON.stringify({ object_path: objectPath }) },
      { label },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[s3-storage] (ref: ${ref}) ${label} [${res.status}]: ${txt}`);
      return null;
    }
    return await res.json();
  }

  try {
    const body = await req.json();
    const { action } = body;
    console.log(`[s3-storage] (ref: ${ref}) action=${action}`);

    if (action === "sign-upload") {
      const objectPath = assertInPrefix(body.object_path, prefix);
      const data = await signUrl(objectPath, "write", "sign-upload");
      if (!data) return json({ error: friendlyError("preparing your upload", ref) }, 503);
      return json({ url: data.url, expires_in: data.expires_in, method: data.method });
    }

    if (action === "stat") {
      const { object_paths } = body;
      if (!Array.isArray(object_paths) || object_paths.length === 0) {
        return json({ error: "object_paths array required" }, 400);
      }
      const paths = object_paths.map((p: unknown) => assertInPrefix(p, prefix));
      const sizes: Record<string, number | null> = {};
      await Promise.all(paths.map(async (path) => {
        try {
          const res = await resilientFetch(
            `${GATEWAY_URL}/aws_s3/${path}`,
            { method: "HEAD", headers: gatewayHeaders },
            { label: `stat(${path})`, maxRetries: 2 },
          );
          const len = res.ok ? res.headers.get("content-length") : null;
          sizes[path] = len ? Number(len) : null;
        } catch (err) {
          console.error(`[s3-storage] stat ${path} threw:`, err);
          sizes[path] = null;
        }
      }));
      return json({ sizes });
    }

    if (action === "sign-download") {
      const { object_paths } = body;
      if (!Array.isArray(object_paths) || object_paths.length === 0) {
        return json({ error: "object_paths array required" }, 400);
      }
      const paths = object_paths.map((p: unknown) => assertInPrefix(p, prefix));
      const results: Record<string, string> = {};
      let anyHardFailure = false;
      const batchSize = 10;

      for (let i = 0; i < paths.length; i += batchSize) {
        const batch = paths.slice(i, i + batchSize);
        const signed = await Promise.all(batch.map(async (path) => {
          const data = await signUrl(path, "read", `sign-download(${path})`);
          if (!data) { anyHardFailure = true; return { path, url: "" }; }
          return { path, url: data.url as string };
        }));
        for (const r of signed) results[r.path] = r.url;
      }

      return json({ signed_urls: results, partial_failure: anyHardFailure });
    }

    if (action === "download") {
      const objectPath = assertInPrefix(body.object_path, prefix);
      const signed = await signUrl(objectPath, "read", `download.sign(${objectPath})`);
      if (!signed) return json({ error: friendlyError("loading your file", ref) }, 503);

      const fileRes = await resilientFetch(signed.url, { method: "GET" }, {
        label: `download.fetch(${objectPath})`,
      });
      if (!fileRes.ok) return json({ error: friendlyError("loading your file", ref) }, 503);

      const headers: Record<string, string> = {
        ...corsHeaders,
        "Content-Type": fileRes.headers.get("Content-Type") || "application/octet-stream",
        "Cache-Control": "private, max-age=600",
      };
      const len = fileRes.headers.get("Content-Length");
      if (len) headers["Content-Length"] = len;
      const filename = body.filename;
      if (typeof filename === "string" && filename.trim()) {
        const safe = filename.replace(/[^a-zA-Z0-9._ -]+/g, "_").slice(0, 180);
        headers["Content-Disposition"] = `attachment; filename="${safe}"`;
      }
      return new Response(fileRes.body, { status: 200, headers });
    }

    if (action === "copy") {
      const sourcePath = assertInPrefix(body.source_path, prefix);
      const destPath = assertInPrefix(body.dest_path, prefix);

      const read = await signUrl(sourcePath, "read", "copy.sign-read");
      if (!read) return json({ error: friendlyError("copying your file", ref) }, 503);
      const write = await signUrl(destPath, "write", "copy.sign-write");
      if (!write) return json({ error: friendlyError("copying your file", ref) }, 503);

      const getRes = await resilientFetch(read.url, { method: "GET" }, { label: "copy.fetch-source" });
      if (!getRes.ok) return json({ error: friendlyError("copying your file", ref) }, 503);
      const bytes = await getRes.arrayBuffer();
      const contentType = getRes.headers.get("Content-Type") || "application/octet-stream";

      const putRes = await resilientFetch(
        write.url,
        { method: "PUT", headers: { "Content-Type": contentType }, body: bytes },
        { label: "copy.put-dest" },
      );
      if (!putRes.ok) return json({ error: friendlyError("copying your file", ref) }, 503);

      return json({ success: true, dest_path: destPath });
    }

    if (action === "delete") {
      const { object_paths } = body;
      if (!Array.isArray(object_paths) || object_paths.length === 0) {
        return json({ error: "object_paths array required" }, 400);
      }
      const paths = object_paths.map((p: unknown) => assertInPrefix(p, prefix));
      const result = await deleteS3Objects(paths);
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
    const msg = (err as Error)?.message ?? "";
    // Prefix violations are the caller's fault — say so plainly, 403.
    if (/Path must start with|Path not allowed|object path required/.test(msg)) {
      console.warn(`[s3-storage] (ref: ${ref}) rejected: ${msg}`);
      return json({ error: msg }, 403);
    }
    console.error(`[s3-storage] (ref: ${ref}) unhandled error:`, err);
    return json({ error: friendlyError("processing your request", ref) }, 500);
  }
});
