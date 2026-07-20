import { toast } from "sonner";

/**
 * Structured error surfaced by send-email / send-order-email / send-quote-email
 * when the branch or tenant has no active sender account configured.
 *
 * The edge functions return this as HTTP 200 with `{ error: "EMAIL_NOT_CONFIGURED", ... }`
 * so `supabase.functions.invoke` gives us `data.error` (not a thrown non-2xx).
 */
export interface EmailNotConfiguredPayload {
  error: "EMAIL_NOT_CONFIGURED";
  scope: "branch" | "tenant";
  tenant_id: string | null;
  branch_id: string | null;
  message?: string;
}

function isNotConfigured(value: unknown): value is EmailNotConfiguredPayload {
  return (
    !!value &&
    typeof value === "object" &&
    (value as any).error === "EMAIL_NOT_CONFIGURED"
  );
}

/**
 * Extracts EMAIL_NOT_CONFIGURED from either an edge function `data` payload
 * or from a caught error's message. Returns the payload or null.
 */
export function extractEmailNotConfigured(
  data: unknown,
  error?: unknown,
): EmailNotConfiguredPayload | null {
  if (isNotConfigured(data)) return data;
  if (error) {
    const msg =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "";
    if (msg.includes("EMAIL_NOT_CONFIGURED")) {
      return {
        error: "EMAIL_NOT_CONFIGURED",
        scope: "branch",
        tenant_id: null,
        branch_id: null,
        message: msg,
      };
    }
  }
  return null;
}

/**
 * Shows a friendly "email not configured" toast with a shortcut to the
 * relevant settings page. Returns true if it handled the error, so callers
 * can skip generic error toasts.
 */
export function handleEmailSendError(data: unknown, error?: unknown): boolean {
  const payload = extractEmailNotConfigured(data, error);
  if (!payload) return false;

  const settingsPath =
    payload.scope === "branch"
      ? "/branch/settings?tab=email"
      : "/admin/settings?tab=email";

  toast.error("Email not sent — sender not configured", {
    description:
      payload.scope === "branch"
        ? "This branch hasn't set up an outgoing email account yet. Add one to send mail from your own address."
        : "This tenant hasn't set up an outgoing email account yet.",
    duration: 10_000,
    action: {
      label: "Configure email",
      onClick: () => {
        window.location.assign(settingsPath);
      },
    },
  });

  return true;
}
