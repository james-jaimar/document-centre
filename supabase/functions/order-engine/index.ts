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
async function isDemoOrder(admin: ReturnType<typeof createClient>, order_id: string): Promise<boolean> {
  try {
    const { data } = await admin.from("orders").select("is_demo").eq("id", order_id).maybeSingle();
    return !!(data as any)?.is_demo;
  } catch { return false; }
}

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
  const { app_slug, tenant_id, branch_id, customer, order, billing_address, delivery_address, fulfillment_type, pricing, jobs } = payload;

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

  if (appErr || !app) {
    console.error("[order-engine] app_lookup failed", { app_slug, error: appErr });
    return err(`app_lookup failed: ${appErr?.message ?? `unknown app ${app_slug}`}`, 404);
  }
  const app_id = app.id;

  // Generate order number
  const { data: orderNum, error: numErr } = await admin.rpc("generate_order_number", { p_app_id: app_id });
  if (numErr || !orderNum) {
    console.error("[order-engine] generate_order_number failed", numErr);
    return err(`generate_order_number failed: ${numErr?.message ?? "no number returned"}`);
  }

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
      fulfillment_type: fulfillment_type || (delivery_address ? "delivery" : (branch_id ? "collection" : null)),
      external_code: order?.external_code || null,
      notes_customer: order?.notes_customer || null,
      metadata: order?.metadata || {},
      submitted_at: new Date().toISOString(),
      is_demo: payload.is_demo === true,
    })
    .select("id, order_number, is_demo")
    .single();

  if (orderErr || !newOrder) {
    console.error("[order-engine] order_insert failed", orderErr);
    return err(`order_insert failed: ${orderErr?.message ?? "unknown"}`);
  }

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

  // Idempotent customer membership: select-then-insert. The unique index on
  // tenant_memberships includes branch_id + role, which makes ON CONFLICT
  // unreliable across callers — a defensive select avoids that whole class
  // of bugs.
  const ensureMembership = (async () => {
    const { data: existing } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("profile_id", customer.profile_id)
      .eq("tenant_id", tenant_id)
      .eq("app_id", app_id)
      .eq("role", "customer")
      .is("branch_id", null)
      .limit(1)
      .maybeSingle();
    if (existing) return { error: null };
    return await admin.from("tenant_memberships").insert({
      profile_id: customer.profile_id,
      tenant_id,
      app_id,
      role: "customer",
      is_active: true,
    });
  })();

  // Run all independent post-order writes in parallel
  const [jobsResult, addressesResult, pricingResult, timelineResult, membershipResult] = await Promise.all([
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
    ensureMembership,
  ]);

  if (jobsResult.error) {
    console.error("[order-engine] jobs_insert failed", jobsResult.error);
    return err(`jobs_insert failed: ${jobsResult.error.message}`);
  }
  if ((addressesResult as any)?.error) {
    console.error("[order-engine] addresses_insert failed", (addressesResult as any).error);
    return err(`addresses_insert failed: ${(addressesResult as any).error.message}`);
  }
  if ((pricingResult as any)?.error) {
    console.error("[order-engine] pricing_snapshot_insert failed", (pricingResult as any).error);
    return err(`pricing_snapshot_insert failed: ${(pricingResult as any).error.message}`);
  }
  if ((timelineResult as any)?.error) {
    console.error("[order-engine] timeline_insert failed", (timelineResult as any).error);
    return err(`timeline_insert failed: ${(timelineResult as any).error.message}`);
  }
  if ((membershipResult as any)?.error) {
    console.error("[order-engine] membership_upsert failed", (membershipResult as any).error);
    return err(`membership_upsert failed: ${(membershipResult as any).error.message}`);
  }
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

