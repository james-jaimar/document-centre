import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

// ── Side-effect helpers (fire-and-forget) ───────────────────
async function triggerEmail(authHeader: string, order_id: string, event_key: string, extra: Record<string, unknown> = {}) {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    await fetch(`${url}/functions/v1/send-order-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ order_id, event_key, ...extra }),
    });
  } catch (e) {
    console.error("triggerEmail failed:", e);
  }
}

async function triggerInvoice(authHeader: string, order_id: string, kind: string) {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    await fetch(`${url}/functions/v1/generate-invoice-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ order_id, kind }),
    });
  } catch (e) {
    console.error("triggerInvoice failed:", e);
  }
}

const STATUS_EVENT_MAP: Record<string, string> = {
  in_production: "in_production",
  ready: "ready_for_collection",
  completed: "completed",
};

// ── Authenticated user client + service client ──────────────
function clients(authHeader: string) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // User-scoped client for auth verification
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Service role client for mutations (bypasses RLS)
  const admin = createClient(url, serviceKey);

  return { userClient, admin };
}

// ── Action handlers ─────────────────────────────────────────

async function createOrderWithJobs(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any
) {
  const { app_slug, tenant_id, branch_id, customer, order, billing_address, delivery_address, pricing, jobs } = payload;

  if (!app_slug || !tenant_id || !customer?.profile_id || !customer?.email || !jobs?.length) {
    return err("Missing required fields: app_slug, tenant_id, customer (profile_id, email), jobs[]");
  }

  // Resolve app_id from slug
  const { data: app, error: appErr } = await admin
    .from("apps")
    .select("id")
    .eq("slug", app_slug)
    .eq("is_active", true)
    .single();

  if (appErr || !app) return err(`App not found: ${app_slug}`, 404);
  const app_id = app.id;

  // Generate order number
  const { data: orderNum, error: numErr } = await admin.rpc("generate_order_number", { p_app_id: app_id });
  if (numErr || !orderNum) return err(`Failed to generate order number: ${numErr?.message}`);

  // Insert order
  const { data: newOrder, error: orderErr } = await admin
    .from("orders")
    .insert({
      app_id,
      tenant_id,
      branch_id: branch_id || null,
      order_number: orderNum,
      external_order_ref: order?.external_order_ref || null,
      source_channel: order?.source_channel || null,
      storefront_name: order?.storefront_name || null,
      ordered_by_profile_id: customer.profile_id,
      customer_email: customer.email,
      customer_name: customer.name || null,
      company_name: customer.company_name || null,
      user_id: customer.profile_id,
      admin_status: "new_order",
      customer_status: "awaiting_payment",
      payment_status: "unpaid",
      fulfilment_status: "pending",
      currency: pricing?.currency || order?.currency || "ZAR",
      subtotal: pricing?.subtotal || 0,
      discount_amount: pricing?.discount_amount || 0,
      delivery_amount: pricing?.delivery_amount || 0,
      vat_amount: pricing?.vat_amount || 0,
      total_amount: pricing?.total_amount || 0,
      amount_paid: pricing?.amount_paid || 0,
      amount_due: pricing?.amount_due || pricing?.total_amount || 0,
      date_required: order?.date_required || null,
      turnaround_time_text: order?.turnaround_time_text || null,
      external_code: order?.external_code || null,
      notes_customer: order?.notes_customer || null,
      metadata: order?.metadata || {},
      submitted_at: new Date().toISOString(),
    })
    .select("id, order_number")
    .single();

  if (orderErr || !newOrder) return err(`Failed to create order: ${orderErr?.message}`);

  // Build job inserts
  const jobInserts = jobs.map((j: any, idx: number) => {
    const seqNo = idx + 1;
    const jobNumber = `${orderNum}-${seqNo}`;
    return {
      order_id: newOrder.id,
      app_id,
      tenant_id,
      branch_id: branch_id || null,
      job_number: jobNumber,
      sequence_no: seqNo,
      external_product_key: j.external_product_key || null,
      product_name: j.product_name,
      product_category: j.product_category || null,
      job_name: j.job_name || null,
      quantity: j.quantity || 0,
      unit_label: j.unit_label || null,
      net_price: j.net_price || 0,
      cost_price: j.cost_price || 0,
      vat_rate: j.vat_rate ?? 15,
      gross_price: j.gross_price || 0,
      product_snapshot: j.product_snapshot || {},
      configuration: j.configuration || {},
      production_specs: j.production_specs || {},
      integration_payload: j.integration_payload || {},
    };
  });

  // Insert addresses
  const addressInserts: any[] = [];
  if (billing_address) {
    addressInserts.push({ order_id: newOrder.id, address_type: "billing", ...billing_address });
  }
  if (delivery_address) {
    addressInserts.push({ order_id: newOrder.id, address_type: "delivery", ...delivery_address });
  }

  // Run all independent post-order writes in parallel
  const [jobsResult] = await Promise.all([
    admin.from("order_jobs").insert(jobInserts).select("id, job_number, sequence_no"),
    addressInserts.length
      ? admin.from("order_addresses").insert(addressInserts)
      : Promise.resolve({ error: null }),
    pricing
      ? admin.from("order_pricing_snapshots").insert({
          order_id: newOrder.id,
          version_no: 1,
          currency: pricing.currency || "ZAR",
          subtotal: pricing.subtotal || 0,
          discount_amount: pricing.discount_amount || 0,
          delivery_amount: pricing.delivery_amount || 0,
          vat_rate: 15,
          vat_amount: pricing.vat_amount || 0,
          total_amount: pricing.total_amount || 0,
          amount_paid: pricing.amount_paid || 0,
          amount_due: pricing.amount_due || pricing.total_amount || 0,
          pricing_snapshot: pricing,
        })
      : Promise.resolve({ error: null }),
    admin.from("timeline_events").insert({
      app_id,
      tenant_id,
      branch_id: branch_id || null,
      order_id: newOrder.id,
      event_type: "order_created",
      visibility: "both",
      actor_type: "system",
      actor_profile_id: userId,
      description: `Order ${orderNum} created with ${jobs.length} job(s)`,
      metadata: { job_count: jobs.length },
    }),
    // Customer membership upsert (idempotent) — runs in parallel
    admin.from("tenant_memberships").upsert(
      {
        profile_id: customer.profile_id,
        tenant_id,
        app_id,
        role: "customer",
        is_active: true,
      },
      { onConflict: "profile_id,tenant_id,app_id", ignoreDuplicates: true }
    ),
  ]);

  if (jobsResult.error) return err(`Failed to create jobs: ${jobsResult.error.message}`);
  const newJobs = jobsResult.data;

  // Insert proofs only if any jobs request them (rare in checkout flow)
  const proofJobs = jobs
    .map((j: any, idx: number) => ({ j, newJob: newJobs?.[idx] }))
    .filter((x: any) => x.j.proof && x.newJob);

  if (proofJobs.length > 0) {
    const proofInserts = proofJobs.map(({ j, newJob }: any) => ({
      app_id,
      tenant_id,
      order_id: newOrder.id,
      job_id: newJob.id,
      proof_type: j.proof.proof_type,
      proof_status: "pending",
      viewer_type: j.proof.viewer_type,
      viewer_url: j.proof.viewer_url || null,
      document_id: j.proof.document_id || null,
      metadata: j.proof.metadata || {},
    }));
    await Promise.all([
      admin.from("job_proofs").insert(proofInserts),
      admin
        .from("order_jobs")
        .update({ proof_status: "pending" })
        .in("id", proofJobs.map((x: any) => x.newJob.id)),
    ]);
  }

  return json({
    order_id: newOrder.id,
    order_number: newOrder.order_number,
    jobs: newJobs,
  }, 201);
}

