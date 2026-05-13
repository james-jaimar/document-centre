// Production PDF orchestrator
//
// Three actions:
//   - assemble : merge the job's section PDFs into a single print-ready PDF,
//                save the path to order_jobs.print_ready_pdf_path
//   - impose   : (placeholder) reserve a slot for sheet imposition once the
//                pdf-server `assemble-print-ready` op is in place
//   - ticket   : generate a one-page job ticket (placeholder)
//
// Calls the Document Centre API (pdf-server) via fetch using VPS_PDF_API_URL +
// VPS_PDF_API_KEY, then writes the resulting storage path back to order_jobs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const { action, job_id } = body ?? {};
    if (!job_id || !["assemble", "impose", "ticket"].includes(action)) {
      return json({ error: "Invalid request" }, 400);
    }

    // Service-role client for cross-table ops + RLS bypass
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authorise: caller must be staff (owner/admin/production) of the job's tenant
    const { data: job, error: jobErr } = await admin
      .from("order_jobs")
      .select("id, order_id, tenant_id, app_id, job_number, product_name, quantity")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) return json({ error: "Job not found" }, 404);

    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("role")
      .eq("profile_id", userId)
      .eq("tenant_id", job.tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership || !["owner", "admin", "production", "sales"].includes(membership.role)) {
      // Allow platform admins
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const isPlatformAdmin = (roles ?? []).some((r: any) => r.role === "platform_admin");
      if (!isPlatformAdmin) return json({ error: "Forbidden" }, 403);
    }

    if (action === "assemble") {
      return await assemble(admin, job);
    }
    if (action === "impose") {
      return json({ error: "Imposition pipeline not yet deployed on pdf-server. Coming next." }, 501);
    }
    if (action === "ticket") {
      return await generateTicket(admin, job);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[production-pdf] error", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});

async function assemble(admin: any, job: any) {
  // Collect ordered section asset IDs for this job
  const { data: docs, error: docsErr } = await admin
    .from("order_documents")
    .select("id, storage_path, file_name, metadata")
    .eq("job_id", job.id)
    .order("created_at", { ascending: true });
  if (docsErr) return json({ error: docsErr.message }, 500);

  // Resolve assets via documents.backend_asset_id where possible
  const { data: customerDocs } = await admin
    .from("documents")
    .select("id, backend_asset_id, sort_order")
    .in(
      "order_item_id",
      // documents are keyed off order_items, so resolve via order_jobs.order_id → items
      (await admin.from("order_items").select("id").eq("order_id", job.order_id)).data?.map(
        (oi: any) => oi.id
      ) ?? []
    )
    .order("sort_order", { ascending: true });

  const assetIds = (customerDocs ?? [])
    .map((d: any) => d.backend_asset_id)
    .filter((id: string | null): id is string => !!id);

  if (assetIds.length === 0) {
    return json(
      { error: "No source PDFs available. Customer hasn't uploaded files yet." },
      400
    );
  }

  const apiUrl = Deno.env.get("VPS_PDF_API_URL");
  const apiKey = Deno.env.get("VPS_PDF_API_KEY");
  if (!apiUrl || !apiKey) return json({ error: "PDF API not configured" }, 500);

  const outputName = `${job.job_number}-print-ready.pdf`;
  const mergeRes = await fetch(`${apiUrl}/v1/operations/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ asset_ids: assetIds, output_filename: outputName }),
  });

  if (!mergeRes.ok) {
    const txt = await mergeRes.text();
    return json({ error: `Merge failed: ${mergeRes.status} ${txt}` }, 502);
  }
  const mergeData = await mergeRes.json();
  const jobId = mergeData.job_id;

  // Poll the merge job until completion (max 60s)
  let storagePath: string | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(`${apiUrl}/v1/jobs/${jobId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    if (statusData.status === "completed") {
      storagePath = statusData.result?.storage_path ?? statusData.result?.path ?? null;
      break;
    }
    if (statusData.status === "failed") {
      return json({ error: `Merge failed: ${statusData.error}` }, 502);
    }
  }
  if (!storagePath) return json({ error: "Merge timed out" }, 504);

  await admin
    .from("order_jobs")
    .update({ print_ready_pdf_path: storagePath })
    .eq("id", job.id);

  return json({ ok: true, path: storagePath, asset_count: assetIds.length });
}

async function generateTicket(admin: any, job: any) {
  // Minimal placeholder: store a marker path for now. Real ticket generation
  // happens once the pdf-server has the `render-job-ticket` op.
  const path = `production/tickets/${job.id}.pdf`;
  await admin.from("order_jobs").update({ job_ticket_pdf_path: path }).eq("id", job.id);
  return json({
    ok: true,
    path,
    note: "Ticket pipeline not yet deployed — placeholder path saved.",
  });
}
