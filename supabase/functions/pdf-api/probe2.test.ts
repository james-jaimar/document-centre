import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
const TEST_PASSWORD = Deno.env.get("TEST_USER_PASSWORD")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let token: string | undefined;
const { data } = await supabase.auth.signInWithPassword({
  email: "james@jaimar.dev",
  password: TEST_PASSWORD,
});
token = data?.session?.access_token;
if (token) console.log("✅ Authenticated");

// Query assets table directly via Supabase to find ones with boxes
Deno.test("5. Query assets with boxes from DB", async () => {
  const { data: assets, error } = await supabase
    .from("assets")
    .select("id, original_filename, width_pt, height_pt, page_count, boxes, status")
    .not("boxes", "is", null)
    .limit(5);
  
  if (error) {
    console.log("DB query error:", error.message);
    // Fallback: just get any assets
    const { data: allAssets } = await supabase
      .from("assets")
      .select("id, original_filename, width_pt, height_pt, page_count, boxes, status")
      .limit(5);
    console.log("All assets:", JSON.stringify(allAssets, null, 2));
    return;
  }
  
  console.log(`Found ${assets?.length} assets with boxes`);
  for (const a of assets ?? []) {
    console.log(`\nAsset: ${a.original_filename} (${a.id})`);
    console.log(`  Status: ${a.status}, Pages: ${a.page_count}`);
    console.log(`  Dimensions: ${a.width_pt}pt × ${a.height_pt}pt`);
    console.log(`  Boxes:`, JSON.stringify(a.boxes, null, 2));
  }
});
