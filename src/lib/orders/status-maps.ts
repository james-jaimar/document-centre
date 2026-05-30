import type {
  OrderAdminStatus,
  OrderCustomerStatus,
  PaymentStatus,
  JobStatus,
  CustomerJobStatus,
  ProofStatus,
  Urgency,
  FulfilmentStatus,
} from './types';

// ─── Admin status ─────────────────────────────────────────

export const ADMIN_STATUS_CONFIG: Record<OrderAdminStatus, { label: string; color: string; icon?: string }> = {
  new_order:          { label: 'New',              color: 'bg-blue-100 text-blue-800' },
  under_review:       { label: 'Under Review',    color: 'bg-amber-100 text-amber-800' },
  approved:           { label: 'Approved',         color: 'bg-emerald-100 text-emerald-800' },
  in_production:      { label: 'In Production',   color: 'bg-indigo-100 text-indigo-800' },
  qa:                 { label: 'QA',               color: 'bg-purple-100 text-purple-800' },
  ready_for_dispatch: { label: 'Ready',            color: 'bg-teal-100 text-teal-800' },
  dispatched:         { label: 'Dispatched',        color: 'bg-sky-100 text-sky-800' },
  completed:          { label: 'Completed',        color: 'bg-green-100 text-green-800' },
  on_hold:            { label: 'On Hold',          color: 'bg-orange-100 text-orange-800' },
  cancelled:          { label: 'Cancelled',        color: 'bg-red-100 text-red-800' },
};

// ─── Customer status ──────────────────────────────────────

export const CUSTOMER_STATUS_CONFIG: Record<OrderCustomerStatus, { label: string; color: string }> = {
  awaiting_payment: { label: 'Awaiting Payment', color: 'bg-amber-100 text-amber-800' },
  in_production:    { label: 'In Production',    color: 'bg-indigo-100 text-indigo-800' },
  on_hold:          { label: 'On Hold',          color: 'bg-orange-100 text-orange-800' },
  proof_pending:    { label: 'Proof Pending',    color: 'bg-purple-100 text-purple-800' },
  ready:            { label: 'Ready',            color: 'bg-teal-100 text-teal-800' },
  completed:        { label: 'Completed',        color: 'bg-green-100 text-green-800' },
  cancelled:        { label: 'Cancelled',        color: 'bg-red-100 text-red-800' },
  dispatched:       { label: 'Dispatched',       color: 'bg-sky-100 text-sky-800' },
};

// ─── Payment status ───────────────────────────────────────

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
  unpaid:    { label: 'Unpaid',    color: 'bg-red-100 text-red-800' },
  requested: { label: 'Requested', color: 'bg-amber-100 text-amber-800' },
  part_paid: { label: 'Part Paid', color: 'bg-yellow-100 text-yellow-800' },
  paid:      { label: 'Paid',      color: 'bg-green-100 text-green-800' },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-800' },
  refunded:  { label: 'Refunded',  color: 'bg-gray-100 text-gray-800' },
};

// ─── Job status ───────────────────────────────────────────

export const JOB_STATUS_CONFIG: Record<JobStatus, { label: string; color: string }> = {
  new_job:                  { label: 'New',                color: 'bg-blue-100 text-blue-800' },
  awaiting_files:           { label: 'Awaiting Files',     color: 'bg-amber-100 text-amber-800' },
  awaiting_proof:           { label: 'Awaiting Proof',     color: 'bg-purple-100 text-purple-800' },
  proof_ready:              { label: 'Proof Ready',        color: 'bg-violet-100 text-violet-800' },
  proof_approved:           { label: 'Proof Approved',     color: 'bg-emerald-100 text-emerald-800' },
  approved_for_production:  { label: 'Approved',           color: 'bg-emerald-100 text-emerald-800' },
  in_production:            { label: 'In Production',      color: 'bg-indigo-100 text-indigo-800' },
  outsourced:               { label: 'Outsourced',         color: 'bg-cyan-100 text-cyan-800' },
  qa:                       { label: 'QA',                 color: 'bg-purple-100 text-purple-800' },
  ready:                    { label: 'Ready',              color: 'bg-teal-100 text-teal-800' },
  completed:                { label: 'Completed',          color: 'bg-green-100 text-green-800' },
  on_hold:                  { label: 'On Hold',            color: 'bg-orange-100 text-orange-800' },
  cancelled:                { label: 'Cancelled',          color: 'bg-red-100 text-red-800' },
};

// ─── Customer job status ──────────────────────────────────

export const CUSTOMER_JOB_STATUS_CONFIG: Record<CustomerJobStatus, { label: string; color: string }> = {
  awaiting_payment: { label: 'Awaiting Payment', color: 'bg-amber-100 text-amber-800' },
  in_production:    { label: 'In Production',    color: 'bg-indigo-100 text-indigo-800' },
  on_hold:          { label: 'On Hold',          color: 'bg-orange-100 text-orange-800' },
  proof_pending:    { label: 'Proof Pending',    color: 'bg-purple-100 text-purple-800' },
  ready:            { label: 'Ready',            color: 'bg-teal-100 text-teal-800' },
  completed:        { label: 'Completed',        color: 'bg-green-100 text-green-800' },
  cancelled:        { label: 'Cancelled',        color: 'bg-red-100 text-red-800' },
};

// ─── Proof status ─────────────────────────────────────────

export const PROOF_STATUS_CONFIG: Record<ProofStatus, { label: string; color: string }> = {
  not_required: { label: 'Not Required', color: 'bg-gray-100 text-gray-600' },
  pending:      { label: 'Pending',      color: 'bg-amber-100 text-amber-800' },
  generated:    { label: 'Generated',    color: 'bg-blue-100 text-blue-800' },
  sent:         { label: 'Sent',         color: 'bg-indigo-100 text-indigo-800' },
  approved:     { label: 'Approved',     color: 'bg-green-100 text-green-800' },
  rejected:     { label: 'Rejected',     color: 'bg-red-100 text-red-800' },
};

// ─── Urgency ──────────────────────────────────────────────

export const URGENCY_CONFIG: Record<Urgency, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'bg-gray-100 text-gray-600' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-800' },
  high:   { label: 'High',   color: 'bg-orange-100 text-orange-800' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-800' },
};

// ─── Fulfilment status ────────────────────────────────────

export const FULFILMENT_STATUS_CONFIG: Record<FulfilmentStatus, { label: string; color: string }> = {
  pending:       { label: 'Pending',       color: 'bg-gray-100 text-gray-600' },
  in_production: { label: 'In Production', color: 'bg-indigo-100 text-indigo-800' },
  ready:         { label: 'Ready',         color: 'bg-teal-100 text-teal-800' },
  dispatched:    { label: 'Dispatched',    color: 'bg-sky-100 text-sky-800' },
  delivered:     { label: 'Delivered',     color: 'bg-green-100 text-green-800' },
  collected:     { label: 'Collected',     color: 'bg-green-100 text-green-800' },
  cancelled:     { label: 'Cancelled',     color: 'bg-red-100 text-red-800' },
};
