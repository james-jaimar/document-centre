import { supabase } from "@/integrations/supabase/client";
import type {
  CreateOrderPayload,
  UpdateJobStatusPayload,
  RecordPaymentPayload,
  AttachDocumentPayload,
} from "./types";

async function invokeOrderEngine<T = unknown>(
  action: string,
  payload: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("order-engine", {
    body: { action, ...payload },
  });

  if (error) {
    throw new Error(error.message || `order-engine ${action} failed`);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as T;
}

// ── Exported mutation functions ─────────────────────────────

export async function createOrderWithJobs(payload: CreateOrderPayload) {
  return invokeOrderEngine<{
    order_id: string;
    order_number: string;
    jobs: Array<{ id: string; job_number: string; sequence_no: number }>;
  }>("createOrderWithJobs", payload as unknown as Record<string, unknown>);
}

export async function updateJobStatus(payload: UpdateJobStatusPayload) {
  return invokeOrderEngine<{
    success: boolean;
    from_status: string;
    to_status: string;
  }>("updateJobStatus", payload as unknown as Record<string, unknown>);
}

export async function recordPaymentEvent(payload: RecordPaymentPayload) {
  return invokeOrderEngine<{
    success: boolean;
    payment_id: string;
  }>("recordPaymentEvent", payload as unknown as Record<string, unknown>);
}

export async function attachOrderDocument(payload: AttachDocumentPayload) {
  return invokeOrderEngine<{
    success: boolean;
    document_id: string;
  }>("attachOrderDocument", payload as unknown as Record<string, unknown>);
}

export async function createJobProof(payload: {
  job_id: string;
  proof_type: string;
  viewer_type: string;
  viewer_url?: string;
  document_id?: string;
  metadata?: Record<string, unknown>;
}) {
  return invokeOrderEngine<{
    success: boolean;
    proof_id: string;
  }>("createJobProof", payload);
}

export async function sendMessage(payload: {
  order_id: string;
  job_id?: string;
  message_body: string;
  sender_type: "admin" | "customer" | "system";
  recipient_type?: "thread" | "customer" | "admin";
  is_internal?: boolean;
}) {
  return invokeOrderEngine<{
    success: boolean;
    message_id: string;
    created_at: string;
  }>("sendMessage", payload);
}

export async function refundPayment(payload: {
  order_id: string;
  amount: number;
  reason?: string;
  provider?: string;
}) {
  return invokeOrderEngine<{ success: boolean; payment_id: string }>("refundPayment", payload);
}

export async function cancelOrder(payload: { order_id: string; reason: string }) {
  return invokeOrderEngine<{ success: boolean; refund_pending: boolean }>("cancelOrder", payload);
}

export async function generateInvoice(payload: {
  order_id: string;
  kind?: "proforma" | "invoice" | "credit_note" | "receipt";
}) {
  return invokeOrderEngine<{ success: boolean }>("generateInvoice", payload);
}

export async function downloadInvoice(storage_bucket: string, storage_path: string, file_name: string) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.storage.from(storage_bucket).createSignedUrl(storage_path, 60);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Failed to get download URL");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = file_name;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
