import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
const TEST_PASSWORD = Deno.env.get("TEST_USER_PASSWORD")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let token: string | undefined;
try {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "james@jaimar.dev",
    password: TEST_PASSWORD,
  });
  if (error) console.log("Auth error:", error.message);
  token = data?.session?.access_token;
  if (token) console.log("✅ Authenticated successfully");
} catch (e) {
  console.log("Auth exception:", e);
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

Deno.test("health endpoint returns OK from VPS", async () => {
  if (!token) throw new Error("No auth token - check TEST_USER_PASSWORD");
  const { status, body } = await callPdfApi("health");
  console.log("Health:", status, JSON.stringify(body));
  assertEquals(status === 200 || status === 503, true, `Unexpected status: ${status}`);
});

Deno.test("rasterize route exists on VPS (validation error expected)", async () => {
  if (!token) throw new Error("No auth token");
  const { status, body } = await callPdfApi("rasterize");
  console.log("Rasterize:", status, JSON.stringify(body));
  // 400 = route exists, validation fired. 503 = busy.
  assertEquals(status === 400 || status === 503, true, `Unexpected: ${status} ${JSON.stringify(body)}`);
});

Deno.test("invalid path rejected by edge function proxy", async () => {
  if (!token) throw new Error("No auth token");
  const { status, body } = await callPdfApi("not-a-real-path");
  console.log("Invalid path:", status, JSON.stringify(body));
  assertEquals(status, 400);
});

Deno.test("CORS preflight works", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pdf-api`, {
    method: "OPTIONS",
    headers: { "Origin": "https://example.com", "apikey": SUPABASE_ANON_KEY },
  });
  await res.text();
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});
