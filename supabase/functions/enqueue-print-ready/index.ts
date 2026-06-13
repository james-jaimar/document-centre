// Fan-out edge function: when an order is paid, on-account, or admin-
// approved, kick off smart print-ready assembly AND job-ticket generation
// for each of its jobs by invoking production-pdf.
//
// Called by the `trg_orders_payment_print_ready` trigger via pg_net, or
// manually from the admin UI as a Retry.
//
// Best-effort — per-job failures are written to order_jobs.auto_assemble_error
// and surface in the admin UI as an amber warning badge with a Retry button.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

// Shared internal token. Matches the value inlined in the
// notify_enqueue_print_ready() trigger function. Internal-only — never
// exposed to clients. Either this header OR a service-role bearer is
// accepted (service-role for admin UI retries).
const INTERNAL_WEBHOOK_TOKEN =
  "df650cd4215c0255870aa6e97f733e3c6cc4f1f1a406627d66510567454988a6";

// RGB-only families (photo prints etc) don't need a CMYK/grayscale
// print-ready PDF — the customer's upload is already the deliverable.
const RGB_CATEGORIES = new Set(["photo_print", "photo_prints", "photo"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Accept either the shared internal webhook token (from the DB trigger)
    // or a service-role bearer (from admin UI Retry).
    const webhookToken = req.headers.get("X-Webhook-Token") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const isTrustedTrigger = webhookToken === INTERNAL_WEBHOOK_TOKEN;
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;
    if (!isTrustedTrigger && !isServiceRole) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { order_id, force } = await req.json();
    if (!order_id) return json({ error: "order_id required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const { data: jobs, error } = await admin
      .from("order_jobs")
      .select(
        "id, job_status, product_category, print_ready_pdf_path, job_ticket_pdf_path",
      )
      .eq("order_id", order_id);
    if (error) return json({ error: error.message }, 500);
    if (!jobs?.length) return json({ ok: true, jobs: 0 });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const callProductionPdf = async (
      action: "assemble" | "ticket",
      jobId: string,
    ) => {
      const res = await fetch(`${supabaseUrl}/functions/v1/production-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ action, job_id: jobId, force: !!force }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${action} HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const body = await res.json().catch(() => ({}));
      if (body?.error) throw new Error(`${action}: ${body.error}`);
      return body;
    };

    // Per job: run assemble + ticket in parallel. Errors are captured to
    // order_jobs columns; one job's failure does not block siblings.
    const results = await Promise.allSettled(
      jobs.map(async (j: any) => {
        const isRgb = RGB_CATEGORIES.has(
          String(j.product_category ?? "").toLowerCase(),
        );
        const needsAssemble = !isRgb && (force || !j.print_ready_pdf_path);
        const needsTicket = force || !j.job_ticket_pdf_path;

        const tasks: Promise<unknown>[] = [];
        if (needsAssemble) tasks.push(callProductionPdf("assemble", j.id));
        if (needsTicket) tasks.push(callProductionPdf("ticket", j.id));

        if (!tasks.length) {
          return { job_id: j.id, skipped: true };
        }

        try {
          await Promise.all(tasks);
          // Clear any previous failure record on success.
          await admin
            .from("order_jobs")
            .update({
              auto_assemble_error: null,
              auto_assemble_failed_at: null,
            })
            .eq("id", j.id);
          return { job_id: j.id, ok: true };
        } catch (e) {
          const msg = (e as Error).message ?? String(e);
          await admin
            .from("order_jobs")
            .update({
              auto_assemble_error: msg.slice(0, 1000),
              auto_assemble_failed_at: new Date().toISOString(),
            })
            .eq("id", j.id);
          return { job_id: j.id, error: msg };
        }
      }),
    );

    return json({
      ok: true,
      order_id,
      dispatched: results.length,
      results: results.map((r) =>
        r.status === "fulfilled" ? r.value : { error: String(r.reason) },
      ),
    });
  } catch (e) {
    console.error("[enqueue-print-ready] error", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});
