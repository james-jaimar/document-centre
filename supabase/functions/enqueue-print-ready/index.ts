// Fan-out edge function: when an order is paid, kick off smart
// print-ready assembly for each of its jobs by invoking production-pdf.
//
// Called by the `trg_orders_payment_print_ready` trigger via pg_net.
// Best-effort — if production-pdf is busy or fails, operators can
// always re-run from the production panel.

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
    // Internal-only: require service-role bearer (called by pg_net trigger
    // or other trusted edge functions). Rejects unauthenticated callers.
    const authHeader = req.headers.get("Authorization") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (authHeader !== `Bearer ${serviceKey}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { order_id, force } = await req.json();
    if (!order_id) return json({ error: "order_id required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
    );

    const { data: jobs, error } = await admin
      .from("order_jobs")
      .select("id, job_status")
      .eq("order_id", order_id);
    if (error) return json({ error: error.message }, 500);
    if (!jobs?.length) return json({ ok: true, jobs: 0 });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Fire each assemble in parallel; production-pdf polls the pdf-server
    // and returns when done. We don't wait for the result here — pg_net
    // imposes its own short timeout on the inbound call.
    const results = await Promise.allSettled(
      jobs.map(async (j) => {
        const res = await fetch(`${supabaseUrl}/functions/v1/production-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ action: "assemble", job_id: j.id, force: !!force }),
        });
        return { job_id: j.id, status: res.status };
      }),
    );

    return json({
      ok: true,
      order_id,
      dispatched: results.length,
      results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
    });
  } catch (e) {
    console.error("[enqueue-print-ready] error", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});
