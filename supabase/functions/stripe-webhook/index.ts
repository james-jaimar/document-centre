import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import {
  platformNotify,
  tenantOwnerEmails,
  platformAdminEmails,
  platformEmailLayout,
} from "../_shared/platform-notify.ts";


const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`Stripe event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const branchId = session.metadata?.branch_id;
        const tenantId = session.metadata?.tenant_id;
        if (!session.subscription) break;
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        if (branchId) {
          await upsertBranchSubscription(branchId, sub.metadata?.tenant_id || tenantId!, session.customer as string, sub);
        } else if (tenantId) {
          await upsertSubscription(tenantId, session.customer as string, sub);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const branchId = sub.metadata?.branch_id;
        const tenantId = sub.metadata?.tenant_id;
        if (branchId) {
          await upsertBranchSubscription(branchId, tenantId!, sub.customer as string, sub);
        } else if (tenantId) {
          await upsertSubscription(tenantId, sub.customer as string, sub);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const branchId = sub.metadata?.branch_id;
        const tenantId = sub.metadata?.tenant_id;
        if (branchId) {
          await supabaseAdmin
            .from("branch_subscriptions" as any)
            .update({ status: "cancelled", billing_status: "pending_payment", cancelled_at: new Date().toISOString() })
            .eq("stripe_subscription_id", sub.id);
        } else if (tenantId) {
          await supabaseAdmin
            .from("tenant_subscriptions")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("stripe_subscription_id", sub.id);
          await supabaseAdmin.from("tenants").update({ plan_slug: "starter" }).eq("id", tenantId);
        }
        if (tenantId) notifyTenant(tenantId, "subscription_cancelled");
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;
        const subId = invoice.subscription as string;
        // Try branch table first then tenant table — only one will hit
        const { data: bsHit } = await supabaseAdmin
          .from("branch_subscriptions" as any)
          .update({ status: "active", billing_status: "paid" })
          .eq("stripe_subscription_id", subId).select("id, tenant_id");
        let tenantId: string | null = (bsHit as any[])?.[0]?.tenant_id ?? null;
        if (!bsHit || (bsHit as any[]).length === 0) {
          const { data: tsHit } = await supabaseAdmin.from("tenant_subscriptions")
            .update({ status: "active" }).eq("stripe_subscription_id", subId).select("tenant_id");
          tenantId = (tsHit as any[])?.[0]?.tenant_id ?? null;
        }
        if (tenantId) {
          notifyTenant(tenantId, "invoice_paid", {
            amount: invoice.amount_paid,
            currency: invoice.currency,
            number: invoice.number,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;
        const subId = invoice.subscription as string;
        const { data: bsHit } = await supabaseAdmin
          .from("branch_subscriptions" as any)
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subId).select("id, tenant_id");
        let tenantId: string | null = (bsHit as any[])?.[0]?.tenant_id ?? null;
        if (!bsHit || (bsHit as any[]).length === 0) {
          const { data: tsHit } = await supabaseAdmin.from("tenant_subscriptions")
            .update({ status: "past_due" }).eq("stripe_subscription_id", subId).select("tenant_id");
          tenantId = (tsHit as any[])?.[0]?.tenant_id ?? null;
        }
        if (tenantId) {
          notifyTenant(tenantId, "invoice_failed", {
            amount: invoice.amount_due,
            currency: invoice.currency,
            number: invoice.number,
            include_platform_admins: true,
          });
        }
        break;
      }
    }

  } catch (err) {
    console.error("Error processing webhook:", err);
    return new Response(JSON.stringify({ error: "Processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function upsertSubscription(
  tenantId: string,
  stripeCustomerId: string,
  sub: Stripe.Subscription
) {
  const planSlug = sub.metadata?.plan_slug || "starter";
  const item = sub.items.data[0];

  const billingStatus = sub.status === "active" || sub.status === "trialing" ? "paid" : "pending_payment";

  const record = {
    tenant_id: tenantId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: sub.id,
    plan_slug: planSlug,
    status: sub.status,
    billing_status: billingStatus,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    metadata: {
      stripe_price_id: item?.price?.id,
      stripe_product_id: item?.price?.product,
    },
  };

  const { error } = await supabaseAdmin
    .from("tenant_subscriptions")
    .upsert(record, { onConflict: "tenant_id" });

  if (error) {
    console.error("Error upserting subscription:", error);
    throw error;
  }

  // Sync plan_slug to tenants table
  await supabaseAdmin
    .from("tenants")
    .update({ plan_slug: planSlug })
    .eq("id", tenantId);
}

async function upsertBranchSubscription(
  branchId: string,
  tenantId: string,
  stripeCustomerId: string,
  sub: Stripe.Subscription
) {
  const planSlug = sub.metadata?.plan_slug || "branch";
  const item = sub.items.data[0];
  const billingStatus = sub.status === "active" || sub.status === "trialing" ? "paid" : "pending_payment";
  const record = {
    branch_id: branchId,
    tenant_id: tenantId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: sub.id,
    plan_slug: planSlug,
    status: sub.status,
    billing_status: billingStatus,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    metadata: {
      stripe_price_id: item?.price?.id,
      stripe_product_id: item?.price?.product,
    },
  };
  const { error } = await supabaseAdmin
    .from("branch_subscriptions" as any)
    .upsert(record, { onConflict: "branch_id" });
  if (error) {
    console.error("Error upserting branch subscription:", error);
    throw error;
  }
}

// Best-effort fire-and-forget. Not awaited from the webhook caller so a slow
// SMTP/Graph send never blocks the Stripe response.
function notifyTenant(
  tenantId: string,
  event: "subscription_cancelled" | "invoice_paid" | "invoice_failed",
  opts: { amount?: number | null; currency?: string | null; number?: string | null; include_platform_admins?: boolean } = {},
) {
  (async () => {
    try {
      const { data: tenant } = await supabaseAdmin
        .from("tenants").select("name").eq("id", tenantId).maybeSingle();
      const tenantName = (tenant as any)?.name ?? "your account";
      const recipients = new Set<string>(await tenantOwnerEmails(supabaseAdmin, tenantId));
      if (opts.include_platform_admins) {
        for (const a of await platformAdminEmails(supabaseAdmin)) recipients.add(a);
      }

      let subject = "";
      let bodyHtml = "";
      if (event === "subscription_cancelled") {
        subject = `Subscription cancelled — ${tenantName}`;
        bodyHtml = `<p>The Document Centre subscription for <strong>${tenantName}</strong> has been cancelled.</p>
          <p>You'll continue to have access until the end of the current billing period. Sign in any time to reactivate.</p>`;
      } else if (event === "invoice_paid") {
        const amt = opts.amount != null && opts.currency
          ? `${(opts.amount / 100).toFixed(2)} ${String(opts.currency).toUpperCase()}` : "";
        subject = `Receipt — ${opts.number ?? "invoice"} (${tenantName})`;
        bodyHtml = `<p>Thanks — we've received your payment${amt ? ` of <strong>${amt}</strong>` : ""}.</p>
          ${opts.number ? `<p>Invoice number: <strong>${opts.number}</strong></p>` : ""}`;
      } else {
        const amt = opts.amount != null && opts.currency
          ? `${(opts.amount / 100).toFixed(2)} ${String(opts.currency).toUpperCase()}` : "";
        subject = `Payment failed — ${tenantName}`;
        bodyHtml = `<p>We couldn't collect ${amt ? `<strong>${amt}</strong>` : "payment"} for your Document Centre subscription.</p>
          ${opts.number ? `<p>Invoice number: <strong>${opts.number}</strong></p>` : ""}
          <p>Please update your billing details to avoid interruption.</p>`;
      }

      await platformNotify(supabaseAdmin, {
        event,
        recipients: [...recipients],
        tenant_id: tenantId,
        related_type: "stripe",
        related_id: tenantId,
        subject,
        html: platformEmailLayout(subject, bodyHtml),
      });
    } catch (e) {
      console.error(`notifyTenant(${event}) failed:`, e);
    }
  })();
}

  }
}
