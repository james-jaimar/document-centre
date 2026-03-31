// Order Engine Types — derived from PrintJob build packet

export type UUID = string;

export type GlobalRole = 'super_admin' | 'platform_admin' | 'app_admin' | 'staff' | 'customer';
export type MembershipRole = 'owner' | 'admin' | 'sales' | 'production' | 'accounts' | 'customer';

export type OrderAdminStatus =
  | 'new_order'
  | 'under_review'
  | 'approved'
  | 'in_production'
  | 'qa'
  | 'ready_for_dispatch'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export type OrderCustomerStatus =
  | 'awaiting_payment'
  | 'in_production'
  | 'on_hold'
  | 'proof_pending'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'dispatched';

export type PaymentStatus = 'unpaid' | 'requested' | 'part_paid' | 'paid' | 'failed' | 'refunded';
export type FulfilmentStatus = 'pending' | 'in_production' | 'ready' | 'dispatched' | 'delivered' | 'collected' | 'cancelled';

export type JobStatus =
  | 'new_job'
  | 'awaiting_files'
  | 'awaiting_proof'
  | 'proof_ready'
  | 'proof_approved'
  | 'approved_for_production'
  | 'in_production'
  | 'outsourced'
  | 'qa'
  | 'ready'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export type CustomerJobStatus =
  | 'awaiting_payment'
  | 'in_production'
  | 'on_hold'
  | 'proof_pending'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type ProofStatus = 'not_required' | 'pending' | 'generated' | 'sent' | 'approved' | 'rejected';
export type ProofType = 'pdf' | 'flipbook' | 'external_preview' | 'image' | 'other';
export type ProofViewerType = 'internal_pdf' | 'external_url' | 'flipbook' | 'download_only';
export type DocumentType = 'proforma_invoice' | 'invoice' | 'delivery_note' | 'proof' | 'artwork' | 'job_file' | 'preview' | 'other';

export type Urgency = 'low' | 'normal' | 'high' | 'urgent';
export type FileStatus = 'pending' | 'uploaded' | 'validated';
export type AddressType = 'billing' | 'delivery';
export type SenderType = 'admin' | 'customer' | 'system';
export type RecipientType = 'thread' | 'customer' | 'admin';
export type Visibility = 'admin' | 'customer' | 'both';
export type ActorType = 'system' | 'admin' | 'customer' | 'integration';
export type EntityType = 'order' | 'job' | 'proof' | 'payment';
export type PaymentProvider = 'payfast' | 'paystack' | 'stripe' | 'eft' | 'manual' | 'other';

// ─── Configuration rendering types ────────────────────────

export interface ConfigSummary {
  primary_spec_1_label?: string;
  primary_spec_1_value?: string;
  primary_spec_2_label?: string;
  primary_spec_2_value?: string;
  primary_spec_3_label?: string;
  primary_spec_3_value?: string;
  [key: string]: string | undefined;
}

export interface ConfigSectionItem {
  label: string;
  value: string;
}

export interface ConfigSection {
  title: string;
  items: ConfigSectionItem[];
}

export interface JobConfiguration {
  summary?: ConfigSummary;
  sections?: ConfigSection[];
  [key: string]: unknown;
}

// ─── Record types (DB row shapes) ─────────────────────────

