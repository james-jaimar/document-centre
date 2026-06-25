// Hosted-payment helpers.
//
// Stripe: `payments-create-session` returns `redirect_url` (Stripe Checkout
// session URL) and we navigate to it.
//
// PayFast: `payments-create-session` returns a signed `form` payload
// (`{ action, method, fields }`). We render a hidden form on the APP origin
// and submit it. The app's CSP `form-action` already whitelists
// payfast.co.za, so the cross-origin POST is allowed by the browser, and
// nothing about the merchant credentials ever appears in a visible URL.
//
// Failures degrade to a clean error — never expose internal reasons to the
// customer (the edge function returns a safe `code` like
// `PAYFAST_CONFIG_INCOMPLETE` and a user-friendly message).
import { supabase } from "@/integrations/supabase/client";

export interface StartHostedPaymentArgs {
  orderId: string;
  provider: "stripe" | "payfast";
  returnUrl: string;
  cancelUrl: string;
}

interface PayfastFormPayload {
  action: string;
  method?: string;
  fields: Record<string, string>;
}

interface SessionResponse {
  redirect_url?: string;
  provider?: "stripe" | "payfast";
  form?: PayfastFormPayload;
  error?: string;
  code?: string;
}

/** Calls payments-create-session and hands off to the gateway. Throws on error. */
export async function startHostedPayment(args: StartHostedPaymentArgs): Promise<void> {
  const { data, error } = await supabase.functions.invoke<SessionResponse>("payments-create-session", {
    body: {
      order_id: args.orderId,
      provider: args.provider,
      return_url: args.returnUrl,
      cancel_url: args.cancelUrl,
    },
  });
  if (error) {
    // supabase-js wraps function errors. Try to read the structured body.
    let msg = "We couldn't start your online payment. Please try again or pay by EFT.";
    const ctx: any = (error as any)?.context;
    try {
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error && typeof body.error === "string") msg = body.error;
      } else if (typeof ctx?.error === "string") {
        msg = ctx.error;
      }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (!data) {
    throw new Error("Payment service did not respond. Please try again.");
  }

  // Stripe path
  if (data.redirect_url) {
    window.location.assign(data.redirect_url);
    return;
  }

  // PayFast path — build a hidden form on the app origin and submit.
  if (data.provider === "payfast" && data.form?.action && data.form.fields) {
    submitHiddenForm(data.form);
    return;
  }

  throw new Error("Payment session response was invalid.");
}

/** Builds a hidden form, appends it to the document, and submits it. */
function submitHiddenForm(form: PayfastFormPayload): void {
  const f = document.createElement("form");
  f.method = (form.method || "POST").toUpperCase();
  f.action = form.action;
  f.style.display = "none";
  f.acceptCharset = "UTF-8";
  for (const [name, value] of Object.entries(form.fields)) {
    if (value == null) continue;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    f.appendChild(input);
  }
  document.body.appendChild(f);
  f.submit();
}

export interface OrderOnlineProvider {
  provider: "stripe" | "payfast";
  mode: "test" | "live";
  source: "branch" | "tenant";
  display_label?: string | null;
}

/** Fetch resolved online providers for an order via payments-list-providers (GET). */
export async function listOrderOnlineProviders(orderId: string): Promise<OrderOnlineProvider[]> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payments-list-providers?order_id=${encodeURIComponent(orderId)}`;
  const res = await fetch(url, {
    headers: {
      apikey,
      Authorization: token ? `Bearer ${token}` : `Bearer ${apikey}`,
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`payments-list-providers failed (${res.status}): ${txt}`);
  }
  const body = await res.json();
  return (body.providers ?? []) as OrderOnlineProvider[];
}