async function updateJobStatus(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any
) {
  const { job_id, job_status, reason } = payload;
  if (!job_id || !job_status) return err("Missing job_id or job_status");

  // Get current job
  const { data: job, error: jobErr } = await admin
    .from("order_jobs")
    .select("id, order_id, job_status, app_id, tenant_id, job_number")
    .eq("id", job_id)
    .single();

  if (jobErr || !job) return err("Job not found", 404);

  const fromStatus = job.job_status;

  // Update job status (trigger handles customer_job_status + rollup)
  const { error: updErr } = await admin
    .from("order_jobs")
    .update({ job_status })
    .eq("id", job_id);

  if (updErr) return err(`Failed to update: ${updErr.message}`);

  // Record status history
  await admin.from("status_history").insert({
    app_id: job.app_id,
    tenant_id: job.tenant_id,
    order_id: job.order_id,
    job_id: job.id,
    entity_type: "job",
    from_status: fromStatus,
    to_status: job_status,
    reason: reason || null,
    changed_by: userId,
  });

  // Timeline event
  await admin.from("timeline_events").insert({
    app_id: job.app_id,
    tenant_id: job.tenant_id,
    order_id: job.order_id,
    job_id: job.id,
    event_type: "job_status_changed",
    visibility: "both",
    actor_type: "admin",
    actor_profile_id: userId,
    description: `Job ${job.job_number} status changed from ${fromStatus} to ${job_status}`,
    metadata: { from_status: fromStatus, to_status: job_status, reason },
  });

  return json({ success: true, from_status: fromStatus, to_status: job_status });
}