export interface AppRecord {
  id: UUID;
  slug: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TenantMembershipRecord {
  id: UUID;
  profile_id: UUID;
  app_id: UUID;
  tenant_id: UUID;
  branch_id?: UUID | null;
  role: MembershipRole;
  can_view_all_orders: boolean;
  is_active: boolean;
  created_at: string;
}

export interface OrderRecord {
  id: UUID;
  app_id: UUID;
  tenant_id: UUID;
  branch_id?: UUID | null;
  order_number: string;
  external_order_ref?: string | null;
  source_channel?: string | null;
  storefront_name?: string | null;
  ordered_by_profile_id?: UUID | null;
  customer_email?: string | null;
  customer_name?: string | null;
  company_name?: string | null;
  admin_status: OrderAdminStatus;
  customer_status: OrderCustomerStatus;
  payment_status: PaymentStatus;
  fulfilment_status: FulfilmentStatus;
  currency: string;
  subtotal: number;
  discount_amount: number;
  delivery_amount: number;
  vat_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  external_code?: string | null;
  date_required?: string | null;
  turnaround_time_text?: string | null;
  notes_internal?: string | null;
  notes_customer?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  submitted_at?: string | null;
  completed_at?: string | null;
}

export interface OrderJobRecord {
  id: UUID;
  order_id: UUID;
  app_id: UUID;
  tenant_id: UUID;
  branch_id?: UUID | null;
  job_number: string;
  sequence_no: number;
  external_job_ref?: string | null;
  external_product_key?: string | null;
  product_name: string;
  product_category?: string | null;
  job_name?: string | null;
  job_status: JobStatus;
  customer_job_status: CustomerJobStatus;
  proof_status: ProofStatus;
  file_status: FileStatus;
  supplier_status?: string | null;
  urgency: Urgency;
  quantity: number;
  unit_label?: string | null;
  net_price: number;
  cost_price: number;
  vat_rate: number;
  gross_price: number;
  weight_kg?: number | null;
  qty_sent: number;
  qty_remaining: number;
  assigned_to_profile_id?: UUID | null;
  assigned_supplier_id?: UUID | null;
  product_snapshot: Record<string, unknown>;
  configuration: JobConfiguration;
  production_specs: Record<string, unknown>;
  integration_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  ready_at?: string | null;
  completed_at?: string | null;
}

export interface OrderAddressRecord {
  id: UUID;
  order_id: UUID;
  address_type: AddressType;
  company_name?: string | null;
  contact_name?: string | null;
  line1?: string | null;
  line2?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  instructions?: string | null;
  created_at: string;
}

export interface TimelineEventRecord {
  id: UUID;
  app_id: UUID;
  tenant_id: UUID;
  branch_id?: UUID | null;
  order_id?: UUID | null;
  job_id?: UUID | null;
  event_type: string;
  visibility: Visibility;
  actor_type: ActorType;
  actor_profile_id?: UUID | null;
  actor_name?: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MessageRecord {
  id: UUID;
  app_id: UUID;
  tenant_id: UUID;
  branch_id?: UUID | null;
  order_id?: UUID | null;
  job_id?: UUID | null;
  sender_profile_id?: UUID | null;
  sender_type: SenderType;
  recipient_type: RecipientType;
  message_body: string;
  is_internal: boolean;
  created_at: string;
}

export interface OrderDocumentRecord {
  id: UUID;
  app_id: UUID;
  tenant_id: UUID;
  branch_id?: UUID | null;
  order_id?: UUID | null;
  job_id?: UUID | null;
  document_type: DocumentType;
  title?: string | null;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  public_url?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  version_no: number;
  is_customer_visible: boolean;
  source_app_managed: boolean;
  metadata: Record<string, unknown>;
  created_by?: UUID | null;
  created_at: string;
}

export interface PaymentRecord {
  id: UUID;
  order_id: UUID;
  app_id: UUID;
  tenant_id: UUID;
  provider: PaymentProvider;
  provider_transaction_id?: string | null;
  payment_reference?: string | null;
  status: 'initiated' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  amount: number;
  currency: string;
  initiated_at?: string | null;
  paid_at?: string | null;
  raw_payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface JobProofRecord {
  id: UUID;
  app_id: UUID;
  tenant_id: UUID;
  order_id: UUID;
  job_id: UUID;
  proof_type: ProofType;
  proof_status: ProofStatus;
  viewer_type: ProofViewerType;
  viewer_url?: string | null;
  document_id?: UUID | null;
  approval_token?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  approved_at?: string | null;
  rejected_at?: string | null;
}

export interface StatusHistoryRecord {
  id: UUID;
  app_id: UUID;
  tenant_id: UUID;
  order_id?: UUID | null;
  job_id?: UUID | null;
  entity_type: EntityType;
  from_status?: string | null;
  to_status: string;
  reason?: string | null;
  changed_by?: UUID | null;
  created_at: string;
}

// ─── Input/Payload types for mutations ────────────────────

export interface AddressInput {
  company_name?: string;
  contact_name?: string;
  line1: string;
  line2?: string;
  suburb?: string;
  city: string;
  province?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  instructions?: string;
}

export interface OrderPricingInput {
  subtotal: number;
  discount_amount?: number;
  delivery_amount?: number;
  vat_amount: number;
  total_amount: number;
  amount_paid?: number;
  amount_due: number;
  currency?: string;
}

export interface JobProofInput {
  proof_type: ProofType;
  viewer_type: ProofViewerType;
  viewer_url?: string;
  document_id?: UUID;
  metadata?: Record<string, unknown>;
}

export interface CreateOrderJobInput {
  external_product_key?: string;
  product_name: string;
  product_category?: string;
  job_name?: string;
  quantity: number;
  unit_label?: string;
  net_price: number;
  gross_price: number;
  vat_rate?: number;
  product_snapshot?: Record<string, unknown>;
  configuration?: JobConfiguration;
  production_specs?: Record<string, unknown>;
  integration_payload?: Record<string, unknown>;
  proof?: JobProofInput;
}

export interface CreateOrderPayload {
  app_slug: string;
  tenant_id: UUID;
  branch_id?: UUID;
  customer: {
    profile_id: UUID;
    email: string;
    name: string;
    company_name?: string;
  };
  order: {
    external_order_ref?: string;
    source_channel?: string;
    storefront_name?: string;
    currency?: string;
    date_required?: string;
    turnaround_time_text?: string;
    external_code?: string;
    notes_customer?: string;
    metadata?: Record<string, unknown>;
  };
  billing_address: AddressInput;
  delivery_address: AddressInput;
  pricing: OrderPricingInput;
  jobs: CreateOrderJobInput[];
}

export interface UpdateJobStatusPayload {
  job_id: UUID;
  job_status: JobStatus;
  reason?: string;
}

export interface RecordPaymentPayload {
  order_id: UUID;
  provider: PaymentProvider;
  provider_transaction_id?: string;
  payment_reference?: string;
  status: PaymentRecord['status'];
  amount: number;
  currency?: string;
  raw_payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AttachDocumentPayload {
  order_id?: UUID;
  job_id?: UUID;
  document_type: DocumentType;
  title?: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  public_url?: string;
  mime_type?: string;
  file_size_bytes?: number;
  is_customer_visible?: boolean;
  source_app_managed?: boolean;
  metadata?: Record<string, unknown>;
}

// ─── Filter types ─────────────────────────────────────────

export interface AdminOrderListFilters {
  search?: string;
  app_id?: UUID;
  tenant_id?: UUID;
  branch_id?: UUID;
  admin_status?: OrderAdminStatus[];
  payment_status?: PaymentStatus[];
  customer_status?: OrderCustomerStatus[];
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface ClientOrderListFilters {
  customer_status?: OrderCustomerStatus[];
  payment_status?: PaymentStatus[];
  page?: number;
  page_size?: number;
}
