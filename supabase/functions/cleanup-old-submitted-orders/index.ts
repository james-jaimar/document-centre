// Daily cleanup of source files for submitted orders older than 12 months.
//
// We KEEP the order, order_items, order_jobs, invoices, addresses and pricing
// snapshots so customers can still see their history and reorder shells. We
// only purge the heavy artefacts: source PDFs in S3 and their `documents` rows
// (which include thumbnails). The order can be re-uploaded later to reorder.
//
// Triggered by pg_cron via net.http_post.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { deleteS3Objects } from "../_shared/s3Delete.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RETENTION_MONTHS = 12;

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

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  const cutoffIso = cutoff.toISOString();

  const { data: oldOrders, error: ordersErr } = await admin
    .from("orders")
    .select("id")
    .not("submitted_at", "is", null)
    .lt("submitted_at", cutoffIso)
    .limit(2000);

  if (ordersErr) {
    console.error("[retention] query failed", ordersErr);
    return json({ error: ordersErr.message }, 500);
  }

  const orderIds = (oldOrders ?? []).map((o) => o.id);
  if (orderIds.length === 0) {
    return json({ ok: true, purged_orders: 0, deleted_files: 0, cutoff: cutoffIso });
  }

  const { data: items } = await admin
    .from("order_items")
    .select("id")
    .in("order_id", orderIds);
  const itemIds = (items ?? []).map((i) => i.id);
  if (itemIds.length === 0) {
    return json({ ok: true, purged_orders: orderIds.length, deleted_files: 0, cutoff: cutoffIso });
  }

  const { data: docs } = await admin
    .from("documents")
    .select("id, file_path")
    .in("order_item_id", itemIds);

  const filePaths = (docs ?? []).map((d) => d.file_path).filter(Boolean) as string[];
  const docIds = (docs ?? []).map((d) => d.id);

  let s3Result = { deleted: 0, failed: [] as string[] };
  if (filePaths.length > 0) {
    s3Result = await deleteS3Objects(filePaths);
  }

  if (docIds.length > 0) {
    await admin.from("document_sections").delete().in("document_id", docIds);
    await admin.from("documents").delete().in("id", docIds);
  }

  console.log(
    `[retention] purged files for ${orderIds.length} orders, s3=${s3Result.deleted}`,
  );
  return json({
    ok: true,
    purged_orders: orderIds.length,
    deleted_files: s3Result.deleted,
    failed_files: s3Result.failed.slice(0, 20),
    cutoff: cutoffIso,
  });
});
