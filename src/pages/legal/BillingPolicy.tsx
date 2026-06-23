import LegalLayout from "./LegalLayout";
import { LEGAL_ENTITY as E } from "@/lib/legal/entity";
import { LEGAL_DOCS } from "@/lib/legal/versions";

export default function BillingPolicy() {
  const v = LEGAL_DOCS.billing;
  return (
    <LegalLayout title={v.title} updated={v.effective} version={v.version}>
      <p>
        This Billing &amp; Cancellation Policy applies to subscriptions to the Document Centre
        platform paid through our payment processor, Stripe Payments Europe, Limited
        ("Stripe"). It supplements the Terms of Service; in the event of conflict, the Terms of
        Service prevail.
      </p>

      <h2>1. Who you are paying</h2>
      <p>
        Your subscription is billed by <strong>{E.legalName}</strong>, a company registered in{" "}
        {E.jurisdiction} (Company No. {E.companyNumber}), trading as <strong>{E.tradingName}</strong>.
        Invoices and card statements will show a descriptor referencing Document Centre and/or
        Jaimar Developments — for example, <code>DOCCENTRE*JAIMAR</code>. The exact descriptor
        depends on your card issuer and may vary in length.
      </p>

      <h2>2. Pricing, currency and tax</h2>
      <ul>
        <li>The price, billing interval and currency for each plan are shown on the pricing page and confirmed at checkout before payment.</li>
        <li>{E.legalName} is established in the United Kingdom and is <strong>not currently registered for UK VAT</strong>. No UK VAT is charged on subscription fees, and prices are quoted "VAT not applicable" until that status changes.</li>
        <li>For Tenants established outside the United Kingdom, the supply of the Service is treated as a business-to-business supply of electronically supplied services with the place of supply being the Tenant's country. Tenants are responsible for self-assessing any VAT, GST, sales tax or equivalent indirect tax due in their own jurisdiction (for example, the South African reverse-charge or electronic-services rules).</li>
        <li>Stripe may apply currency-conversion fees if your card is denominated in a currency different to the billing currency of your plan.</li>
      </ul>

      <h2>3. Trials</h2>
      <p>
        Where a plan offers a free trial, the trial length is shown at checkout. We do not
        require a payment method to begin a trial unless the checkout flow specifically says
        otherwise. At the end of the trial, your subscription will only be activated when a
        valid payment method has been added and the first invoice has been paid; until then
        your branch may move to a "trial expired" state and your portal will become read-only
        for new orders.
      </p>

      <h2>4. Billing cycle</h2>
      <p>
        Subscriptions are billed in advance for each billing period (monthly unless otherwise
        agreed). The first charge is taken when you complete checkout; subsequent charges are
        taken on the same calendar day each period. If that day does not exist in a given month
        (for example, the 31st in February), Stripe will bill on the last day of that month.
      </p>

      <h2>5. Failed payments and grace period</h2>
      <p>
        If a renewal payment fails, Stripe will automatically retry the payment over a short
        recovery window using its standard "Smart Retries" logic. During this time:
      </p>
      <ul>
        <li>The subscription is marked <strong>past-due</strong> in your branch portal.</li>
        <li>You will be notified by email and shown an in-app banner with a "Manage Billing" link to update your payment method through the Stripe-hosted billing portal.</li>
        <li>For up to <strong>7 days</strong> from the date of the first failed renewal (the "grace period"), your branch remains in full operational use, so that you can update payment details without disrupting customers.</li>
        <li>If the grace period ends without successful payment, the branch is placed in a <strong>read-only</strong> state: no new orders, uploads or storefront checkouts are accepted, but you and your team retain read access to historical data so you can resolve the issue.</li>
        <li>If non-payment continues beyond Stripe's retry schedule, Stripe will mark the subscription <strong>unpaid</strong> or <strong>cancelled</strong>; we will then treat the subscription as cancelled in accordance with Section 7.</li>
      </ul>

      <h2>6. Refunds</h2>
      <p>
        Subscription fees are charged in advance and are <strong>non-refundable</strong>, including
        for partial billing periods on cancellation. We do not pro-rate refunds for cancellations
        taking effect before the end of the current billing period.
      </p>
      <p>
        Nothing in this section limits any non-waivable consumer right you may have under
        applicable law (which, for most business-to-business subscribers, do not apply).
      </p>

      <h2>7. Cancellation</h2>
      <p>
        You may cancel your subscription at any time:
      </p>
      <ul>
        <li>From within your branch portal under <strong>Settings → Subscription → Manage Billing</strong>, which opens the Stripe-hosted billing portal; or</li>
        <li>By emailing <a href={`mailto:${E.supportEmail}`}>{E.supportEmail}</a> from the registered billing address on the account.</li>
      </ul>
      <p>
        Cancellation takes effect at the <strong>end of the current billing period</strong>. The
        subscription remains active and the branch portal remains fully operational until that
        date; thereafter the branch moves to a read-only state. You may resubscribe at any time.
      </p>

      <h2>8. Termination by us</h2>
      <p>
        We may suspend or terminate a subscription immediately in accordance with the Terms of
        Service, including for non-payment, breach of the <a href="/legal/aup">Acceptable Use
        Policy</a>, or where required by law.
      </p>

      <h2>9. What happens to your data on cancellation</h2>
      <p>
        See the <a href="/legal/dpa">Data Processing Addendum</a>, Section 9, and the data
        retention schedule in the <a href="/privacy">Privacy Policy</a>. Briefly: production
        files are deleted from active storage 180 days after the final billing period;
        order/invoice records are retained for up to 5 years for accounting purposes; backups
        are rotated within 35 days.
      </p>

      <h2>10. Changes to pricing</h2>
      <p>
        We may change subscription pricing or introduce new plans from time to time. Any
        price change will take effect for your subscription only at the start of the next
        billing period after we have given you at least 30 days' written notice. If you do not
        wish to accept a price change you may cancel before it takes effect.
      </p>

      <h2>11. Disputes about a charge</h2>
      <p>
        If you believe a charge is incorrect, please contact us at{" "}
        <a href={`mailto:${E.supportEmail}`}>{E.supportEmail}</a> within 60 days of the charge
        date so we can investigate. Please contact us before initiating a chargeback with your
        card issuer — we are usually able to resolve billing questions directly and quickly.
      </p>
    </LegalLayout>
  );
}
