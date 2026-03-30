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
  if (token) console.log("✅ Authenticated");
} catch (e) {
  console.log("Auth exception:", e);
}

async function callPdfApi(path: string, method = "GET", payload: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pdf-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ path, method, ...payload }),
  });
  const body = await res.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = body; }
  return { status: res.status, body: parsed };
}

// Find an existing asset to inspect
Deno.test("1. List assets to find one with boxes", async () => {
  if (!token) throw new Error("No auth token");
  const { status, body } = await callPdfApi("v1/assets", "GET");
  console.log("Assets list status:", status);
  
  if (Array.isArray(body)) {
    const withBoxes = body.filter((a: any) => a.boxes && Object.keys(a.boxes).length > 0);
    console.log(`Found ${body.length} assets, ${withBoxes.length} with boxes`);
    if (withBoxes.length > 0) {
      const a = withBoxes[0];
      console.log("Sample asset boxes:", JSON.stringify(a.boxes, null, 2));
      console.log("Asset dimensions:", { width_pt: a.width_pt, height_pt: a.height_pt, page_count: a.page_count });
    } else if (body.length > 0) {
      console.log("First asset (no boxes):", JSON.stringify(body[0], null, 2));
    }
  } else {
    console.log("Assets response:", JSON.stringify(body));
  }
});

// Check if rasterize operation exists
Deno.test("2. Probe v1/operations/rasterize", async () => {
  if (!token) throw new Error("No auth token");
  const { status, body } = await callPdfApi("v1/operations/rasterize", "POST", {
    asset_id: "00000000-0000-0000-0000-000000000000",
  });
  console.log("Rasterize probe:", status, JSON.stringify(body));
});

// Check available operations
Deno.test("3. List available operations", async () => {
  if (!token) throw new Error("No auth token");
  const { status, body } = await callPdfApi("v1/operations", "GET");
  console.log("Operations list:", status, JSON.stringify(body));
});

// Check if createAsset accepts render_box by looking at API docs/schema
Deno.test("4. Probe createAsset with render_box parameter", async () => {
  if (!token) throw new Error("No auth token");
  // Try creating with render_box to see if accepted or rejected
  const { status, body } = await callPdfApi("v1/assets", "POST", {
    original_filename: "probe-test.pdf",
    media_type: "application/pdf",
    source_storage_path: "nonexistent/probe.pdf",
    render_box: "trim",
    auto_queue: false,
  });
  console.log("CreateAsset with render_box:", status, JSON.stringify(body));
});
