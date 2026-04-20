// Daily cleanup of stale draft orders (older than 7 days, never submitted).
// Deletes: document_sections → documents → order_items → order
// Plus: S3 storage objects for each document file_path
//
// Triggered by pg_cron via net.http_post (no JWT verification needed for the cron).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { deleteS3Objects } from "../_shared/s3Delete.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_DAYS = 7;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Find stale draft orders: never submitted, no order number, older than cutoff
  const { data: staleOrders, error: ordersErr } = await admin
    .from("orders")
    .select("id, created_at")
    .is("submitted_at", null)
    .is("order_number", null)
    .lt("created_at", cutoff);

  if (ordersErr) {
    console.error("[cleanup] failed to query stale orders", ordersErr);
    return json({ error: ordersErr.message }, 500);
  }

  const orderIds = (staleOrders ?? []).map((o) => o.id);
  if (orderIds.length === 0) {
    return json({ ok: true, deleted_orders: 0, deleted_files: 0, message: "Nothing to clean" });
  }

  // Get all order_items for these orders
  const { data: items } = await admin
    .from("order_items")
    .select("id")
    .in("order_id", orderIds);
  const itemIds = (items ?? []).map((i) => i.id);

  // Get document file_paths to delete from S3
  const filePaths: string[] = [];
  if (itemIds.length > 0) {
    const { data: docs } = await admin
      .from("documents")
      .select("file_path")
      .in("order_item_id", itemIds);
    for (const d of docs ?? []) {
      if (d.file_path) filePaths.push(d.file_path);
    }
  }

  // Delete S3 objects (best-effort, logs failures)
  let s3Result = { deleted: 0, failed: [] as string[] };
  if (filePaths.length > 0) {
    s3Result = await deleteS3Objects(filePaths);
    console.log(`[cleanup] S3 deleted: ${s3Result.deleted}, failed: ${s3Result.failed.length}`);
  }

  // Cascade delete in DB
  if (itemIds.length > 0) {
    await admin.from("document_sections").delete().in("order_item_id", itemIds);
    await admin.from("documents").delete().in("order_item_id", itemIds);
    await admin.from("order_items").delete().in("id", itemIds);
  }
  const { error: delErr } = await admin.from("orders").delete().in("id", orderIds);
  if (delErr) {
    console.error("[cleanup] failed to delete orders", delErr);
    return json({ error: delErr.message }, 500);
  }

  console.log(`[cleanup] removed ${orderIds.length} stale drafts`);
  return json({
    ok: true,
    deleted_orders: orderIds.length,
    deleted_files: s3Result.deleted,
    failed_files: s3Result.failed,
  });
});
