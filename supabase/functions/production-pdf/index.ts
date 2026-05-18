// Production PDF orchestrator (thin proxy).
//
// All real PDF work happens on the pdf-server (VPS) where Ghostscript,
// pikepdf, qpdf, ICC profiles, fonts and ReportLab live. This function
// only:
//   1. Authorises the caller (tenant staff or platform admin)
//   2. Forwards { job_id } to the matching pdf-server endpoint
//   3. Polls the pdf-server job until it completes
//   4. Returns the resulting storage path
//
// The pdf-server itself writes the path back to order_jobs.{column} via
// service-role Supabase access, so this function doesn't need to update
// the DB on success.

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

const ENDPOINTS: Record<string, string> = {
  assemble: "/v1/operations/assemble-print-ready",
  impose: "/v1/operations/assemble-imposed-sheet",
  ticket: "/v1/operations/render-job-ticket",
};

const COLUMN: Record<string, string> = {
  assemble: "print_ready_pdf_path",
  impose: "imposed_pdf_path",
  ticket: "job_ticket_pdf_path",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.slice("Bearer ".length).trim();
    const isInternal = token === serviceRoleKey;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

    const body = await req.json();
    const { action, job_id, imposition_template_id, force } = body ?? {};
    if (!job_id || !ENDPOINTS[action]) return json({ error: "Invalid request" }, 400);
    if (action === "impose" && !imposition_template_id) {
      return json({ error: "imposition_template_id is required for impose action" }, 400);
    }

    const { data: job, error: jobErr } = await admin
      .from("order_jobs")
      .select("id, tenant_id")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) return json({ error: "Job not found" }, 404);

    if (!isInternal) {
      // User-initiated call (operator clicking a button) — verify staff role.
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        serviceRoleKey,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
      const userId = userData.user.id;

      const { data: membership } = await admin
        .from("tenant_memberships")
        .select("role")
        .eq("profile_id", userId)
        .eq("tenant_id", job.tenant_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!membership || !["owner", "admin", "production", "sales"].includes(membership.role)) {
        const { data: roles } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        const isPlatformAdmin = (roles ?? []).some((r: any) => r.role === "platform_admin");
        if (!isPlatformAdmin) return json({ error: "Forbidden" }, 403);
      }
    }

    // Use the same base URL as the pdf-api proxy (single source of truth).
    // Falls back to the legacy VPS_PDF_API_URL secret if DOCUMENT_CENTRE_API_URL is unset.
    const apiUrl = (Deno.env.get("DOCUMENT_CENTRE_API_URL") ?? Deno.env.get("VPS_PDF_API_URL") ?? "").replace(/\/+$/, "");
    const apiKey = Deno.env.get("VPS_PDF_API_KEY");
    if (!apiUrl) return json({ error: "PDF API not configured (DOCUMENT_CENTRE_API_URL missing)" }, 500);

    // Persist the chosen template on the job so the worker can read it.
    if (action === "impose" && imposition_template_id) {
      await admin
        .from("order_jobs")
        .update({ imposition_template_id })
        .eq("id", job_id);
    }

    const dispatchRes = await fetch(`${apiUrl}${ENDPOINTS[action]}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        job_id,
        imposition_template_id: imposition_template_id ?? null,
        force: !!force,
      }),
    });
    if (!dispatchRes.ok) {
      const txt = await dispatchRes.text();
      return json({ error: `pdf-server dispatch failed: ${dispatchRes.status} ${txt}` }, 502);
    }
    const { job_id: pdfJobId } = await dispatchRes.json();
    if (!pdfJobId) return json({ error: "pdf-server returned no job id" }, 502);

    // Poll up to 90s
    let storagePath: string | null = null;
    let lastError: string | null = null;
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(`${apiUrl}/v1/jobs/${pdfJobId}`, {
        headers: { "x-api-key": apiKey },
      });
      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();
      if (statusData.status === "completed") {
        storagePath = statusData.result?.storage_path ?? null;
        break;
      }
      if (statusData.status === "failed") {
        lastError = statusData.error ?? "Unknown failure";
        break;
      }
    }

    if (!storagePath) {
      return json({ error: lastError ?? "Operation timed out" }, lastError ? 502 : 504);
    }

    // Defensive: ensure the column is updated even if the worker raced us.
    await admin
      .from("order_jobs")
      .update({ [COLUMN[action]]: storagePath })
      .eq("id", job_id);

    return json({ ok: true, path: storagePath, action });
  } catch (e) {
    console.error("[production-pdf] error", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});