async function cancelOrder(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any
) {
  const { order_id, reason } = payload;
  if (!order_id) return err("Missing order_id");
  if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
    return err("A cancellation reason is required");
  }

  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, app_id, tenant_id, branch_id, order_number, admin_status, order_status, payment_status, amount_paid")
    .eq("id", order_id)
    .single();
  if (oErr || !order) return err("Order not found", 404);

  if (order.admin_status === "cancelled" || order.order_status === "cancelled") {
    return err("Order is already cancelled");
  }
  if (order.admin_status === "completed") {
    return err("Completed orders cannot be cancelled");
  }

  // Permission: tenant owner or admin only
  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("role")
    .eq("profile_id", userId)
    .eq("tenant_id", order.tenant_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return err("Only tenant owners or admins can cancel orders", 403);
  }

  const refundPending = Number(order.amount_paid) > 0;

  // Cancel non-completed/non-cancelled jobs
  const { error: jobsErr } = await admin
    .from("order_jobs")
    .update({ job_status: "cancelled" })
    .eq("order_id", order_id)
    .not("job_status", "in", "(completed,cancelled)");
  if (jobsErr) return err(`Failed to cancel jobs: ${jobsErr.message}`);

  // Cancel the order itself
  const { error: updErr } = await admin
    .from("orders")
    .update({
      admin_status: "cancelled",
      order_status: "cancelled",
      customer_status: "cancelled",
      fulfilment_status: "cancelled",
      completed_at: new Date().toISOString(),
    })
    .eq("id", order_id);
  if (updErr) return err(`Failed to cancel order: ${updErr.message}`);

  await Promise.all([
    admin.from("status_history").insert({
      app_id: order.app_id,
      tenant_id: order.tenant_id,
      order_id,
      entity_type: "order",
      from_status: order.admin_status,
      to_status: "cancelled",
      reason,
      changed_by: userId,
    }),
    admin.from("timeline_events").insert({
      app_id: order.app_id,
      tenant_id: order.tenant_id,
      branch_id: order.branch_id,
      order_id,
      event_type: "order_cancelled",
      visibility: "both",
      actor_type: "admin",
      actor_profile_id: userId,
      description: `Order ${order.order_number} cancelled${refundPending ? " (refund pending)" : ""}: ${reason}`,
      metadata: { reason, refund_pending: refundPending, amount_paid: order.amount_paid },
    }),
  ]);

  return json({ success: true, refund_pending: refundPending });
}

// ── Admin-only order editing ────────────────────────────────

async function requireTenantAdmin(
  admin: ReturnType<typeof createClient>,
  userId: string,
  tenant_id: string,
): Promise<string | null> {
  const { data } = await admin
    .from("tenant_memberships")
    .select("role")
    .eq("profile_id", userId)
    .eq("tenant_id", tenant_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!data || !["owner", "admin"].includes((data as any).role)) {
    return "Only tenant owners or admins can perform this action";
  }
  return null;
}

async function fetchOrderForAdmin(
  admin: ReturnType<typeof createClient>,
  userId: string,
  order_id: string,
) {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, app_id, tenant_id, branch_id, order_number, payment_status, amount_paid, total_amount, amount_due, customer_email, ordered_by_profile_id, fulfillment_type, delivery_amount, discount_amount, vat_amount, subtotal, currency, metadata")
    .eq("id", order_id)
    .maybeSingle();
  if (error || !order) return { error: "Order not found", order: null };
  const denied = await requireTenantAdmin(admin, userId, order.tenant_id as string);
  if (denied) return { error: denied, order: null };
  return { error: null, order };
}

async function logTimeline(
  admin: ReturnType<typeof createClient>,
  o: any,
  userId: string,
  event_type: string,
  description: string,
  metadata: Record<string, unknown> = {},
  visibility: "admin" | "customer" | "both" = "admin",
) {
  await admin.from("timeline_events").insert({
    app_id: o.app_id,
    tenant_id: o.tenant_id,
    branch_id: o.branch_id,
    order_id: o.id,
    event_type,
    visibility,
    actor_type: "admin",
    actor_profile_id: userId,
    description,
    metadata,
  });
}

/**
 * After any pricing mutation, call sync_order_amounts (SECURITY DEFINER RPC
 * in DB) — but it's not exposed. We re-read totals, then if the total
 * increased above amount_paid on a previously-paid order, notify customer.
 */
