import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKETS = ["document-uploads", "documents", "previews", "proofs", "uploads", "assets"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is a platform admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userRes.user.id);
    const isPlatformAdmin = (roles ?? []).some((r: { role: string }) => r.role === "platform_admin");
    if (!isPlatformAdmin) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const results: Record<string, { deleted: number; error?: string }> = {};

    for (const bucket of BUCKETS) {
      let totalDeleted = 0;
      let err: string | undefined;
      // List & delete recursively in batches
      const walk = async (prefix: string) => {
        let offset = 0;
        const pageSize = 1000;
        while (true) {
          const { data: items, error } = await admin.storage.from(bucket).list(prefix, { limit: pageSize, offset });
          if (error) { err = error.message; return; }
          if (!items || items.length === 0) break;
          const files = items.filter((i) => i.id !== null).map((i) => (prefix ? `${prefix}/${i.name}` : i.name));
          const folders = items.filter((i) => i.id === null).map((i) => (prefix ? `${prefix}/${i.name}` : i.name));
          if (files.length > 0) {
            const { error: delErr } = await admin.storage.from(bucket).remove(files);
            if (delErr) { err = delErr.message; return; }
            totalDeleted += files.length;
          }
          for (const folder of folders) await walk(folder);
          if (items.length < pageSize) break;
          offset += pageSize;
        }
      };
      try { await walk(""); } catch (e) { err = (e as Error).message; }
      results[bucket] = { deleted: totalDeleted, ...(err ? { error: err } : {}) };
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
