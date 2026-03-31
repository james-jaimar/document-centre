import "https://deno.land/std@0.224.0/dotenv/load.ts";
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

const ASSET_ID = "9881acb4-74c6-435f-9af5-9d3c5adf859d";

// Try various possible endpoints
const endpoints = [
  "v1/operations/rasterize",
  "v1/operations/render",
  "v1/operations/thumbnails",
  "v1/operations/crop",
  "v1/operations",
  "v1/assets/" + ASSET_ID + "/rasterize",
  "v1/assets/" + ASSET_ID + "/render",
  "v1/assets/" + ASSET_ID + "/thumbnails",
  "v1/assets/" + ASSET_ID + "/crop",
  "health",
];

Deno.test("discover available operations", async () => {
  if (!token) throw new Error("No auth token");
  for (const ep of endpoints) {
    const { status, body } = await callPdfApi(ep, { method: "POST", asset_id: ASSET_ID });
    console.log(`${ep}: ${status} ${JSON.stringify(body).slice(0, 200)}`);
  }
});

// Also try GET on the operations list
Deno.test("list operations via GET", async () => {
  if (!token) throw new Error("No auth token");
  const { status, body } = await callPdfApi("v1/operations", { method: "GET" });
  console.log(`GET v1/operations: ${status} ${JSON.stringify(body).slice(0, 500)}`);
});

// Try openapi/docs
Deno.test("check docs endpoint", async () => {
  if (!token) throw new Error("No auth token");
  for (const ep of ["docs", "openapi.json", "v1/docs", "api/docs"]) {
    const { status, body } = await callPdfApi(ep, { method: "GET" });
    console.log(`${ep}: ${status} ${JSON.stringify(body).slice(0, 300)}`);
  }
});
