// One-shot helper to seed a file from a public URL into the email-assets bucket.
// Caller must be a platform_admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: cors });

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401, headers: cors });
    const admin = createClient(url, svc);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", user.id)
      .eq("role", "platform_admin").maybeSingle();
    if (!roleRow) return new Response("Forbidden", { status: 403, headers: cors });

    const body = await req.json();
    const sourceUrl = String(body.source_url ?? "");
    const destPath = String(body.dest_path ?? "");
    const contentType = String(body.content_type ?? "image/jpeg");
    if (!sourceUrl || !destPath) return new Response("source_url and dest_path required", { status: 400, headers: cors });

    const r = await fetch(sourceUrl);
    if (!r.ok) return new Response(`fetch failed ${r.status}`, { status: 502, headers: cors });
    const buf = new Uint8Array(await r.arrayBuffer());

    const { error } = await admin.storage.from("email-assets").upload(destPath, buf, {
      contentType, cacheControl: "31536000", upsert: true,
    });
    if (error) return new Response(`upload failed: ${error.message}`, { status: 500, headers: cors });

    return new Response(JSON.stringify({ ok: true, path: destPath, bytes: buf.byteLength }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(`error: ${(e as Error).message}`, { status: 500, headers: cors });
  }
});
