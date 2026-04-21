// Daily cleanup of demo data older than 7 days (or all, if force=true).
// - Deletes demo orders (and cascades through order_items, documents,
//   document_sections via existing FK behaviour).
// - Deletes anonymous demo users older than the cutoff.
// Keeps the demo tenant, branch, and product catalogue intact.
//
// Auth: only callable by platform admins (or service role).
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

    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch (_) { /* no body OK */ }

    const authHeader = req.headers.get("Authorization") ?? "";

    // Allow calls from cron (service role) or platform admins
    const isServiceRole = authHeader.includes(serviceKey);
    if (!isServiceRole) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);

      const admin0 = createClient(url, serviceKey);
      const { data: roles } = await admin0
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isPlatformAdmin = (roles ?? []).some((r: any) => r.role === "platform_admin");
      if (!isPlatformAdmin) return json({ error: "Forbidden" }, 403);
    }

    const admin = createClient(url, serviceKey);

    const cutoff = force
      ? new Date().toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Find demo orders to delete
    const { data: ordersToDelete } = await admin
      .from("orders")
      .select("id")
      .eq("is_demo", true)
      .lt("created_at", cutoff);

    const orderIds = (ordersToDelete ?? []).map((o: any) => o.id);
    let deletedOrders = 0;

    if (orderIds.length > 0) {
      // Cascade delete in safe order
      const { data: itemIds } = await admin
        .from("order_items")
        .select("id")
        .in("order_id", orderIds);
      const itemIdList = (itemIds ?? []).map((i: any) => i.id);

      if (itemIdList.length > 0) {
        await admin.from("document_sections").delete().in("order_item_id", itemIdList);
        await admin.from("documents").delete().in("order_item_id", itemIdList);
      }
      await admin.from("order_items").delete().in("order_id", orderIds);
      await admin.from("order_addresses").delete().in("order_id", orderIds);
      await admin.from("order_jobs").delete().in("order_id", orderIds);
      await admin.from("order_pricing_snapshots").delete().in("order_id", orderIds);
      await admin.from("order_invoices").delete().in("order_id", orderIds);
      const { error: delOrderErr } = await admin.from("orders").delete().in("id", orderIds);
      if (!delOrderErr) deletedOrders = orderIds.length;
    }

    // 2. Find anonymous demo profiles to remove
    const { data: profilesToDelete } = await admin
      .from("profiles")
      .select("id, created_at")
      .eq("is_demo", true)
      .lt("created_at", cutoff);

    let deletedUsers = 0;
    for (const p of profilesToDelete ?? []) {
      try {
        // Only delete if the auth user is anonymous (no email)
        const { data: authUserRes } = await admin.auth.admin.getUserById(p.id);
        const authUser = authUserRes?.user;
        if (!authUser) continue;
        if (authUser.email) continue; // converted to permanent — keep

        await admin.from("tenant_memberships").delete().eq("profile_id", p.id);
        await admin.from("user_roles").delete().eq("user_id", p.id);
        await admin.from("profiles").delete().eq("id", p.id);
        await admin.auth.admin.deleteUser(p.id);
        deletedUsers++;
      } catch (e) {
        console.error("Failed to delete demo user", p.id, e);
      }
    }

    return json({ success: true, deletedOrders, deletedUsers, force, cutoff });
  } catch (e) {
    console.error("cleanup-demo-data error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
