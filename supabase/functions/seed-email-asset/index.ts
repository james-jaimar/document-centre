// One-shot seeder for the marketing hero image. No auth: this function only
// downloads ONE hardcoded public URL and writes it to ONE hardcoded path in
// the email-assets bucket. Safe to call repeatedly; no user input is accepted.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCE = "https://id-preview--645dbd17-56d7-4b01-8a59-11817be20fbf.lovable.app/__l5e/assets-v1/441a76bc-04dc-4488-b285-3dd91b20cbc6/marketing-hero.jpg";
const DEST = "marketing/marketing-hero.jpg";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const r = await fetch(SOURCE);
    if (!r.ok) return new Response(`fetch failed ${r.status}`, { status: 502, headers: cors });
    const buf = new Uint8Array(await r.arrayBuffer());
    const { error } = await admin.storage.from("email-assets").upload(DEST, buf, {
      contentType: "image/jpeg", cacheControl: "31536000", upsert: true,
    });
    if (error) return new Response(`upload failed: ${error.message}`, { status: 500, headers: cors });
    return new Response(JSON.stringify({ ok: true, path: DEST, bytes: buf.byteLength }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(`error: ${(e as Error).message}`, { status: 500, headers: cors });
  }
});
