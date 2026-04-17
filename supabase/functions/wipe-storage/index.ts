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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id);
    const isPlatformAdmin = (roles ?? []).some(
      (r: { role: string }) => r.role === "platform_admin",
    );
    if (!isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, { deleted: number; remaining: number; error?: string }> = {};

    for (const bucket of BUCKETS) {
      let totalDeleted = 0;
      let err: string | undefined;

      try {
        // Loop: list 1000 from offset 0, delete them, repeat until empty.
        // Always re-listing from offset 0 because the list shrinks as we delete.
        // Use a recursive walk to find all files (storage.list isn't recursive).
        const collectAll = async (prefix: string, acc: string[]) => {
          let offset = 0;
          while (true) {
            const { data: items, error } = await admin.storage
              .from(bucket)
              .list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
            if (error) throw new Error(error.message);
            if (!items || items.length === 0) break;
            for (const item of items) {
              const path = prefix ? `${prefix}/${item.name}` : item.name;
              if (item.id === null) {
                // folder
                await collectAll(path, acc);
              } else {
                acc.push(path);
              }
            }
            if (items.length < 1000) break;
            offset += 1000;
          }
        };

        // Repeat until nothing is left (in case new arrivals or missed items)
        for (let pass = 0; pass < 10; pass++) {
          const all: string[] = [];
          await collectAll("", all);
          console.log(`[${bucket}] pass ${pass}: found ${all.length} files`);
          if (all.length === 0) break;

          // Delete in chunks of 1000
          for (let i = 0; i < all.length; i += 1000) {
            const chunk = all.slice(i, i + 1000);
            const { error: delErr } = await admin.storage.from(bucket).remove(chunk);
            if (delErr) {
              console.error(`[${bucket}] delete error:`, delErr.message);
              throw new Error(delErr.message);
            }
            totalDeleted += chunk.length;
            console.log(`[${bucket}] deleted ${totalDeleted} so far`);
          }
        }
      } catch (e) {
        err = (e as Error).message;
        console.error(`[${bucket}] failed:`, err);
      }

      // Verify remaining
      let remaining = 0;
      try {
        const { count } = await admin
          .schema("storage")
          .from("objects")
          .select("*", { count: "exact", head: true })
          .eq("bucket_id", bucket);
        remaining = count ?? 0;
      } catch (_e) {
        // ignore
      }

      results[bucket] = { deleted: totalDeleted, remaining, ...(err ? { error: err } : {}) };
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
