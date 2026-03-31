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
} catch (e: unknown) {
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

// Asset with TrimBox [4.252, 3.5433, 202.677, 145.276] 
// TrimBox in mm: width=(202.677-4.252)*25.4/72=70.0mm, height=(145.276-3.5433)*25.4/72=49.9mm
const ASSET_ID = "9881acb4-74c6-435f-9af5-9d3c5adf859d";

Deno.test("resize to trim dimensions and check if new thumbnails are generated", async () => {
  if (!token) throw new Error("No auth token");
  
  // TrimBox: [4.252, 3.5433, 202.677, 145.276]
  const trimW = (202.677 - 4.252) * 25.4 / 72; // ~70.0mm
  const trimH = (145.276 - 3.5433) * 25.4 / 72; // ~49.9mm
  
  console.log(`Resize to trim: ${trimW.toFixed(1)}×${trimH.toFixed(1)}mm`);
  
  const { status, body } = await callPdfApi("v1/operations/resize", {
    method: "POST",
    asset_id: ASSET_ID,
    width_mm: Math.round(trimW * 10) / 10,
    height_mm: Math.round(trimH * 10) / 10,
    fit_mode: "fit",
  });
  console.log("Resize result:", status, JSON.stringify(body));
  
  if (body.job_id) {
    // Poll the job
    for (let i = 0; i < 30; i++) {
      const { body: job } = await callPdfApi(`v1/jobs/${body.job_id}`, { method: "GET" });
      console.log(`Job poll ${i}: ${job.status}`);
      if (job.status === "completed" || job.status === "failed") {
        console.log("Job result:", JSON.stringify(job));
        break;
      }
      await new Promise(r => setTimeout(r, 3000));
    }
    
    // Check if the resize created a new asset or modified the existing one
    const { body: asset } = await callPdfApi(`v1/assets/${ASSET_ID}`, { method: "GET" });
    console.log("Asset after resize:", JSON.stringify(asset).slice(0, 500));
    
    const { body: derived } = await callPdfApi(`v1/assets/${ASSET_ID}/derived-files`, { method: "GET" });
    console.log("Derived files count:", Array.isArray(derived) ? derived.length : "not array");
    if (Array.isArray(derived)) {
      for (const df of derived) {
        console.log(`  ${df.kind} page=${df.page} ${df.storage_path?.slice(-50)}`);
      }
    }
  }
});
