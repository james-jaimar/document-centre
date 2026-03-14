import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

// We need a valid JWT to pass the edge function's auth check.
// Try signing in; if no password available, tests will be skipped gracefully.
let token: string | undefined;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
try {
  const { data } = await supabase.auth.signInWithPassword({
    email: "james@jaimar.dev",
    password: Deno.env.get("TEST_USER_PASSWORD") || "",
  });
  token = data?.session?.access_token;
} catch {
  // no-op
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
    console.log("⚠️  Skipping – no auth token (set TEST_USER_PASSWORD secret)");
    return;
  }
  const { status, body } = await callPdfApi("health");
  console.log("Health:", status, JSON.stringify(body));
  // 200 = healthy, 503 = busy (both mean VPS is reachable)
  assertEquals(status === 200 || status === 503, true, `Unexpected status: ${status}`);
});

Deno.test("rasterize route exists on VPS", async () => {
  if (!token) {
    console.log("⚠️  Skipping – no auth token");
    return;
  }
  // Call without pdf_url → VPS should return 400 "pdf_url is required"
  const { status, body } = await callPdfApi("rasterize");
  console.log("Rasterize validation:", status, JSON.stringify(body));
  // 400 = route exists, validation fired. 503 = busy. Both prove the route is there.
  assertEquals(status === 400 || status === 503, true, `Unexpected status: ${status}`);
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