async function recordPaymentEvent(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any
) {
  const { order_id, provider, status, amount } = payload;
  if (!order_id || !provider || !status || amount == null) {
    return err("Missing required fields: order_id, provider, status, amount");
  }

  // Get order
  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, app_id, tenant_id, order_number, amount_paid, amount_due")
    .eq("id", order_id)
    .single();

  if (oErr || !order) return err("Order not found", 404);

  // Insert payment
  const { data: payment, error: pErr } = await admin
    .from("payments")
    .insert({
      order_id,
      app_id: order.app_id,
      tenant_id: order.tenant_id,
      provider,
      provider_transaction_id: payload.provider_transaction_id || null,
      payment_reference: payload.payment_reference || null,
      status,
      amount,
      currency: payload.currency || "ZAR",
      initiated_at: status === "initiated" ? new Date().toISOString() : null,
      paid_at: status === "paid" ? new Date().toISOString() : null,
      raw_payload: payload.raw_payload || {},
      metadata: payload.metadata || {},
    })
    .select("id")
    .single();

  if (pErr) return err(`Failed to record payment: ${pErr.message}`);

  // Update order amounts if paid
  if (status === "paid") {
    const newPaid = (order.amount_paid || 0) + amount;
    const newDue = Math.max((order.amount_due || 0) - amount, 0);
    const newPaymentStatus = newDue <= 0 ? "paid" : "part_paid";

    await admin
      .from("orders")
      .update({
        amount_paid: newPaid,
        amount_due: newDue,
        payment_status: newPaymentStatus,
      })
      .eq("id", order_id);
  }

  // Status history
  await admin.from("status_history").insert({
    app_id: order.app_id,
    tenant_id: order.tenant_id,
    order_id,
    entity_type: "payment",
    from_status: null,
    to_status: status,
    changed_by: userId,
  });

  // Timeline
  await admin.from("timeline_events").insert({
    app_id: order.app_id,
    tenant_id: order.tenant_id,
    order_id,
    event_type: "payment_recorded",
    visibility: "both",
    actor_type: status === "paid" ? "system" : "admin",
    actor_profile_id: userId,
    description: `Payment of ${amount} ${payload.currency || "ZAR"} recorded (${status}) via ${provider}`,
    metadata: { payment_id: payment?.id, amount, status, provider },
  });

  return json({ success: true, payment_id: payment?.id });
}

async function refundPayment(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any
) {
  const { order_id, amount, reason } = payload;
  if (!order_id || amount == null) return err("Missing order_id or amount");

  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, app_id, tenant_id, order_number, amount_paid, currency")
    .eq("id", order_id)
    .single();
  if (oErr || !order) return err("Order not found", 404);

  const refundAmt = Number(amount);
  if (refundAmt <= 0) return err("Refund amount must be positive");
  if (refundAmt > Number(order.amount_paid)) return err("Refund exceeds amount paid");

  const { data: payment, error: pErr } = await admin
    .from("payments")
    .insert({
      order_id,
      app_id: order.app_id,
      tenant_id: order.tenant_id,
      provider: payload.provider || "manual",
      status: "refunded",
      amount: -refundAmt,
      currency: order.currency,
      payment_reference: reason || "Refund",
      paid_at: new Date().toISOString(),
      metadata: { reason },
    })
    .select("id")
    .single();
  if (pErr) return err(`Failed to record refund: ${pErr.message}`);

  const newPaid = Math.max(Number(order.amount_paid) - refundAmt, 0);
  const fullyRefunded = newPaid <= 0;

  await admin
    .from("orders")
    .update({
      amount_paid: newPaid,
      payment_status: fullyRefunded ? "refunded" : "part_paid",
    })
    .eq("id", order_id);

  await admin.from("status_history").insert({
    app_id: order.app_id,
    tenant_id: order.tenant_id,
    order_id,
    entity_type: "payment",
    from_status: "paid",
    to_status: "refunded",
    reason: reason || null,
    changed_by: userId,
  });

  await admin.from("timeline_events").insert({
    app_id: order.app_id,
    tenant_id: order.tenant_id,
    order_id,
    event_type: "payment_refunded",
    visibility: "both",
    actor_type: "admin",
    actor_profile_id: userId,
    description: `Refund of ${refundAmt} ${order.currency} processed`,
    metadata: { payment_id: payment?.id, amount: refundAmt, reason },
  });

  return json({ success: true, payment_id: payment?.id });
}

