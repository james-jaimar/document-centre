// SA e-commerce default Terms & Privacy templates.
// Used for the migration seed and the admin "Restore default" button.
// HTML must be rendered inside a Tailwind `prose` container.

export interface LegalTemplateContext {
  tenant_name: string;
  support_email?: string | null;
  website_url?: string | null;
  country?: string | null;
}

function interpolate(html: string, ctx: LegalTemplateContext): string {
  const support = ctx.support_email || "support@example.com";
  const site = ctx.website_url || "our website";
  const country = ctx.country || "South Africa";
  return html
    .replaceAll("{{tenant_name}}", ctx.tenant_name)
    .replaceAll("{{support_email}}", support)
    .replaceAll("{{website_url}}", site)
    .replaceAll("{{country}}", country);
}

const TERMS_TEMPLATE = `
<h2>1. About Us</h2>
<p>These Terms of Service ("Terms") govern your use of the online ordering platform operated by {{tenant_name}} ("we", "us", "our") at {{website_url}}. By placing an order you agree to be bound by these Terms.</p>

<h2>2. Acceptance of Terms</h2>
<p>By accessing or using our online ordering service you confirm that you are at least 18 years old (or have the legal capacity to contract) and that you accept these Terms in full. If you do not agree, you must not use the service.</p>

<h2>3. Account Registration</h2>
<p>You may be required to create an account to place certain orders. You are responsible for keeping your login details confidential and for all activity carried out under your account.</p>

<h2>4. Orders, Pricing &amp; VAT</h2>
<ul>
  <li>All prices are quoted in South African Rand (ZAR) and, where applicable, include Value Added Tax (VAT) at the prevailing rate.</li>
  <li>An order is only accepted once we issue a written order confirmation. We may decline any order at our discretion.</li>
  <li>We reserve the right to correct pricing errors before despatch and to notify you of any material change.</li>
</ul>

<h2>5. Payment</h2>
<p>We accept payment via the methods enabled on our checkout (which may include PayFast, electronic funds transfer, or approved account billing). Production of your order will only commence once payment has been received in full, unless you have an approved credit account with us.</p>

<h2>6. Production Turnaround &amp; Delivery</h2>
<p>Estimated turnaround times are indicated at checkout and are calculated from the time we receive print-ready files and confirmed payment. Delivery is performed by our nominated couriers or print fulfilment partners. While we use reasonable efforts to meet stated lead times, delivery dates are estimates and not guaranteed.</p>

<h2>7. Customer-Supplied Artwork &amp; Content</h2>
<p>You are solely responsible for the content of any files you upload, including spelling, layout, colour, copyright and licensing. We will print your files as supplied, subject to basic preflight checks. We are not liable for errors in customer-supplied artwork once an order has been placed.</p>

<h2>8. Cancellations &amp; Refunds</h2>
<p>Because most of our products are printed to order and personalised to your specifications, they are exempt from the cooling-off period under section 44 of the Electronic Communications and Transactions Act, 25 of 2002. Once production has commenced, orders cannot be cancelled and are non-refundable. If a product is defective or differs materially from what you ordered, please contact us within 7 days of delivery and we will reprint or refund the affected items at our discretion.</p>

<h2>9. Intellectual Property</h2>
<p>All trademarks, logos and content on this site are the property of {{tenant_name}} or its licensors. You retain ownership of artwork you upload, and grant us a limited licence to reproduce it solely for the purpose of fulfilling your order.</p>

<h2>10. Limitation of Liability</h2>
<p>To the maximum extent permitted by law, our total liability arising out of or in connection with any order is limited to the value of the order in question. We are not liable for indirect, consequential or special losses, including loss of profit or business interruption.</p>

<h2>11. Governing Law &amp; Disputes</h2>
<p>These Terms are governed by the laws of {{country}}. Any dispute will first be addressed by good-faith negotiation and, failing resolution, will be referred to the courts of competent jurisdiction in {{country}}.</p>

<h2>12. Contact</h2>
<p>If you have any questions about these Terms, please contact us at <a href="mailto:{{support_email}}">{{support_email}}</a>.</p>
`;

const PRIVACY_TEMPLATE = `
<h2>1. Who We Are</h2>
<p>{{tenant_name}} ("we", "us", "our") is the responsible party for the processing of your personal information as defined in the Protection of Personal Information Act, 4 of 2013 ("POPIA"). This policy explains what we collect, how we use it and the rights you have.</p>

<h2>2. Information We Collect</h2>
<ul>
  <li><strong>Account details</strong>: name, email address, phone number and password.</li>
  <li><strong>Order information</strong>: billing and delivery addresses, order history and communication preferences.</li>
  <li><strong>Payment information</strong>: handled by our payment processors (e.g. PayFast). We do not store full card numbers on our servers.</li>
  <li><strong>Uploaded files</strong>: documents and artwork you upload for printing, retained only as long as necessary to produce and support your order.</li>
  <li><strong>Technical data</strong>: IP address, browser, device information and basic analytics on how you use our site.</li>
</ul>

<h2>3. How We Use Your Information</h2>
<p>We process your personal information to:</p>
<ul>
  <li>Create and manage your account;</li>
  <li>Process, produce and deliver your orders;</li>
  <li>Communicate with you about orders, quotes and support requests;</li>
  <li>Comply with legal, accounting and tax obligations;</li>
  <li>Improve our products, services and website.</li>
</ul>

<h2>4. Sharing With Third Parties</h2>
<p>We share personal information only with operators acting on our instructions, including:</p>
<ul>
  <li>Payment processors (such as PayFast) to collect payment;</li>
  <li>Print production and fulfilment partners (such as Cloudprinter and couriers) to produce and deliver your order;</li>
  <li>Cloud hosting and email service providers used to operate our platform.</li>
</ul>
<p>We do not sell your personal information.</p>

<h2>5. Cookies &amp; Analytics</h2>
<p>We use cookies and similar technologies to keep you signed in, remember your cart, and understand how visitors use our site. You can control cookies through your browser settings; disabling them may affect functionality.</p>

<h2>6. Data Retention</h2>
<p>We retain personal information for as long as your account is active and thereafter for the periods required by tax, accounting and other legal obligations. Uploaded print files are retained for a limited period after order completion and then deleted from active storage.</p>

<h2>7. Your POPIA Rights</h2>
<p>Subject to POPIA, you have the right to:</p>
<ul>
  <li>Access the personal information we hold about you;</li>
  <li>Request correction or deletion of inaccurate or unnecessary information;</li>
  <li>Object to processing or withdraw consent where processing is based on consent;</li>
  <li>Lodge a complaint with the Information Regulator (South Africa).</li>
</ul>

<h2>8. Security</h2>
<p>We take reasonable technical and organisational measures to protect personal information against loss, misuse and unauthorised access, including encrypted transport, access controls and routine backups.</p>

<h2>9. International Transfers</h2>
<p>Some of our service providers may process data outside of {{country}}. Where this occurs, we require those providers to apply protections substantially similar to those required by POPIA.</p>

<h2>10. Contact Us</h2>
<p>To exercise any of your rights or to ask questions about this policy, please contact us at <a href="mailto:{{support_email}}">{{support_email}}</a>.</p>
`;

export function defaultTermsHtml(ctx: LegalTemplateContext): string {
  return interpolate(TERMS_TEMPLATE.trim(), ctx);
}

export function defaultPrivacyHtml(ctx: LegalTemplateContext): string {
  return interpolate(PRIVACY_TEMPLATE.trim(), ctx);
}
