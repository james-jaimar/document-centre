// Shared helper to redirect the browser to a hosted payment page (Stripe
// Checkout or PayFast). After the 2026-06 rewrite both providers use a
// simple `window.location.assign(redirect_url)` — for PayFast the URL is a
// Supabase-hosted handoff page that server-renders an auto-submit form.
// This removes the fragile in-page cross-origin POST and the 1.8s timing
// race that produced misleading "browser blocked the redirect" errors.
import { supabase } from "@/integrations/supabase/client";

export interface StartHostedPaymentArgs {
  orderId: string;
  provider: "stripe" | "payfast";
  returnUrl: string;
  cancelUrl: string;
}

/** Calls payments-create-session and navigates to the returned URL. Throws on error. */
export async function startHostedPayment(args: StartHostedPaymentArgs): Promise<void> {
  const { data, error } = await supabase.functions.invoke("payments-create-session", {
    body: {
      order_id: args.orderId,
      provider: args.provider,
      return_url: args.returnUrl,
      cancel_url: args.cancelUrl,
    },
  });
  if (error) {
    const msg = (error as any)?.context?.error || (error as any)?.message || "Failed to start payment";
    throw new Error(typeof msg === "string" ? msg : "Failed to start payment");
  }
  if (!data?.redirect_url) {
    throw new Error("Payment session response was empty");
  }
  window.location.assign(data.redirect_url);
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
