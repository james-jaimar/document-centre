import { supabase } from "@/integrations/supabase/client";
import type { AdminOrderListFilters, ClientOrderListFilters } from "./types";

/**
 * Fetch orders for admin grid (staff view).
 * Uses the new order engine columns — only returns orders with app_id set.
 */
export async function fetchAdminOrders(filters: AdminOrderListFilters = {}) {
  const pageSize = filters.page_size || 25;
  const page = filters.page || 1;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("orders")
    .select(
      `id, order_number, app_id, tenant_id, branch_id,
       source_channel, storefront_name,
       customer_name, company_name, customer_email,
       admin_status, customer_status, payment_status, fulfilment_status,
       total_amount, amount_paid, amount_due, currency,
       date_required, turnaround_time_text,
       created_at, updated_at, submitted_at, completed_at,
       order_jobs (
         id, job_number, sequence_no, product_name, product_category,
         job_name, job_status, customer_job_status, proof_status, file_status,
         urgency, quantity, unit_label, net_price, gross_price,
         configuration, created_at
       )`,
      { count: "exact" }
    )
    .not("app_id", "is", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.tenant_id) query = query.eq("tenant_id", filters.tenant_id);
  if (filters.branch_id) query = query.eq("branch_id", filters.branch_id);
  if (filters.admin_status?.length) query = query.in("admin_status", filters.admin_status);
  if (filters.payment_status?.length) query = query.in("payment_status", filters.payment_status);
  if (filters.customer_status?.length) query = query.in("customer_status", filters.customer_status);
  if (filters.date_from) query = query.gte("created_at", filters.date_from);
  if (filters.date_to) query = query.lte("created_at", filters.date_to);

  if (filters.search) {
    query = query.or(
      `order_number.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%,company_name.ilike.%${filters.search}%,customer_email.ilike.%${filters.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { orders: data || [], total: count || 0, page, pageSize };
}

/**
 * Fetch orders for customer view.
 */
export async function fetchCustomerOrders(filters: ClientOrderListFilters = {}) {
  const pageSize = filters.page_size || 25;
  const page = filters.page || 1;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("orders")
    .select(
      `id, order_number,
       customer_status, payment_status, fulfilment_status,
       total_amount, amount_paid, amount_due, currency,
       date_required, created_at, submitted_at, completed_at,
       order_jobs (
         id, job_number, sequence_no, product_name,
         customer_job_status, proof_status, quantity, unit_label,
         gross_price, configuration, created_at
       )`,
      { count: "exact" }
    )
    .not("app_id", "is", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.customer_status?.length) query = query.in("customer_status", filters.customer_status);
  if (filters.payment_status?.length) query = query.in("payment_status", filters.payment_status);

  const { data, error, count } = await query;
  if (error) throw error;

  return { orders: data || [], total: count || 0, page, pageSize };
}

/**
 * Fetch a single order with all related data.
 */
export async function fetchOrderDetail(orderId: string) {
  const [orderRes, jobsRes, addressesRes, timelineRes, messagesRes, paymentsRes, docsRes] =
    await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single(),
      supabase
        .from("order_jobs")
        .select("*, job_proofs (*)")
        .eq("order_id", orderId)
        .order("sequence_no"),
      supabase
        .from("order_addresses")
        .select("*")
        .eq("order_id", orderId),
      supabase
        .from("timeline_events")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .then((res) => res.error ? { data: [], error: null } : res) as any,
      supabase
        .from("status_history")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      supabase
        .from("messages")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabase
        .from("payments")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      supabase
        .from("order_documents")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
    ]);

  if (orderRes.error) throw orderRes.error;

  return {
    order: orderRes.data,
    jobs: jobsRes.data || [],
    addresses: addressesRes.data || [],
    timeline: timelineRes.data || [],
    messages: messagesRes.data || [],
    payments: paymentsRes.data || [],
    documents: docsRes.data || [],
  };
}
