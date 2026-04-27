// Daily cleanup of stale draft / cart orders and abandoned uploads (>7 days old).
//
// Sweeps:
//   1. Orders in 'draft' or 'cart' status that were never submitted.
//   2. Documents whose parent order_item is gone (true orphans).
//   3. Backend `assets` rows with no documents pointing at them.
//
// Triggered by pg_cron via net.http_post. Service-role key implied (no JWT check).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { deleteS3Objects } from "../_shared/s3Delete.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STALE_DAYS = 7;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const allFilePaths: string[] = [];

  // ---------- 1. Stale draft / cart orders never submitted ----------
  const { data: staleOrders, error: ordersErr } = await admin
    .from("orders")
    .select("id")
    .is("submitted_at", null)
    .in("order_status", ["draft", "cart"])
    .lt("created_at", cutoff);

  if (ordersErr) {
    console.error("[cleanup] query stale orders failed", ordersErr);
    return json({ error: ordersErr.message }, 500);
  }

  const orderIds = (staleOrders ?? []).map((o) => o.id);
  let deletedOrders = 0;

  if (orderIds.length > 0) {
    const { data: items } = await admin
      .from("order_items")
      .select("id")
      .in("order_id", orderIds);
    const itemIds = (items ?? []).map((i) => i.id);

    if (itemIds.length > 0) {
      const { data: docs } = await admin
        .from("documents")
        .select("file_path")
        .in("order_item_id", itemIds);
      for (const d of docs ?? []) if (d.file_path) allFilePaths.push(d.file_path);

      await admin.from("document_sections").delete().in("order_item_id", itemIds);
      await admin.from("documents").delete().in("order_item_id", itemIds);
      await admin.from("order_items").delete().in("id", itemIds);
    }
    await admin.from("order_addresses").delete().in("order_id", orderIds);
    const { error: delErr } = await admin.from("orders").delete().in("id", orderIds);
    if (delErr) {
      console.error("[cleanup] delete orders failed", delErr);
      return json({ error: delErr.message }, 500);
    }
    deletedOrders = orderIds.length;
  }

  // ---------- 2. Orphan documents (parent order_item already deleted) ----------
  // Two-pass: list documents, fetch order_items they reference, find dangling ones.
  const { data: oldDocs } = await admin
    .from("documents")
    .select("id, file_path, order_item_id")
    .lt("created_at", cutoff)
    .limit(5000);

  let deletedOrphanDocs = 0;
  if (oldDocs && oldDocs.length > 0) {
    const itemIdSet = new Set(oldDocs.map((d) => d.order_item_id).filter(Boolean));
    const { data: existingItems } = await admin
      .from("order_items")
      .select("id")
      .in("id", Array.from(itemIdSet));
    const existing = new Set((existingItems ?? []).map((i) => i.id));
    const orphans = oldDocs.filter((d) => !d.order_item_id || !existing.has(d.order_item_id));

    if (orphans.length > 0) {
      for (const o of orphans) if (o.file_path) allFilePaths.push(o.file_path);
      await admin.from("documents").delete().in("id", orphans.map((o) => o.id));
      deletedOrphanDocs = orphans.length;
    }
  }

  // ---------- 3. Delete S3 objects (best-effort) ----------
  let s3Result = { deleted: 0, failed: [] as string[] };
  if (allFilePaths.length > 0) {
    s3Result = await deleteS3Objects(allFilePaths);
    console.log(`[cleanup] S3 deleted: ${s3Result.deleted}, failed: ${s3Result.failed.length}`);
  }

  console.log(
    `[cleanup] orders=${deletedOrders} orphan_docs=${deletedOrphanDocs} s3=${s3Result.deleted}`,
  );
  return json({
    ok: true,
    deleted_orders: deletedOrders,
    deleted_orphan_documents: deletedOrphanDocs,
    deleted_files: s3Result.deleted,
    failed_files: s3Result.failed.slice(0, 20),
    cutoff,
  });
});
