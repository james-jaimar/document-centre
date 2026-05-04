// Transfers draft/cart orders from an anonymous user to the newly authenticated user.
// Called after a user signs in at checkout to claim their work.
//
// Body: { anonymous_user_id: string }
// The caller must be authenticated (the real user who just signed in).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    // Verify the caller is a real (non-anonymous) user
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const anonUserId = body.anonymous_user_id;
    if (!anonUserId || typeof anonUserId !== "string") {
      return json({ error: "anonymous_user_id is required" }, 400);
    }

    // Don't allow claiming your own orders (no-op)
    if (anonUserId === user.id) {
      return json({ claimed: 0 });
    }

    const admin = createClient(url, serviceKey);

    // Transfer draft and cart orders
    const { data: orders, error: updErr } = await admin
      .from("orders")
      .update({
        user_id: user.id,
        ordered_by_profile_id: user.id,
      })
      .eq("user_id", anonUserId)
      .in("order_status", ["draft", "cart", "quoted"])
      .select("id");

    if (updErr) {
      console.error("claim-anonymous-orders: update failed", updErr);
      return json({ error: updErr.message }, 500);
    }

    // Clean up: delete the anonymous user's membership and profile
    // (they're no longer needed)
    await admin
      .from("tenant_memberships")
      .delete()
      .eq("profile_id", anonUserId);

    // Delete the anonymous auth user
    await admin.auth.admin.deleteUser(anonUserId);

    return json({ claimed: orders?.length ?? 0 });
  } catch (e) {
    console.error("claim-anonymous-orders error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
