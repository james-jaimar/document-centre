// Mirrors an approved buyer-tenant order into the supplier tenant when one or
// more of its products are marked as outsourced to a trade partner on the
// platform. Idempotent: keyed on orders.source_order_id.

type Admin = any;

/** Product family id, from either snapshot shape (flat or nested). */
function snapshotFamilyId(snapshot: any): string | null {
  return snapshot?.product_family_id ?? snapshot?.product_family?.id ?? null;
}

async function noteSkip(admin: Admin, orderId: string, reason: string) {
  console.warn(`[supplier-mirror] order ${orderId}: ${reason}`);
  const { data: row } = await admin
    .from("orders")
    .select("metadata, supplier_order_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!row || row.supplier_order_id) return;
  await admin
    .from("orders")
    .update({
      metadata: {
        ...(row.metadata || {}),
        supplier_mirror_skipped: { reason, at: new Date().toISOString() },
      },
    })
    .eq("id", orderId);
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * Supplier trade price (minor units, incl. their VAT) for one job, resolved
 * from the supplier tenant's pack ladder. Returns null when nothing matches.
 */
async function supplierTradePriceMinor(
  admin: Admin,
  supplierTenantId: string,
  supplierFamilyId: string,
  job: any,
): Promise<number | null> {
  const { data: override } = await admin
    .from("product_pack_pricing_overrides")
    .select("quantity_blocks")
    .eq("product_family_id", supplierFamilyId)
    .eq("tenant_id", supplierTenantId)
    .is("branch_id", null)
    .maybeSingle();
  let blocks: any[] = Array.isArray(override?.quantity_blocks) ? override!.quantity_blocks : [];
  if (!blocks.length) {
    const { data: family } = await admin
      .from("product_families")
      .select("quantity_blocks")
      .eq("id", supplierFamilyId)
      .maybeSingle();
    blocks = Array.isArray(family?.quantity_blocks) ? family!.quantity_blocks : [];
  }
  if (!blocks.length) return null;

  const spec = job.configuration?.raw_spec ?? {};
  const qty = Number(job.quantity ?? spec.quantity ?? 0);
  const option = norm(spec.pricing_option ?? spec.option);
  const size = norm(spec.size);
  const paper = norm(spec.paper);
  const sides = norm(spec.sides ?? (spec.is_duplex ? "double" : "single"));

  const candidates = blocks.filter((b: any) => Number(b.qty) === qty);
  const match =
    candidates.find(
      (b: any) =>
        (!option || norm(b.option) === option) &&
        (!size || norm(b.size) === size) &&
        (!paper || norm(b.paper) === paper) &&
        (!sides || norm(b.sides ?? "single") === sides),
    ) ??
    candidates.find((b: any) => !option || norm(b.option) === option) ??
    null;
  if (!match) return null;

  const base = Number(match.trade_price_minor ?? match.price_minor ?? 0) || 0;
  if (!base) return null;

  // The supplier's VAT is a real cost to the buyer, so add it when their
  // prices are held exclusive of tax.
  const uplift = await supplierTaxUplift(admin, supplierTenantId);
  return Math.round(base * uplift);
}

/**
 * Multiplier that turns a supplier's stored price into the VAT-inclusive
 * amount the buyer actually pays. Returns 1 when the supplier's prices
 * already include tax, or when they aren't charging tax at all.
 */
async function supplierTaxUplift(admin: Admin, supplierTenantId: string): Promise<number> {
  const { data: settings = [] } = await admin
    .from("tenant_settings")
    .select("setting_key, setting_value")
    .eq("tenant_id", supplierTenantId)
    .eq("category", "financial")
    .in("setting_key", ["tax_rate", "tax_enabled", "tax_inclusive"]);
  const get = (k: string) => settings.find((s: any) => s.setting_key === k)?.setting_value;
  const rate = Number(get("tax_rate") ?? 0) || 0;
  const enabled = get("tax_enabled") === undefined ? rate > 0 : !!get("tax_enabled") && rate > 0;
  const inclusive = !!get("tax_inclusive");
  return enabled && !inclusive ? 1 + rate / 100 : 1;
}


/** Invoke another edge function with the service role; never throws. */
async function callFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<{ invoice_id?: string } | null> {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[supplier-mirror] ${name} failed: ${res.status} ${await res.text().catch(() => "")}`);
      return null;
    }
    return await res.json().catch(() => null);
  } catch (e) {
    console.error(`[supplier-mirror] ${name} threw`, e);
    return null;
  }
}

/** The buyer company's credit facility inside the supplier's tenant. */
async function buyerCreditTerms(
  admin: Admin,
  supplierTenantId: string,
  buyerCompanyId: string | null,
): Promise<{ payment_terms_days: number; account_ref: string | null } | null> {
  if (!buyerCompanyId) return null;
  const { data: company } = await admin
    .from("customer_companies")
    .select("id, is_active, credit_limit, payment_terms_days, mis_account_number, tenant_id")
    .eq("id", buyerCompanyId)
    .eq("tenant_id", supplierTenantId)
    .maybeSingle();
  if (!company || company.is_active === false) return null;
  if (!(Number(company.credit_limit ?? 0) > 0)) return null;
  return {
    payment_terms_days: Number(company.payment_terms_days ?? 30),
    account_ref: company.mis_account_number ?? null,
  };
}

/**
 * The supplier's own branch for the trade order. Their letterhead — address,
 * VAT number, banking, tax overrides — hangs off the branch, so an order with
 * no branch prints a bare invoice. One active branch is the common case.
 */
async function supplierBranchId(
  admin: Admin,
  tenantId: string,
  preferredBranchId?: string | null,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    const rows = (data as any[]) ?? [];
    if (!rows.length) return null;
    if (preferredBranchId && rows.some((r) => r.id === preferredBranchId)) return preferredBranchId;
    return rows[0].id as string;
  } catch (_e) {
    return null;
  }
}

/** Minimum billable weight configured on the supplier tenant. */



async function supplierMinBillableKg(admin: Admin, tenantId: string): Promise<number> {
  try {
    const { data } = await admin.rpc("resolve_tenant_setting", {
      p_tenant_id: tenantId,
      p_category: "delivery",
      p_key: "min_billable_kg",
    });
    const n = Number(typeof data === "string" ? data.replace(/"/g, "") : data);
    if (Number.isFinite(n) && n > 0) return n;
  } catch (_e) { /* fall through to default */ }
  return 1;
}

function sheetGrams(widthMm: number, heightMm: number, gsm: number): number {
  return (widthMm / 1000) * (heightMm / 1000) * gsm;
}

/**
 * Billable weight for the trade order, in order of confidence:
 * the buyer's own quoted weight → weights stamped on the lines →
 * a calculation from the line specs → the supplier's minimum.
 */
function resolveBillableKg(
  order: any,
  jobs: any[],
  minKg: number,
): { kg: number; source: string } {
  const quoted = Number(order?.metadata?.shipping?.billable_kg ?? 0);
  if (Number.isFinite(quoted) && quoted > 0) {
    return { kg: Math.max(quoted, minKg), source: "buyer_quote" };
  }

  const stamped = jobs.reduce((s: number, j: any) => s + (Number(j.weight_kg) || 0), 0);
  if (stamped > 0) return { kg: Math.max(stamped, minKg), source: "job_weight" };

  let grams = 0;
  for (const j of jobs) {
    const spec = j.configuration?.raw_spec ?? j.configuration ?? {};
    const qty = Math.max(1, Number(j.quantity ?? spec.quantity ?? 1));
    const w = Number(spec?.size?.width_mm ?? spec.width_mm ?? 210) || 210;
    const h = Number(spec?.size?.height_mm ?? spec.height_mm ?? 297) || 297;
    const gsm = Number(spec.paper_gsm ?? spec.gsm ?? 200) || 200;
    const pages = Number(spec.page_count ?? spec.total_pages ?? 1) || 1;
    const sheets = spec.is_duplex || spec.duplex ? Math.ceil(pages / 2) : pages;
    grams += sheetGrams(w, h, gsm) * sheets * qty;
  }
  if (grams > 0) {
    return { kg: Math.max(grams / 1000, minKg), source: "calculated" };
  }
  return { kg: minKg, source: "minimum" };
}

/**
 * Carriage on the trade order, priced from the SUPPLIER's own zones and
 * weight bands — never from what the buyer charged their customer.
 */
async function quoteSupplierDelivery(
  admin: Admin,
  supplierTenantId: string,
  address: any,
  billableKg: number,
  currency: string,
): Promise<{ amount: number; zoneCode: string | null; methodCode: string | null } | { reason: string }> {
  if (!address) return { reason: "no_delivery_address_on_order" };

  const { data: zoneId, error: zoneErr } = await admin.rpc("resolve_delivery_zone", {
    p_tenant_id: supplierTenantId,
    p_branch_id: null,
    p_city: address.city ?? null,
    p_postal_code: address.postal_code ?? null,
    p_province: address.province ?? null,
    p_country: address.country ?? "ZA",
  });
  if (zoneErr || !zoneId) return { reason: zoneErr?.message ?? "supplier_has_no_zone_for_address" };

  const { data: rateRows, error: rateErr } = await admin.rpc("quote_delivery_rate", {
    p_tenant_id: supplierTenantId,
    p_branch_id: null,
    p_zone_id: zoneId,
    p_method_id: null,
    p_billable_kg: billableKg,
    p_currency: currency,
  });
  const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows;
  if (rateErr || !rate) return { reason: rateErr?.message ?? "supplier_has_no_rate_for_weight" };

  const [{ data: zoneRow }, { data: methodRow }] = await Promise.all([
    admin.from("delivery_zones").select("code, label").eq("id", zoneId).maybeSingle(),
    rate.method_id
      ? admin.from("delivery_methods").select("code, label").eq("id", rate.method_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Carriage carries the supplier's VAT too, just like their product prices.
  const uplift = await supplierTaxUplift(admin, supplierTenantId);
  const gross = Math.round(((Number(rate.price) || 0) * uplift + Number.EPSILON) * 100) / 100;

  return {
    amount: gross,
    zoneCode: zoneRow?.code ?? zoneRow?.label ?? null,
    methodCode: methodRow?.code ?? methodRow?.label ?? null,
  };

}

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
  // Never mirror a mirror, and never mirror twice.
  if (order.source_order_id) return;
  if (order.supplier_order_id) return;
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
    const familyId = snapshotFamilyId(j.product_snapshot);
    if (!familyId) continue;
    const a = byFamily.get(familyId);
    if (!a) continue;
    const g = groups.get(a.supplier_link_id) ?? { assignment: a, jobs: [] };
    g.jobs.push(j);
    groups.set(a.supplier_link_id, g);
  }
  if (!groups.size) {
    await noteSkip(admin, orderId, "no order lines matched an active trade-partner product");
    return;
  }


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
    // The trade order belongs to the BUYER company — never to the buyer's own
    // end customer, whose address must never receive supplier mail.
    let buyerProfileId: string | null = null;
    let buyerCompanyName: string | null = null;
    let buyerContactEmail: string | null = null;
    if (link.buyer_company_id) {
      const { data: company } = await admin
        .from("customer_companies")
        .select("id, name, email")
        .eq("id", link.buyer_company_id)
        .maybeSingle();
      buyerCompanyName = company?.name ?? null;
      buyerContactEmail = company?.email ?? null;
      const { data: contact } = await admin
        .from("tenant_memberships")
        .select("profile_id, is_primary_contact")
        .eq("company_id", link.buyer_company_id)
        .eq("is_active", true)
        .order("is_primary_contact", { ascending: false })
        .limit(1)
        .maybeSingle();
      buyerProfileId = contact?.profile_id ?? null;
      if (!buyerContactEmail && buyerProfileId) {
        const { data: profile } = await admin
          .from("profiles")
          .select("email")
          .eq("id", buyerProfileId)
          .maybeSingle();
        buyerContactEmail = profile?.email ?? null;
      }
    }
    const ownerProfileId = buyerProfileId ?? order.ordered_by_profile_id ?? order.user_id;
    if (!ownerProfileId) continue;

    const { data: supplierOrderNum } = await admin.rpc("generate_order_number", {
      p_app_id: order.app_id,
      p_tenant_id: link.supplier_tenant_id,
    });
    if (!supplierOrderNum) continue;

    // Trade value per line: the job's own cost when set, otherwise the
    // supplier's trade ladder, otherwise the buyer's sell price as a floor.
    const tradeByJob = new Map<string, number>();
    for (const j of group.jobs) {
      let price = Number(j.cost_price || 0);
      if (!price) {
        const minor = await supplierTradePriceMinor(
          admin,
          link.supplier_tenant_id,
          group.assignment.supplier_product_family_id ?? snapshotFamilyId(j.product_snapshot),
          j,
        );
        if (minor) price = minor / 100;
      }
      if (!price) price = Number(j.net_price || 0);
      tradeByJob.set(j.id, price);
    }

    const subtotal = group.jobs.reduce(
      (s: number, j: any) => s + (tradeByJob.get(j.id) ?? 0),
      0,
    );

    // Carriage, priced on the supplier's own zones and bands.
    const currency = order.currency || "ZAR";
    let deliveryAmount = 0;
    let shippingMeta: Record<string, unknown> | null = null;
    let deliveryUnpriced: string | null = null;
    if (order.fulfillment_type && order.fulfillment_type !== "collection") {
      const deliveryAddress =
        (addresses as any[]).find((a) => a.address_type === "delivery") ??
        (addresses as any[])[0] ?? null;
      const minKg = await supplierMinBillableKg(admin, link.supplier_tenant_id);
      const { kg, source } = resolveBillableKg(order, group.jobs, minKg);
      const quote = await quoteSupplierDelivery(
        admin,
        link.supplier_tenant_id,
        deliveryAddress,
        kg,
        currency,
      );
      if ("reason" in quote) {
        deliveryUnpriced = quote.reason;
      } else {
        deliveryAmount = quote.amount;
        shippingMeta = {
          amount: quote.amount,
          currency,
          zone_code: quote.zoneCode,
          method_code: quote.methodCode,
          billable_kg: kg,
          weight_source: source,
          priced_by: "supplier_rates",
        };
      }
    }

    // The trade figures are VAT inclusive. Split them the way the supplier's
    // own books expect (net + VAT) so the invoice adds up.
    const uplift = await supplierTaxUplift(admin, link.supplier_tenant_id);
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const grossTotal = round2(subtotal + deliveryAmount);
    const netSubtotal = round2(subtotal / uplift);
    const netDelivery = round2(deliveryAmount / uplift);
    const vatAmount = round2(grossTotal - netSubtotal - netDelivery);
    const total = grossTotal;

    // Does the buyer hold an account with this supplier? If so the order is
    // approved on arrival and gets a tax invoice; otherwise a proforma.
    const credit = await buyerCreditTerms(admin, link.supplier_tenant_id, link.buyer_company_id);
    const mirrorBranchId = await supplierBranchId(
      admin,
      link.supplier_tenant_id,
      (group.assignment as any)?.supplier_branch_id ?? null,
    );

    const { data: mirror, error: mErr } = await admin
      .from("orders")
      .insert({
        app_id: order.app_id,
        tenant_id: link.supplier_tenant_id,
        branch_id: mirrorBranchId,
        order_number: supplierOrderNum,
        source_order_id: order.id,
        supplier_link_id: link.id,
        supplier_status: "received",
        ordered_by_profile_id: ownerProfileId,
        user_id: ownerProfileId,
        customer_email: buyerContactEmail,
        customer_name: buyerCompanyName ?? order.customer_name,
        company_name: buyerCompanyName ?? order.company_name,
        admin_status: credit ? "approved" : "new_order",
        customer_status: "in_production",
        payment_status: "unpaid",
        fulfilment_status: "pending",
        currency,
        subtotal: netSubtotal,
        delivery_amount: netDelivery,
        vat_amount: vatAmount,
        total_amount: total,
        amount_due: total,
        date_required: order.date_required,
        fulfillment_type: order.fulfillment_type,
        notes_customer: order.notes_customer,
        submitted_at: new Date().toISOString(),
        metadata: {
          trade_order: true,
          source_order_number: order.order_number,
          source_tenant_id: order.tenant_id,
          ...(shippingMeta ? { shipping: { ...shippingMeta, amount: netDelivery, amount_incl_tax: deliveryAmount } } : {}),
          ...(deliveryUnpriced ? { supplier_delivery_unpriced: deliveryUnpriced } : {}),
          ...(credit
            ? {
                payment_terms_days: credit.payment_terms_days,
                mis_account_number: credit.account_ref,
                due_date: new Date(
                  Date.now() + credit.payment_terms_days * 86400000,
                ).toISOString().slice(0, 10),
              }
            : {}),
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
      branch_id: mirrorBranchId,
      job_number: `${mirror.order_number}-${idx + 1}`,
      sequence_no: idx + 1,
      product_name: j.product_name,
      product_category: j.product_category,
      job_name: j.job_name,
      quantity: j.quantity,
      unit_label: j.unit_label,
      net_price: round2((tradeByJob.get(j.id) ?? 0) / uplift),
      cost_price: round2((tradeByJob.get(j.id) ?? 0) / uplift),
      vat_rate: uplift > 1 ? Math.round((uplift - 1) * 100) : 0,
      gross_price: tradeByJob.get(j.id) ?? 0,

      product_snapshot: {
        ...(j.product_snapshot || {}),
        product_family_id:
          group.assignment.supplier_product_family_id ?? snapshotFamilyId(j.product_snapshot),
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
        visibility: "admin",
        actor_type: "system",
        description: `Trade order received from ${buyerCompanyName ?? "a trade partner"} (${order.order_number})`,
        metadata: { source_order_id: order.id },
      }),
      deliveryUnpriced
        ? admin.from("timeline_events").insert({
            app_id: order.app_id,
            tenant_id: link.supplier_tenant_id,
            order_id: mirror.id,
            event_type: "note",
            visibility: "admin",
            actor_type: "system",
            description:
              "Delivery not priced — no rate found for this address/weight. Add carriage manually.",
            metadata: { reason: deliveryUnpriced },
          })
        : Promise.resolve(null),
      buyerContactEmail
        ? Promise.resolve(null)
        : admin.from("timeline_events").insert({
            app_id: order.app_id,
            tenant_id: link.supplier_tenant_id,
            order_id: mirror.id,
            event_type: "note",
            visibility: "admin",
            actor_type: "system",
            description:
              "No contact email on the trade partner's company record — order confirmation not sent. Add an email to the company account.",
            metadata: { buyer_company_id: link.buyer_company_id },
          }),
    ]);

    // Make the supplier's carriage visible on the buyer's order.
    await admin
      .from("orders")
      .update({
        metadata: {
          ...(order.metadata || {}),
          supplier_delivery: shippingMeta
            ? { amount: deliveryAmount, currency, order_number: mirror.order_number }
            : { unpriced: deliveryUnpriced, order_number: mirror.order_number },
        },
      })
      .eq("id", order.id);

    // Post the charge to the buyer's account with this supplier.
    if (credit && total > 0) {
      try {
        await admin.from("customer_account_ledger").insert({
          tenant_id: link.supplier_tenant_id,
          app_id: order.app_id,
          branch_id: null,
          company_id: link.buyer_company_id,
          customer_profile_id: null,
          entry_type: "charge",
          amount: total,
          currency,
          order_id: mirror.id,
          reference: mirror.order_number,
          note: `Trade order ${mirror.order_number} (${order.order_number})`,
          entry_date: new Date().toISOString().slice(0, 10),
          due_date: new Date(Date.now() + credit.payment_terms_days * 86400000)
            .toISOString().slice(0, 10),
        });
      } catch (e) {
        console.error("[supplier-mirror] ledger charge failed (non-fatal)", e);
      }
    }

    // Same paperwork as any other order in the supplier's tenant: a tax
    // invoice on account, otherwise a proforma, plus the received email.
    const inv = await callFunction("generate-invoice-pdf", {
      order_id: mirror.id,
      kind: credit ? "invoice" : "proforma",
    });
    await callFunction("send-order-email", {
      order_id: mirror.id,
      event_key: "order_received",
      ...(inv?.invoice_id ? { invoice_id: inv.invoice_id } : {}),
    });

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
