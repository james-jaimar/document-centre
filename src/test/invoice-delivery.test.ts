import { describe, expect, it } from "vitest";
import { assertInvoiceEmailQueued, resolveInvoiceDelivery, type InvoiceEmail } from "@/lib/orders/invoice-delivery";

const email = (status: string, overrides: Partial<InvoiceEmail> = {}): InvoiceEmail => ({
  id: "email-1", status, sent_at: status === "sent" ? "2026-10-27T15:02:00Z" : null,
  queued_at: "2026-10-27T15:01:00Z", to_email: "customer@example.com", metadata: { invoice_id: "invoice-1" }, ...overrides,
});

describe("invoice delivery tracking", () => {
  it("does not mark a queued invoice as sent", () => {
    expect(resolveInvoiceDelivery("invoice-1", {}, [email("queued")])).toMatchObject({ pending: true, sent: false });
  });
  it("marks confirmed sent mail with its actual time and recipient", () => {
    expect(resolveInvoiceDelivery("invoice-1", {}, [email("sent")])).toMatchObject({
      pending: false, sent: true, lastSentAt: "2026-10-27T15:02:00Z", sentTo: "customer@example.com",
    });
  });
  it("does not borrow another document's send status", () => {
    expect(resolveInvoiceDelivery("invoice-2", {}, [email("sent")]).sent).toBe(false);
  });
  it("shows a failed resend without forgetting the previous successful send", () => {
    expect(resolveInvoiceDelivery("invoice-1", {}, [email("sent"), email("failed", { id: "email-2", queued_at: "2026-10-27T15:03:00Z" })]))
      .toMatchObject({ failed: true, sent: true, lastSentAt: "2026-10-27T15:02:00Z" });
  });
  it("keeps a previous confirmed send while a resend is queued", () => {
    expect(resolveInvoiceDelivery("invoice-1", { last_sent_at: "2026-10-26T12:00:00Z", sent_to: "old@example.com" }, [email("queued")]))
      .toMatchObject({ pending: true, sent: true, sentTo: "old@example.com" });
  });
  it("rejects skipped responses instead of claiming success", () => {
    expect(() => assertInvoiceEmailQueued({ skipped: true, reason: "no_email" })).toThrow("no email address");
    expect(() => assertInvoiceEmailQueued({ skipped: true, reason: "synthetic_demo_recipient" })).toThrow("demo address");
    expect(() => assertInvoiceEmailQueued(null)).toThrow();
  });
  it("accepts a real queued response", () => {
    expect(() => assertInvoiceEmailQueued({ queued: true })).not.toThrow();
  });
});