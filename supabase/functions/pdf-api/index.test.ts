import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

// Use the anon key itself as bearer - the edge function has verify_jwt=false
// but the function code checks auth internally via getClaims.
// For testing, we'll see what response we get - even 401 proves the edge function + VPS are reachable.

async function callPdfApi(path: string, bearerToken: string, payload: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pdf-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${bearerToken}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ path, ...payload }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

Deno.test("edge function is reachable and rejects bad auth", async () => {
  const { status, body } = await callPdfApi("health", "fake-token");
  console.log("Response:", status, JSON.stringify(body));
  // Should get 401 from our edge function's auth check - proves the function is deployed and running
  assertEquals(status, 401);
  assertEquals(body.error, "Unauthorized");
});

Deno.test("CORS preflight works", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pdf-api`, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://example.com",
      "Access-Control-Request-Method": "POST",
      "apikey": SUPABASE_ANON_KEY,
    },
  });
  await res.text(); // consume body
  console.log("OPTIONS status:", res.status);
  console.log("CORS header:", res.headers.get("access-control-allow-origin"));
  assertEquals(res.status, 200);
});