async function uploadOrderDocument(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any
) {
  const { order_id, job_id, document_type, file_name, storage_bucket, storage_path } = payload;
  if (!document_type || !file_name || !storage_path) {
    return err("Missing required fields: document_type, file_name, storage_path");
  }
  if (!order_id && !job_id) {
    return err("Must provide order_id or job_id");
  }

  // Resolve app_id/tenant_id from order or job
  let app_id: string, tenant_id: string, branch_id: string | null = null, resolved_order_id = order_id;

  if (job_id) {
    const { data: job } = await admin
      .from("order_jobs")
      .select("app_id, tenant_id, branch_id, order_id")
      .eq("id", job_id)
      .single();
    if (!job) return err("Job not found", 404);
    app_id = job.app_id;
    tenant_id = job.tenant_id;
    branch_id = job.branch_id;
    resolved_order_id = job.order_id;
  } else {
    const { data: order } = await admin
      .from("orders")
      .select("app_id, tenant_id, branch_id")
      .eq("id", order_id)
      .single();
    if (!order) return err("Order not found", 404);
    app_id = order.app_id;
    tenant_id = order.tenant_id;
    branch_id = order.branch_id;
  }

  const { data: doc, error: docErr } = await admin
    .from("order_documents")
    .insert({
      app_id,
      tenant_id,
      branch_id,
      order_id: resolved_order_id,
      job_id: job_id || null,
      document_type,
      title: payload.title || null,
      file_name,
      storage_bucket: storage_bucket || "documents",
      storage_path,
      public_url: payload.public_url || null,
      mime_type: payload.mime_type || null,
      file_size_bytes: payload.file_size_bytes || null,
      is_customer_visible: payload.is_customer_visible ?? false,
      source_app_managed: payload.source_app_managed ?? false,
      metadata: payload.metadata || {},
      created_by: userId,
    })
    .select("id")
    .single();

  if (docErr) return err(`Failed to attach document: ${docErr.message}`);

  // Timeline
  await admin.from("timeline_events").insert({
    app_id,
    tenant_id,
    branch_id,
    order_id: resolved_order_id,
    job_id: job_id || null,
    event_type: "document_attached",
    visibility: payload.is_customer_visible ? "both" : "admin",
    actor_type: "admin",
    actor_profile_id: userId,
    description: `Document "${file_name}" (${document_type}) attached`,
    metadata: { document_id: doc?.id, document_type },
  });

  return json({ success: true, document_id: doc?.id }, 201);
}

async function createJobProof(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any
) {
  const { job_id, proof_type, viewer_type } = payload;
  if (!job_id || !proof_type || !viewer_type) {
    return err("Missing required fields: job_id, proof_type, viewer_type");
  }

  const { data: job } = await admin
    .from("order_jobs")
    .select("id, order_id, app_id, tenant_id, job_number")
    .eq("id", job_id)
    .single();

  if (!job) return err("Job not found", 404);

  const { data: proof, error: proofErr } = await admin
    .from("job_proofs")
    .insert({
      app_id: job.app_id,
      tenant_id: job.tenant_id,
      order_id: job.order_id,
      job_id,
      proof_type,
      proof_status: "pending",
      viewer_type,
      viewer_url: payload.viewer_url || null,
      document_id: payload.document_id || null,
      metadata: payload.metadata || {},
    })
    .select("id")
    .single();

  if (proofErr) return err(`Failed to create proof: ${proofErr.message}`);

  // Update job proof_status
  await admin
    .from("order_jobs")
    .update({ proof_status: "pending" })
    .eq("id", job_id);

  // Timeline
  await admin.from("timeline_events").insert({
    app_id: job.app_id,
    tenant_id: job.tenant_id,
    order_id: job.order_id,
    job_id,
    event_type: "proof_created",
    visibility: "both",
    actor_type: "admin",
    actor_profile_id: userId,
    description: `Proof created for job ${job.job_number} (${proof_type})`,
    metadata: { proof_id: proof?.id, proof_type, viewer_type },
  });

  return json({ success: true, proof_id: proof?.id }, 201);
}

