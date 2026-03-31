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

// Known asset with TrimBox [4.252, 3.5433, 202.677, 145.276]
const ASSET_ID = "9881acb4-74c6-435f-9af5-9d3c5adf859d";

Deno.test("probe rasterize with box param", async () => {
  if (!token) throw new Error("No auth token");
  const { status, body } = await callPdfApi("v1/operations/rasterize", {
    method: "POST",
    asset_id: ASSET_ID,
    box: [4.252, 3.5433, 202.677, 145.276],
    dpi: 150,
  });
  console.log("Rasterize with box:", status, JSON.stringify(body));
});

Deno.test("probe rasterize with render_box param", async () => {
  if (!token) throw new Error("No auth token");
  const { status, body } = await callPdfApi("v1/operations/rasterize", {
    method: "POST",
    asset_id: ASSET_ID,
    render_box: "trim",
    dpi: 150,
  });
  console.log("Rasterize with render_box:", status, JSON.stringify(body));
});

Deno.test("probe rasterize minimal (just asset_id)", async () => {
  if (!token) throw new Error("No auth token");
  const { status, body } = await callPdfApi("v1/operations/rasterize", {
    method: "POST",
    asset_id: ASSET_ID,
  });
  console.log("Rasterize minimal:", status, JSON.stringify(body));
});
