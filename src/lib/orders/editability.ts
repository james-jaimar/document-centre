/**
 * Single source of truth for "can the customer still edit this order?"
 * Used by both the UI (show/hide Manage panel) and as a sanity check
 * pre-call in mutations; the edge function re-validates server-side.
 *
 * Rule (agreed with PM): editable while admin_status is new_order or
 * under_review AND no job has moved past 'new'. After branch approves
 * (or anything later), edits become a request only.
 */
export const CUSTOMER_EDITABLE_ADMIN_STATUSES = new Set([
  "new_order",
  "under_review",
]);

export const CUSTOMER_EDITABLE_JOB_STATUSES = new Set([
  "new",
  "awaiting_payment",
  "proof_pending",
  "on_hold",
]);

export interface EditabilityOrder {
  admin_status?: string | null;
  order_status?: string | null;
}

export interface EditabilityJob {
  job_status?: string | null;
}

export function isCustomerEditable(
  order: EditabilityOrder | null | undefined,
  jobs: EditabilityJob[] = [],
): boolean {
  if (!order) return false;
  if (order.order_status === "cancelled") return false;
  if (!CUSTOMER_EDITABLE_ADMIN_STATUSES.has(order.admin_status ?? "")) return false;
  if (jobs.length && jobs.some((j) => !CUSTOMER_EDITABLE_JOB_STATUSES.has(j.job_status ?? "new"))) {
    return false;
  }
  return true;
}
