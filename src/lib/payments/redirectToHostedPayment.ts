// Shared helper to redirect the browser to a hosted payment page (Stripe Checkout
// or PayFast). Centralised so checkout / Pay Now / reorder all behave the same.
import { supabase } from "@/integrations/supabase/client";

export interface StartHostedPaymentArgs {
  orderId: string;
  provider: "stripe" | "payfast";
  returnUrl: string;
  cancelUrl: string;
}

/** Calls payments-create-session and performs the redirect/POST. Throws on error. */
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
    // Surface backend error message if present
    const msg = (error as any)?.context?.error || (error as any)?.message || "Failed to start payment";
    throw new Error(typeof msg === "string" ? msg : "Failed to start payment");
  }
  if (args.provider === "stripe") {
    if (!data?.redirect_url) throw new Error("Stripe session response was empty");
    window.location.assign(data.redirect_url);
    return;
  }
  // PayFast — auto-POST a hidden form
  if (!data?.form_action || !data?.form_fields) {
    throw new Error("PayFast session response was empty");
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = data.form_action;
  form.style.display = "none";
  Object.entries(data.form_fields as Record<string, string>).forEach(([k, v]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = String(v ?? "");
    form.appendChild(input);
  });
  document.body.appendChild(form);
  // Use the native submit (avoid any wrapper that might no-op).
  HTMLFormElement.prototype.submit.call(form);
}

/** Fetch resolved online providers for an order via payments-list-providers. */
export async function listOrderOnlineProviders(orderId: string): Promise<
  Array<{ provider: "stripe" | "payfast"; mode: "test" | "live"; source: "branch" | "tenant"; display_label?: string | null }>
> {
  const { data, error } = await supabase.functions.invoke("payments-list-providers", {
    method: "GET" as any,
    body: undefined,
    // supabase-js doesn't accept query params natively for invoke; fall through to fetch
  } as any).catch(() => ({ data: null, error: new Error("invoke failed") } as any));

  if (data?.providers) return data.providers;

  // Fallback: direct fetch with query string (invoke doesn't support GET query reliably)
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payments-list-providers?order_id=${encodeURIComponent(orderId)}`;
  const res = await fetch(url, {
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: token ? `Bearer ${token}` : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`payments-list-providers failed (${res.status})`);
  const body = await res.json();
  return body.providers ?? [];
}
