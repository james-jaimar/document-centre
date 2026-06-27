// Public endpoint that logs email opens (1x1 GIF) and clicks (302 redirect).
// Tokens are HMAC-signed so they cannot be forged across recipients/campaigns.
// IP addresses are SHA-256 hashed before storage for privacy.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyTrackingToken } from "../_shared/emailTracking.ts";

const GIF_BYTES = Uint8Array.from([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x01,0x00,0x00,0x00,
  0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,
  0x44,0x01,0x00,0x3b,
]);

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function pixelResponse(): Response {
  return new Response(GIF_BYTES, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const payload = await verifyTrackingToken(token);

  // Always succeed visually even on bad tokens (don't leak validity).
  if (!payload) {
    return pixelResponse();
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const ua = req.headers.get("user-agent") ?? null;
  const now = new Date().toISOString();

  try {
    if (payload.k === "o") {
      await admin.from("email_tracking_events").insert({
        event_type: "open", campaign_id: payload.c, recipient_id: payload.r,
        ip_hash: ipHash, user_agent: ua,
      });
      // Update aggregate counters
      const { data: existing } = await admin
        .from("platform_email_campaign_recipients")
        .select("first_opened_at, open_count").eq("id", payload.r).maybeSingle();
      await admin.from("platform_email_campaign_recipients").update({
        first_opened_at: existing?.first_opened_at ?? now,
        open_count: (existing?.open_count ?? 0) + 1,
      }).eq("id", payload.r);
      return pixelResponse();
    }
    if (payload.k === "c") {
      const target = payload.u;
      if (!target || !/^https?:\/\//i.test(target)) {
        return new Response("Invalid target", { status: 400 });
      }
      await admin.from("email_tracking_events").insert({
        event_type: "click", campaign_id: payload.c, recipient_id: payload.r,
        url: target, ip_hash: ipHash, user_agent: ua,
      });
      const { data: existing } = await admin
        .from("platform_email_campaign_recipients")
        .select("first_clicked_at, click_count").eq("id", payload.r).maybeSingle();
      await admin.from("platform_email_campaign_recipients").update({
        first_clicked_at: existing?.first_clicked_at ?? now,
        click_count: (existing?.click_count ?? 0) + 1,
        last_clicked_url: target,
      }).eq("id", payload.r);
      return new Response(null, { status: 302, headers: { Location: target } });
    }
  } catch (e) {
    console.error("email-track error:", (e as Error).message);
  }
  return pixelResponse();
});
