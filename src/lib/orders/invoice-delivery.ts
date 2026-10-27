export interface InvoiceEmail {
  id: string;
  status: string;
  sent_at: string | null;
  queued_at: string;
  to_email: string;
  metadata: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function resolveInvoiceDelivery(invoiceId: string, metadata: unknown, emails: InvoiceEmail[]) {
  const matching = emails.filter(email => record(email.metadata).invoice_id === invoiceId)
    .sort((a, b) => Date.parse(b.queued_at) - Date.parse(a.queued_at));
  const latest = matching[0];
  const sent = matching.filter(email => email.status === "sent" && email.sent_at)
    .sort((a, b) => Date.parse(b.sent_at ?? "") - Date.parse(a.sent_at ?? ""))[0];
  const stored = record(metadata);
  const lastSentAt = sent?.sent_at ?? (typeof stored.last_sent_at === "string" ? stored.last_sent_at : null);
  const sentTo = sent?.to_email ?? (typeof stored.sent_to === "string" ? stored.sent_to : null);
  const pending = !!latest && ["queued", "pending", "sending", "processing"].includes(latest.status);
  const failed = !!latest && ["failed", "dlq", "cancelled"].includes(latest.status);
  return { pending, failed, lastSentAt, sentTo, sent: !!lastSentAt };
}

export function assertInvoiceEmailQueued(result: { queued?: boolean; skipped?: boolean; reason?: string } | null) {
  if (result?.queued && !result.skipped) return;
  if (result?.reason === "no_email") throw new Error("This customer has no email address.");
  if (result?.reason === "synthetic_demo_recipient") throw new Error("Emails cannot be sent to this demo address.");
  throw new Error("The invoice email was not queued. Please try again.");
}