async function sendMessage(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any
) {
  const { order_id, job_id, message_body, sender_type, is_internal } = payload;
  if (!order_id || !message_body || !sender_type) {
    return err("Missing required fields: order_id, message_body, sender_type");
  }

  // Resolve app context from order
  const { data: order } = await admin
    .from("orders")
    .select("app_id, tenant_id, branch_id, order_number")
    .eq("id", order_id)
    .single();

  if (!order) return err("Order not found", 404);

  const { data: msg, error: msgErr } = await admin
    .from("messages")
    .insert({
      app_id: order.app_id,
      tenant_id: order.tenant_id,
      branch_id: order.branch_id,
      order_id,
      job_id: job_id || null,
      sender_profile_id: userId,
      sender_type,
      recipient_type: payload.recipient_type || "thread",
      message_body,
      is_internal: is_internal ?? false,
    })
    .select("id, created_at")
    .single();

  if (msgErr) return err(`Failed to send message: ${msgErr.message}`);

  // Timeline event (internal messages only visible to admin)
  await admin.from("timeline_events").insert({
    app_id: order.app_id,
    tenant_id: order.tenant_id,
    branch_id: order.branch_id,
    order_id,
    job_id: job_id || null,
    event_type: "message_sent",
    visibility: is_internal ? "admin" : "both",
    actor_type: sender_type,
    actor_profile_id: userId,
    description: is_internal
      ? `Internal note added on order ${order.order_number}`
      : `Message sent on order ${order.order_number}`,
    metadata: { message_id: msg?.id, is_internal },
  });

  return json({ success: true, message_id: msg?.id, created_at: msg?.created_at }, 201);
}

// ── Main handler ────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return err("Unauthorized", 401);
    }

    const { userClient, admin } = clients(authHeader);

    // Verify user
    const { data: { user: authedUser }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authedUser) {
      return err("Unauthorized", 401);
    }
    const userId = authedUser.id;

    // Parse body
    const body = await req.json();
    const { action, ...payload } = body;

    if (!action) return err("Missing 'action' field");

    let response: Response;
    let sideEffects: (() => Promise<void>) | null = null;

    switch (action) {
      case "createOrderWithJobs": {
        response = await createOrderWithJobs(admin, userId, payload);
        if (response.status === 201) {
          const data = await response.clone().json();
          if (data?.order_id) {
            sideEffects = async () => {
              await Promise.all([
                triggerInvoice(authHeader, data.order_id, "proforma"),
                triggerEmail(authHeader, data.order_id, "order_received"),
              ]);
            };
          }
        }
        break;
      }
      case "updateJobStatus": {
        response = await updateJobStatus(admin, userId, payload);
        if (response.ok) {
          const data = await response.clone().json();
          const eventKey = STATUS_EVENT_MAP[data?.to_status];
          if (eventKey && payload.job_id) {
            sideEffects = async () => {
              const { data: j } = await admin
                .from("order_jobs")
                .select("order_id")
                .eq("id", payload.job_id)
                .single();
              if (j?.order_id) await triggerEmail(authHeader, j.order_id, eventKey);
            };
          }
        }
        break;
      }
      case "recordPaymentEvent": {
        response = await recordPaymentEvent(admin, userId, payload);
        if (response.ok && payload.status === "paid" && payload.order_id) {
          sideEffects = async () => {
            await Promise.all([
              triggerInvoice(authHeader, payload.order_id, "invoice"),
              triggerEmail(authHeader, payload.order_id, "payment_received"),
            ]);
          };
        }
        break;
      }
      case "refundPayment": {
        response = await refundPayment(admin, userId, payload);
        if (response.ok && payload.order_id) {
          sideEffects = async () => {
            await Promise.all([
              triggerInvoice(authHeader, payload.order_id, "credit_note"),
              triggerEmail(authHeader, payload.order_id, "refunded", { refund_amount: payload.amount }),
            ]);
          };
        }
        break;
      }
      case "attachOrderDocument":
        response = await attachOrderDocument(admin, userId, payload);
        break;
      case "createJobProof":
        response = await createJobProof(admin, userId, payload);
        break;
      case "sendMessage":
        response = await sendMessage(admin, userId, payload);
        break;
      case "generateInvoice": {
        if (!payload.order_id) {
          response = err("order_id required");
        } else {
          await triggerInvoice(authHeader, payload.order_id, payload.kind || "invoice");
          response = json({ success: true });
        }
        break;
      }
      default:
        return err(`Unknown action: ${action}`, 400);
    }

    if (sideEffects) sideEffects().catch((e) => console.error("sideEffects:", e));
    return response;
  } catch (e) {
    console.error("order-engine error:", e);
    return err("Internal server error", 500);
  }
});
