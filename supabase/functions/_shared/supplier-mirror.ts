// Mirrors an approved buyer-tenant order into the supplier tenant when one or
// more of its products are marked as outsourced to a trade partner on the
// platform. Idempotent: keyed on orders.source_order_id.

type Admin = any;

export async function mirrorSupplierOrders(admin: Admin, orderId: string): Promise<void> {
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, app_id, tenant_id, order_number, currency, fulfillment_type, date_required, " +
        "customer_email, customer_name, company_name, ordered_by_profile_id, user_id, " +
        "source_order_id, supplier_order_id, notes_customer, metadata",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  // Never mirror a mirror.
  if (order.source_order_id) return;
  if (!order.tenant_id) return;

  const { data: jobs = [] } = await admin
    .from("order_jobs")
    .select("*")
    .eq("order_id", orderId)
    .order("sequence_no", { ascending: true });
  if (!jobs.length) return;

  const { data: assignments = [] } = await admin
    .from("product_supplier_assignments")
    .select("product_family_id, supplier_link_id, supplier_product_family_id")
    .eq("tenant_id", order.tenant_id)
    .eq("is_active", true);
  if (!assignments.length) return;

  const byFamily = new Map<string, any>();
  for (const a of assignments) byFamily.set(a.product_family_id, a);

  // Group outsourced jobs by supplier link.
  const groups = new Map<string, { assignment: any; jobs: any[] }>();
  for (const j of jobs) {
    const familyId = j.product_snapshot?.product_family_id;
    if (!familyId) continue;
    const a = byFamily.get(familyId);
    if (!a) continue;
    const g = groups.get(a.supplier_link_id) ?? { assignment: a, jobs: [] };
    g.jobs.push(j);
    groups.set(a.supplier_link_id, g);
  }
  if (!groups.size) return;

  const { data: addresses = [] } = await admin
    .from("order_addresses")
    .select("*")
    .eq("order_id", orderId);

  let firstMirrorId: string | null = null;
  let firstLinkId: string | null = null;

  for (const [linkId, group] of groups) {
    const { data: link } = await admin
      .from("supplier_links")
      .select("id, supplier_tenant_id, buyer_tenant_id, buyer_company_id, status")
      .eq("id", linkId)
      .maybeSingle();
    if (!link || link.status !== "active") continue;

    // Idempotency guard.
    const { data: existing } = await admin
      .from("orders")
      .select("id")
      .eq("source_order_id", orderId)
      .eq("tenant_id", link.supplier_tenant_id)
      .maybeSingle();
    if (existing) {
      firstMirrorId = firstMirrorId ?? existing.id;
      firstLinkId = firstLinkId ?? linkId;
      continue;
    }

    // Who the mirrored order sits against in the supplier tenant.
    let buyerProfileId: string | null = null;
    let buyerCompanyName: string | null = null;
    if (link.buyer_company_id) {
      const { data: company } = await admin
        .from("customer_companies")
        .select("id, name, email")
        .eq("id", link.buyer_company_id)
        .maybeSingle();
      buyerCompanyName = company?.name ?? null;
      const { data: contact } = await admin
        .from("tenant_memberships")
        .select("profile_id, is_primary_contact")
        .eq("company_id", link.buyer_company_id)
        .eq("is_active", true)
        .order("is_primary_contact", { ascending: false })
        .limit(1)
        .maybeSingle();
      buyerProfileId = contact?.profile_id ?? null;
    }
    const ownerProfileId = buyerProfileId ?? order.ordered_by_profile_id ?? order.user_id;
    if (!ownerProfileId) continue;

    const { data: supplierOrderNum } = await admin.rpc("generate_order_number", {
      p_app_id: order.app_id,
      p_tenant_id: link.supplier_tenant_id,
    });
    if (!supplierOrderNum) continue;

    const subtotal = group.jobs.reduce(
      (s: number, j: any) => s + Number(j.cost_price || j.net_price || 0),
      0,
    );

    const { data: mirror, error: mErr } = await admin
      .from("orders")
      .insert({
        app_id: order.app_id,
        tenant_id: link.supplier_tenant_id,
        order_number: supplierOrderNum,
        source_order_id: order.id,
        supplier_link_id: link.id,
        supplier_status: "received",
        ordered_by_profile_id: ownerProfileId,
        user_id: ownerProfileId,
        customer_email: order.customer_email,
        customer_name: buyerCompanyName ?? order.customer_name,
        company_name: buyerCompanyName ?? order.company_name,
        admin_status: "new_order",
        customer_status: "in_production",
        payment_status: "unpaid",
        fulfilment_status: "pending",
        currency: order.currency || "ZAR",
        subtotal,
        total_amount: subtotal,
        amount_due: subtotal,
        date_required: order.date_required,
        fulfillment_type: order.fulfillment_type,
        notes_customer: order.notes_customer,
        submitted_at: new Date().toISOString(),
        metadata: {
          trade_order: true,
          source_order_number: order.order_number,
          source_tenant_id: order.tenant_id,
        },
      })
      .select("id, order_number")
      .single();
    if (mErr || !mirror) {
      console.error("[supplier-mirror] mirror insert failed", mErr);
      continue;
    }

    const jobInserts = group.jobs.map((j: any, idx: number) => ({
      order_id: mirror.id,
      app_id: order.app_id,
      tenant_id: link.supplier_tenant_id,
      job_number: `${mirror.order_number}-${idx + 1}`,
      sequence_no: idx + 1,
      product_name: j.product_name,
      product_category: j.product_category,
      job_name: j.job_name,
      quantity: j.quantity,
      unit_label: j.unit_label,
      net_price: Number(j.cost_price || j.net_price || 0),
      cost_price: Number(j.cost_price || 0),
      vat_rate: j.vat_rate ?? 15,
      gross_price: Number(j.cost_price || j.net_price || 0),
      product_snapshot: {
        ...(j.product_snapshot || {}),
        product_family_id:
          group.assignment.supplier_product_family_id ?? j.product_snapshot?.product_family_id,
        source_job_number: j.job_number,
      },
      configuration: j.configuration || {},
      production_specs: j.production_specs || {},
      integration_payload: j.integration_payload || {},
      job_status: "approved_for_production",
    }));

    const addressInserts = addresses.map((a: any) => {
      const { id: _id, order_id: _o, created_at: _c, updated_at: _u, ...rest } = a;
      return { ...rest, order_id: mirror.id };
    });

    await Promise.all([
      admin.from("order_jobs").insert(jobInserts),
      addressInserts.length
        ? admin.from("order_addresses").insert(addressInserts)
        : Promise.resolve(null),
      admin.from("timeline_events").insert({
        app_id: order.app_id,
        tenant_id: link.supplier_tenant_id,
        order_id: mirror.id,
        event_type: "order_created",
        visibility: "internal",
        actor_type: "system",
        description: `Trade order received from ${buyerCompanyName ?? "a trade partner"} (${order.order_number})`,
        metadata: { source_order_id: order.id },
      }),
    ]);

    firstMirrorId = firstMirrorId ?? mirror.id;
    firstLinkId = firstLinkId ?? link.id;
  }

  if (firstMirrorId && !order.supplier_order_id) {
    await admin
      .from("orders")
      .update({
        supplier_order_id: firstMirrorId,
        supplier_link_id: firstLinkId,
        supplier_status: "sent",
      })
      .eq("id", order.id);
  }
}
