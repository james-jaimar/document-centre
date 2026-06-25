// Hosted-payment helpers.
//
// Stripe: server returns `redirect_url` (Stripe Checkout session) — we
// navigate to it directly.
//
// PayFast: server returns a signed `form` payload `{ action, method, fields }`.
// We stash it in sessionStorage and navigate to a same-origin React page
// (/pay/payfast) that renders a real <form> with an auto-submit + visible
// "Continue to PayFast" fallback button. This matches PayFast's documented
// "Custom Integration" flow exactly and avoids dynamic JS form injection,
// which some browsers block.
//
// Credentials never appear in any URL; failures degrade to a user-friendly
// message (no internal error text shown to customers).
import { supabase } from "@/integrations/supabase/client";
import { PAYFAST_HANDOFF_KEY } from "@/pages/PayfastHandoff";

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

  // Stripe — direct redirect to hosted checkout.
  if (data.redirect_url) {
    window.location.assign(data.redirect_url);
    return;
  }

  // PayFast — stash signed form payload and hand off via same-origin page.
  if (data.provider === "payfast" && data.form?.action && data.form.fields) {
    try {
      sessionStorage.setItem(
        PAYFAST_HANDOFF_KEY,
        JSON.stringify({ form: data.form, cancelUrl: args.cancelUrl }),
      );
    } catch {
      throw new Error("Your browser blocked the secure payment handoff. Please enable storage and try again.");
    }
    window.location.assign("/pay/payfast");
    return;
  }

  throw new Error("Payment session response was invalid.");
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
