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

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Validate token and return session + tenant info. */
async function validateSession(token: string) {
  const sb = getServiceClient();
  const { data: session, error } = await sb
    .from("upload_sessions")
    .select("*, tenants!inner(name, slug, logo_url)")
    .eq("token", token)
    .eq("is_active", true)
    .single();

  if (error || !session) return null;

  // Check expiry
  if (new Date(session.expires_at) < new Date()) {
    // Auto-deactivate
    await sb.from("upload_sessions").update({ is_active: false }).eq("id", session.id);
    return null;
  }

  return session;
}

/** GET: Return session info for the mobile page. */
async function handleGet(token: string) {
  const session = await validateSession(token);
  if (!session) {
    return json({ error: "Invalid or expired upload link" }, 404);
  }

  const tenant = (session as any).tenants;
  return json({
    sessionId: session.id,
    tenantName: tenant?.name ?? "Print Centre",
    tenantSlug: tenant?.slug,
    tenantLogo: tenant?.logo_url ?? null,
    orderItemId: session.order_item_id,
    expiresAt: session.expires_at,
    fileCount: session.file_count,
  });
}

/** POST: Upload a file from mobile. */
async function handlePost(token: string, req: Request) {
  const session = await validateSession(token);
  if (!session) {
    return json({ error: "Invalid or expired upload link" }, 404);
  }

  // Rate limit: max 50 files per session
  if (session.file_count >= 50) {
    return json({ error: "Maximum 50 files per session" }, 429);
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return json({ error: "No file provided" }, 400);
  }

  // Max 50MB
  if (file.size > 50 * 1024 * 1024) {
    return json({ error: "File too large (max 50MB)" }, 413);
  }

  const sb = getServiceClient();
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");

  if (!LOVABLE_API_KEY || !AWS_S3_API_KEY) {
    console.error("[mobile-upload] Missing storage keys");
    return json({ error: "Storage not configured" }, 500);
  }

  // Build storage path
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `tenants/${session.tenant_id}/uploads/${session.created_by}/${session.order_item_id}/photos/${crypto.randomUUID()}_${safeFileName}`;

  // Get signed upload URL
  const signRes = await fetch(
    `${GATEWAY_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=write`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": AWS_S3_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ object_path: storagePath }),
    },
  );

  if (!signRes.ok) {
    console.error("[mobile-upload] Sign failed:", await signRes.text());
    return json({ error: "Upload temporarily unavailable" }, 502);
  }

  const { url: uploadUrl } = await signRes.json();

  // Upload to S3
  const arrayBuffer = await file.arrayBuffer();
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: arrayBuffer,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });

  if (!putRes.ok) {
    console.error("[mobile-upload] S3 PUT failed:", putRes.status);
    return json({ error: "Upload failed" }, 502);
  }

  // Determine if this is a photo or document
  const isImage = file.type.startsWith("image/");

  // Create document record
  const { data: doc, error: docError } = await sb
    .from("documents")
    .insert({
      order_item_id: session.order_item_id,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: file.type || (isImage ? "image/jpeg" : "application/pdf"),
      page_count: isImage ? 1 : null,
      document_status: isImage ? "ready" : "pending",
      preflight_data: isImage
        ? { kind: "photo_print", source: "mobile_upload" }
        : { source: "mobile_upload" },
    })
    .select("id, file_name")
    .single();

  if (docError) {
    console.error("[mobile-upload] DB insert failed:", docError);
    return json({ error: "Failed to save file" }, 500);
  }

  // Increment file count
  await sb
    .from("upload_sessions")
    .update({ file_count: session.file_count + 1 })
    .eq("id", session.id);

  return json({
    documentId: doc.id,
    fileName: doc.file_name,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return json({ error: "Missing token" }, 400);
  }

  try {
    if (req.method === "GET") {
      return await handleGet(token);
    }
    if (req.method === "POST") {
      return await handlePost(token, req);
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("[mobile-upload] Unhandled error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