async function recomputeAndNotify(
  admin: ReturnType<typeof createClient>,
  authHeader: string,
  order_id: string,
  prevPaymentStatus: string,
) {
  // Trigger DB recompute by calling the function via direct SQL (no RPC wrapper exists)
  // Workaround: bump updated_at via an UPDATE that re-derives nothing — we instead
  // rely on the fact that our edge function already updated the relevant columns,
  // then re-derive subtotal/total/amount_due/payment_status from current values.
  const { data: jobs } = await admin
    .from("order_jobs")
    .select("net_price")
    .eq("order_id", order_id);
  const { data: adjs } = await admin
    .from("order_adjustments")
    .select("amount")
    .eq("order_id", order_id);
  const { data: o } = await admin
    .from("orders")
    .select("discount_amount, delivery_amount, vat_amount, amount_paid")
    .eq("id", order_id)
    .single();

  const jobsTotal = (jobs ?? []).reduce((s, j: any) => s + Number(j.net_price || 0), 0);
  const adjTotal = (adjs ?? []).reduce((s, a: any) => s + Number(a.amount || 0), 0);
  const subtotal = jobsTotal + adjTotal;
  const total = Math.round((subtotal - Number((o as any).discount_amount || 0) + Number((o as any).delivery_amount || 0) + Number((o as any).vat_amount || 0)) * 100) / 100;
  const paid = Number((o as any).amount_paid || 0);
  const due = Math.round((total - paid) * 100) / 100;
  const payment_status = paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial";

  await admin
    .from("orders")
    .update({ subtotal, total_amount: total, amount_due: due, payment_status, updated_at: new Date().toISOString() })
    .eq("id", order_id);

  // If order was paid and now has a positive due amount, trigger payment request email
  if (prevPaymentStatus === "paid" && due > 0.005) {
    try {
      const url = Deno.env.get("SUPABASE_URL")!;
      await fetch(`${url}/functions/v1/send-order-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ order_id, event_key: "payment_request", force: true }),
      });
    } catch (e) {
      console.error("payment_request email failed:", e);
    }
  }
}

async function updateOrderPricing(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any,
) {
  const { order_id, fulfillment_type, delivery_amount, discount_amount, vat_amount, delivery_description } = payload;
  if (!order_id) return err("order_id required");

  const { error: denied, order } = await fetchOrderForAdmin(admin, userId, order_id);
  if (denied) return err(denied, 403);

  const o = order as any;
  const updates: Record<string, unknown> = {};
  const changes: string[] = [];

  if (typeof fulfillment_type === "string" && fulfillment_type !== o.fulfillment_type) {
    updates.fulfillment_type = fulfillment_type;
    changes.push(`fulfillment ${o.fulfillment_type ?? "—"} → ${fulfillment_type}`);
  }
  if (delivery_amount !== undefined && Number(delivery_amount) !== Number(o.delivery_amount)) {
    updates.delivery_amount = Number(delivery_amount);
    changes.push(`delivery R${Number(o.delivery_amount).toFixed(2)} → R${Number(delivery_amount).toFixed(2)}`);
  }
  if (discount_amount !== undefined && Number(discount_amount) !== Number(o.discount_amount)) {
    updates.discount_amount = Number(discount_amount);
    changes.push(`discount R${Number(o.discount_amount).toFixed(2)} → R${Number(discount_amount).toFixed(2)}`);
  }
  if (vat_amount !== undefined && Number(vat_amount) !== Number(o.vat_amount)) {
    updates.vat_amount = Number(vat_amount);
    changes.push(`VAT R${Number(o.vat_amount).toFixed(2)} → R${Number(vat_amount).toFixed(2)}`);
  }
  if (typeof delivery_description === "string") {
    const meta = (o.metadata as any) ?? {};
    meta.delivery_description = delivery_description;
    updates.metadata = meta;
  }

  if (Object.keys(updates).length === 0) return json({ success: true, unchanged: true });

  const { error: upErr } = await admin.from("orders").update(updates).eq("id", order_id);
  if (upErr) return err(`Failed to update order: ${upErr.message}`);

  await logTimeline(admin, o, userId, "pricing_updated", `Admin updated pricing: ${changes.join(", ")}`, { changes, updates });

  return json({ success: true, prev_payment_status: o.payment_status });
}

async function updateJobNetPrice(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any,
) {
  const { job_id, net_price } = payload;
  if (!job_id || net_price === undefined) return err("job_id and net_price required");

  const { data: job } = await admin
    .from("order_jobs")
    .select("id, order_id, net_price, job_number, app_id, tenant_id, branch_id, quantity, gross_price")
    .eq("id", job_id)
    .maybeSingle();
  if (!job) return err("Job not found", 404);

  const { error: denied, order } = await fetchOrderForAdmin(admin, userId, (job as any).order_id);
  if (denied) return err(denied, 403);

  const newPrice = Number(net_price);
  const oldPrice = Number((job as any).net_price);
  if (newPrice === oldPrice) return json({ success: true, unchanged: true });

  // Update net + gross (preserve any per-unit interpretation by recomputing simply as net)
  const { error: upErr } = await admin
    .from("order_jobs")
    .update({ net_price: newPrice, gross_price: newPrice })
    .eq("id", job_id);
  if (upErr) return err(`Failed to update job price: ${upErr.message}`);

  await logTimeline(
    admin,
    order,
    userId,
    "job_price_updated",
    `Admin overrode price for ${(job as any).job_number}: R${oldPrice.toFixed(2)} → R${newPrice.toFixed(2)}`,
    { job_id, old_price: oldPrice, new_price: newPrice },
  );

  return json({ success: true, prev_payment_status: (order as any).payment_status });
}

async function addOrderAdjustment(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any,
) {
  const { order_id, description, amount } = payload;
  if (!order_id || !description || amount === undefined) return err("order_id, description, amount required");

  const { error: denied, order } = await fetchOrderForAdmin(admin, userId, order_id);
  if (denied) return err(denied, 403);

  const { data: adj, error: insErr } = await admin
    .from("order_adjustments")
    .insert({ order_id, description: String(description).trim(), amount: Number(amount), created_by: userId })
    .select("id")
    .single();
  if (insErr) return err(`Failed to add adjustment: ${insErr.message}`);

  await logTimeline(
    admin,
    order,
    userId,
    "adjustment_added",
    `Admin added line item "${description}" (R${Number(amount).toFixed(2)})`,
    { adjustment_id: adj?.id, description, amount },
  );

  return json({ success: true, adjustment_id: adj?.id, prev_payment_status: (order as any).payment_status }, 201);
}

async function removeOrderAdjustment(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any,
) {
  const { adjustment_id } = payload;
  if (!adjustment_id) return err("adjustment_id required");

  const { data: adj } = await admin
    .from("order_adjustments")
    .select("id, order_id, description, amount")
    .eq("id", adjustment_id)
    .maybeSingle();
  if (!adj) return err("Adjustment not found", 404);

  const { error: denied, order } = await fetchOrderForAdmin(admin, userId, (adj as any).order_id);
  if (denied) return err(denied, 403);

  const { error: delErr } = await admin.from("order_adjustments").delete().eq("id", adjustment_id);
  if (delErr) return err(`Failed to remove adjustment: ${delErr.message}`);

  await logTimeline(
    admin,
    order,
    userId,
    "adjustment_removed",
    `Admin removed line item "${(adj as any).description}" (R${Number((adj as any).amount).toFixed(2)})`,
    { adjustment_id, description: (adj as any).description, amount: (adj as any).amount },
  );

  return json({ success: true, prev_payment_status: (order as any).payment_status });
}

async function updateOrderAddress(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: any,
) {
  const { order_id, address_type, address } = payload;
  if (!order_id || !address_type || !address) return err("order_id, address_type, address required");
  if (!["delivery", "billing"].includes(address_type)) return err("address_type must be delivery or billing");

  const { error: denied, order } = await fetchOrderForAdmin(admin, userId, order_id);
  if (denied) return err(denied, 403);

  // Upsert: if a row of this type exists, update; otherwise insert
  const { data: existing } = await admin
    .from("order_addresses")
    .select("id")
    .eq("order_id", order_id)
    .eq("address_type", address_type)
    .maybeSingle();

  const fields = {
    company_name: address.company_name ?? null,
    contact_name: address.contact_name ?? null,
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    suburb: address.suburb ?? null,
    city: address.city ?? null,
    province: address.province ?? null,
    postal_code: address.postal_code ?? null,
    country: address.country ?? null,
    phone: address.phone ?? null,
    email: address.email ?? null,
    instructions: address.instructions ?? null,
  };

  if (existing) {
    const { error: upErr } = await admin.from("order_addresses").update(fields).eq("id", (existing as any).id);
    if (upErr) return err(`Failed to update address: ${upErr.message}`);
  } else {
    const { error: insErr } = await admin
      .from("order_addresses")
      .insert({ order_id, address_type, ...fields });
    if (insErr) return err(`Failed to insert address: ${insErr.message}`);
  }

  await logTimeline(
    admin,
    order,
    userId,
    "address_updated",
    `Admin updated ${address_type} address`,
    { address_type, fields },
  );

  return json({ success: true });
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
      case "cancelOrder": {
        response = await cancelOrder(admin, userId, payload);
        if (response.ok && payload.order_id) {
          const data = await response.clone().json();
          sideEffects = async () => {
            await triggerEmail(authHeader, payload.order_id, "order_cancelled", {
              reason: payload.reason,
              refund_pending: data?.refund_pending === true,
            });
          };
        }
        break;
      }
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
