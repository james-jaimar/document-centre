import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Same-origin PayFast handoff page.
 *
 * Why this exists (don't remove it without re-reading PayFast docs):
 *   PayFast's "Custom Integration" is a documented HTML form POST to
 *   /eng/process. Dynamically creating and submitting a hidden form via
 *   JS gets flagged by some browsers' CSP/security heuristics. A real,
 *   visible <form> element on a same-origin React page with an explicit
 *   user-tappable "Continue to PayFast" button is the bullet-proof,
 *   doc-compliant approach.
 *
 * Flow:
 *   1. Checkout/Order page calls payments-create-session.
 *   2. The server returns the signed PayFast form payload.
 *   3. We stash it in sessionStorage under a known key.
 *   4. We navigate the browser to /pay/payfast.
 *   5. This page reads the payload, renders a real <form>, auto-submits
 *      once, and shows a "Continue to PayFast" button as fallback.
 *
 * Credentials never appear in URLs. Nothing is exposed beyond the hidden
 * fields PayFast itself requires, exactly as their docs prescribe.
 */

export const PAYFAST_HANDOFF_KEY = "lov.payfast.handoff";

interface PayfastFormPayload {
  action: string;
  method?: string;
  fields: Record<string, string>;
}

interface HandoffPayload {
  form: PayfastFormPayload;
  cancelUrl?: string;
}

export default function PayfastHandoff() {
  const [payload, setPayload] = useState<HandoffPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PAYFAST_HANDOFF_KEY);
      if (!raw) {
        setError("Your payment session expired. Please go back to your order and tap Pay Online again.");
        return;
      }
      const parsed = JSON.parse(raw) as HandoffPayload;
      if (!parsed?.form?.action || !parsed?.form?.fields) {
        setError("We couldn't prepare your payment. Please return to your order and try again.");
        return;
      }
      setPayload(parsed);
    } catch {
      setError("We couldn't prepare your payment. Please return to your order and try again.");
    }
  }, []);

  // Auto-submit once the form is in the DOM. Wrapped in a small timeout to
  // ensure the browser has painted (some browsers race the submit with
  // hydration and silently drop it).
  useEffect(() => {
    if (!payload || !formRef.current || submittedRef.current) return;
    submittedRef.current = true;
    const id = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(PAYFAST_HANDOFF_KEY);
        formRef.current?.submit();
      } catch {
        /* user can still tap the manual button */
      }
    }, 150);
    return () => window.clearTimeout(id);
  }, [payload]);

  const fields = useMemo(() => {
    if (!payload) return [];
    // Render in the order the server returned them — PayFast signature
    // is order-sensitive, but the field order in the form body itself
    // does not affect the POST; we keep it for readability/debugging.
    return Object.entries(payload.form.fields);
  }, [payload]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-center space-y-4">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-foreground">Payment unavailable</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => window.history.length > 1 ? window.history.back() : (window.location.href = "/")}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Back to order
            </button>
          </>
        ) : !payload ? (
          <p className="text-sm text-muted-foreground">Preparing secure payment…</p>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-foreground">Redirecting to PayFast…</h1>
            <p className="text-sm text-muted-foreground">
              You'll be taken to PayFast's secure payment page. If nothing happens within
              a few seconds, tap the button below.
            </p>
            <form
              ref={formRef}
              action={payload.form.action}
              method={(payload.form.method || "POST").toUpperCase()}
              acceptCharset="UTF-8"
            >
              {fields.map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <button
                type="submit"
                className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Continue to PayFast
              </button>
            </form>
            {payload.cancelUrl && (
              <a
                href={payload.cancelUrl}
                className="block text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Cancel and return to your order
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
