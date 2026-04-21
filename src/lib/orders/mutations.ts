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

// ── Secure document access helpers ──────────────────────────

/**
 * Download or view a document via the secure document-access edge function.
 * Never exposes direct Supabase storage URLs to the browser.
 */
async function accessDocument(
  type: "invoice" | "document",
  id: string,
  fileName: string,
  disposition: "attachment" | "inline" = "attachment"
) {
  const { data, error } = await supabase.functions.invoke("document-access", {
    body: { type, id, disposition },
  });

  if (error) {
    throw new Error(error.message || "Failed to access document");
  }

  // data is a Blob when the function returns binary
  const blob = data instanceof Blob ? data : new Blob([data], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);

  if (disposition === "inline") {
    window.open(blobUrl, "_blank");
    // Revoke after a delay so the tab can load
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } else {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  }
}

export async function downloadInvoice(invoiceId: string, fileName: string) {
  return accessDocument("invoice", invoiceId, fileName, "attachment");
}

export async function viewInvoice(invoiceId: string, fileName: string) {
  return accessDocument("invoice", invoiceId, fileName, "inline");
}

export async function downloadDocument(documentId: string, fileName: string) {
  return accessDocument("document", documentId, fileName, "attachment");
}

export async function viewDocument(documentId: string, fileName: string) {
  return accessDocument("document", documentId, fileName, "inline");
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

export async function sendInvoiceEmail(invoiceId: string, orderId: string) {
  const { data, error } = await supabase.functions.invoke("send-order-email", {
    body: { order_id: orderId, event_key: "invoice_sent", invoice_id: invoiceId, force: true },
  });
  if (error) throw new Error(error.message || "Failed to send invoice email");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function requestPayment(orderId: string) {
  const { data, error } = await supabase.functions.invoke("send-order-email", {
    body: { order_id: orderId, event_key: "payment_request", force: true },
  });
  if (error) throw new Error(error.message || "Failed to send payment request");
  if (data?.error) throw new Error(data.error);
  return data;
}

// ── Production document processing ──────────────────────────

export interface ProcessDocumentResult {
  assetId: string;
  grayscaleJobId?: string;
  resizeJobId?: string;
  error?: string;
}

/**
 * Orchestrate grayscale/resize calls for a single document.
 * Fires and forgets — returns immediately with job IDs for optional polling.
 * Does NOT block order placement on failure (graceful degradation).
 */
export async function processDocumentForProduction(params: {
  backendAssetId: string;
  needsGrayscale: boolean;
  needsResize: boolean;
  targetWidthMm?: number;
  targetHeightMm?: number;
}): Promise<ProcessDocumentResult> {
  const { grayscale, resize } = await import("@/lib/documentCentreApi");
  const result: ProcessDocumentResult = { assetId: params.backendAssetId };

  try {
    if (params.needsGrayscale) {
      const { job_id } = await grayscale(params.backendAssetId);
      result.grayscaleJobId = job_id;
    }
    if (params.needsResize && params.targetWidthMm && params.targetHeightMm) {
      const { job_id } = await resize(
        params.backendAssetId,
        params.targetWidthMm,
        params.targetHeightMm
      );
      result.resizeJobId = job_id;
    }
  } catch (e: any) {
    console.warn("[processDocumentForProduction] failed (non-blocking):", e?.message);
    result.error = e?.message ?? "Processing failed";
  }

  return result;
}
