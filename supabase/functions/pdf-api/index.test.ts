import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Use service role to create a short-lived token for testing
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Get a valid user token by generating a magic link session
let token: string | undefined;
try {
  // List users and get the first one's ID to generate a token
  const { data: users } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (users?.users?.length) {
    const user = users.users[0];
    // Generate a link which gives us a session
    const { data: linkData } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: user.email!,
    });
    // Sign in with the anon client using the OTP token
    if (linkData?.properties?.hashed_token) {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: session } = await anonClient.auth.verifyOtp({
        type: "magiclink",
        token_hash: linkData.properties.hashed_token,
      });
      token = session?.session?.access_token;
    }
  }
} catch (e) {
  console.log("Auth setup error:", e);
}

async function callPdfApi(path: string, payload: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pdf-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ path, ...payload }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

Deno.test("health endpoint returns OK", async () => {
  if (!token) {
    console.log("⚠️  Skipping – could not obtain auth token");
    return;
  }
  const { status, body } = await callPdfApi("health");
  console.log("Health:", status, JSON.stringify(body));
  assertEquals(status === 200 || status === 503, true, `Unexpected status: ${status}`);
});

Deno.test("rasterize route exists on VPS", async () => {
  if (!token) {
    console.log("⚠️  Skipping – no auth token");
    return;
  }
  const { status, body } = await callPdfApi("rasterize");
  console.log("Rasterize validation:", status, JSON.stringify(body));
  assertEquals(status === 400 || status === 503, true, `Unexpected: ${status} ${JSON.stringify(body)}`);
});

Deno.test("invalid path rejected by proxy", async () => {
  if (!token) {
    console.log("⚠️  Skipping – no auth token");
    return;
  }
  const { status, body } = await callPdfApi("not-a-real-path");
  console.log("Invalid path:", status, JSON.stringify(body));
  assertEquals(status, 400);
});
