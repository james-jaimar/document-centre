// SA e-commerce default Terms & Privacy templates.
//
// Templates contain placeholders that are interpolated TWICE:
//   1. At save-time in the admin LegalTab (tenant-level fields)
//   2. At render-time in PortalTerms / PortalPrivacy (branch-level fields,
//      filled in with the customer's currently active branch)
//
// Placeholders left unresolved at render-time are stripped to "" so the
// document stays clean if a tenant only has a single branch with no
// dedicated website etc.

export interface LegalTemplateContext {
  // Tenant-level
  tenant_name: string;
  support_email?: string | null;
  website_url?: string | null;
  country?: string | null;
  // Branch-level (resolved at render time per active branch)
  branch_name?: string | null;
  branch_phone?: string | null;
  branch_email?: string | null;
  branch_address?: string | null;
  branch_website?: string | null;
}

/**
 * Replace `{{key}}` tokens in HTML. Unknown keys are left untouched (so
 * later passes can fill them in). Use `interpolateLegal` with `strip=true`
 * at the final render to remove any leftover placeholders.
 */
export function interpolateLegal(
  html: string,
  ctx: Partial<LegalTemplateContext>,
  opts: { strip?: boolean } = {},
): string {
  // Only build entries for keys explicitly provided — unknown placeholders
  // are left intact so a later interpolation pass (e.g. render-time branch
  // resolution) can fill them in.
  const entries: [string, string][] = [];
  const has = (k: keyof LegalTemplateContext) =>
    Object.prototype.hasOwnProperty.call(ctx, k);
  if (has("tenant_name")) entries.push(["tenant_name", ctx.tenant_name ?? ""]);
  if (has("support_email")) entries.push(["support_email", ctx.support_email ?? ""]);
  if (has("website_url")) entries.push(["website_url", ctx.website_url ?? ""]);
  if (has("country")) entries.push(["country", ctx.country ?? "South Africa"]);
  if (has("branch_name")) entries.push(["branch_name", ctx.branch_name ?? ""]);
  if (has("branch_phone")) entries.push(["branch_phone", ctx.branch_phone ?? ""]);
  if (has("branch_email")) entries.push(["branch_email", ctx.branch_email ?? ""]);
  if (has("branch_address")) entries.push(["branch_address", ctx.branch_address ?? ""]);
  if (has("branch_website")) entries.push(["branch_website", ctx.branch_website ?? ""]);

  let out = html;
  for (const [k, v] of entries) {
    out = out.split(`{{${k}}}`).join(v);
  }
  if (opts.strip) {
    out = out.replace(/\{\{[a-z0-9_]+\}\}/gi, "");
  }
  return out;
}

const TERMS_TEMPLATE = `
<h2>1. About this Print Centre</h2>
<p>This Print Centre is operated by <strong>{{branch_name}}</strong>, an independently owned franchisee trading under the {{tenant_name}} brand. All print orders placed here are accepted by, fulfilled by, paid to and the responsibility of {{branch_name}}. The underlying ordering platform is provided as software-as-a-service by Jaimar Developments Ltd (t/a Document Centre, UK Company No. 17071122); Document Centre is not a party to your order.</p>

<h2>2. Acceptance of Terms</h2>
<p>By accessing or using this Print Centre you confirm that you are at least 18 years old (or have the legal capacity to contract) and that you accept these Terms in full. If you do not agree, you must not use the service.</p>

<h2>3. Independent Franchisee</h2>
<p>{{tenant_name}} operates a franchise model in {{country}}. The {{tenant_name}} brand and trademarks are owned by the franchisor; each branch is an independently owned and operated franchisee. By placing an order through this Print Centre you are transacting with <strong>{{branch_name}}</strong> as an independent corporate entity, separate and distinct from the franchisor and from any other branch. Neither the franchisor nor any other branch is liable for orders placed here.</p>

<h2>4. Account Registration</h2>
<p>You may be required to create an account to place certain orders. You are responsible for keeping your login details confidential and for all activity carried out under your account.</p>

<h2>5. Orders, Pricing &amp; VAT</h2>
<ul>
  <li>All prices are quoted in South African Rand (ZAR) and, where applicable, include Value Added Tax (VAT) at the prevailing rate.</li>
  <li>An order is only accepted once {{branch_name}} issues a written order confirmation. We may decline any order at our discretion.</li>
  <li>We reserve the right to correct pricing errors before despatch and to notify you of any material change.</li>
</ul>

<h2>6. Payment</h2>
<p>Online card payments are processed by PayFast (Payfast (Pty) Ltd). All transactions are encrypted by the PayFast platform; the PayFast end-user agreement is available at <a href="https://www.payfast.co.za/end-user-agreement" target="_blank" rel="noopener noreferrer">payfast.co.za/end-user-agreement</a>. Production of your order will only commence once payment has been received in full, unless you have an approved credit account with {{branch_name}}.</p>

<h2>7. Production Turnaround &amp; Delivery</h2>
<p>Estimated turnaround times are indicated at checkout and are calculated from the time {{branch_name}} receives print-ready files and confirmed payment. Delivery is performed by our nominated couriers or print fulfilment partners. While we use reasonable efforts to meet stated lead times, delivery dates are estimates and not guaranteed.</p>

<h2>8. Customer-Supplied Artwork &amp; Content</h2>
<p>You are solely responsible for the content of any files you upload, including spelling, layout, colour, copyright and licensing. {{branch_name}} will print your files as supplied, subject to basic preflight checks, and is not liable for errors in customer-supplied artwork once an order has been placed.</p>

<h2>9. Cancellations, Refunds &amp; Defects</h2>
<p>Because our products are printed to order and personalised to your specifications, they are exempt from the cooling-off period under section 44 of the Electronic Communications and Transactions Act, 25 of 2002. Once production has commenced, orders cannot be cancelled and are non-refundable. If a product is defective or differs materially from what you ordered, please contact {{branch_name}} within 7 days of delivery and we will reprint or refund the affected items at our discretion.</p>

<h2>10. Intellectual Property</h2>
<p>The {{tenant_name}} brand, trademarks and franchise content are the property of the franchisor and its licensors. You retain ownership of artwork you upload, and grant {{branch_name}} a limited, non-exclusive licence to reproduce it solely for the purpose of fulfilling your order.</p>

<h2>11. Limitation of Liability</h2>
<p>This Print Centre and all content on it are provided on an "as is" basis and may contain unintentional inaccuracies. To the maximum extent permitted by law, the total liability of {{branch_name}} arising out of or in connection with any order is limited to the value of the order in question. Neither {{branch_name}}, the franchisor nor Document Centre is liable for indirect, consequential or special losses, including loss of profit or business interruption.</p>

<h2>12. Changes to these Terms</h2>
<p>{{branch_name}} reserves the right to change these Terms from time to time. Changes become effective when posted on this Print Centre. Your continued use of the service following such changes constitutes acceptance of the updated Terms.</p>

<h2>13. Governing Law &amp; Consumer Protection</h2>
<p>These Terms are governed by the laws of {{country}}. They apply to customers who are consumers for the purposes of the Consumer Protection Act, 68 of 2008. Any dispute will first be addressed by good-faith negotiation and, failing resolution, will be referred to the courts of competent jurisdiction in {{country}}.</p>

<h2>14. Contact</h2>
<p>For any questions about these Terms or about an order, please contact <strong>{{branch_name}}</strong>:</p>
<ul>
  <li>Email: <a href="mailto:{{branch_email}}">{{branch_email}}</a></li>
  <li>Phone: {{branch_phone}}</li>
  <li>Address: {{branch_address}}</li>
</ul>
`;

const PRIVACY_TEMPLATE = `
<h2>1. Who We Are</h2>
<p>{{branch_name}} (an independently owned {{tenant_name}} franchisee, "we", "us", "our") is the responsible party for the processing of personal information you submit through this Print Centre, as defined in the Protection of Personal Information Act, 4 of 2013 ("POPIA"). This policy explains what we collect, how we use it and the rights you have.</p>

<h2>2. Information We Collect</h2>
<ul>
  <li><strong>Account details</strong>: name, email address, phone number and password.</li>
  <li><strong>Order information</strong>: billing and delivery addresses, order history and communication preferences.</li>
  <li><strong>Payment information</strong>: handled by our payment processors (e.g. PayFast). We do not store full card numbers on our servers.</li>
  <li><strong>Uploaded files</strong>: documents and artwork you upload for printing, retained only as long as necessary to produce and support your order.</li>
  <li><strong>Technical data</strong>: IP address, browser, device information and basic analytics on how you use this Print Centre.</li>
</ul>

<h2>3. How We Use Your Information</h2>
<p>We process your personal information to:</p>
<ul>
  <li>Create and manage your account;</li>
  <li>Process, produce and deliver your orders;</li>
  <li>Communicate with you about orders, quotes and support requests;</li>
  <li>Comply with legal, accounting and tax obligations;</li>
  <li>Improve our products, services and Print Centre.</li>
</ul>

<h2>4. Sharing With Third Parties</h2>
<p>We share personal information only with operators acting on our instructions, including:</p>
<ul>
  <li>Payment processors (such as PayFast) to collect payment;</li>
  <li>Print production and fulfilment partners (such as Cloudprinter and couriers) to produce and deliver your order;</li>
  <li>Jaimar Developments Ltd (t/a Document Centre), which provides the underlying SaaS platform and associated cloud hosting and email infrastructure.</li>
</ul>
<p>We do not sell your personal information.</p>

<h2>5. Cookies &amp; Analytics</h2>
<p>We use cookies and similar technologies to keep you signed in, remember your cart, and understand how visitors use this Print Centre. You can control cookies through your browser settings; disabling them may affect functionality.</p>

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
<p>To exercise any of your rights or to ask questions about this policy, please contact <strong>{{branch_name}}</strong> at <a href="mailto:{{branch_email}}">{{branch_email}}</a>.</p>
`;

export function defaultTermsHtml(ctx: LegalTemplateContext): string {
  // Leave branch_* placeholders intact for render-time interpolation.
  return interpolateLegal(TERMS_TEMPLATE.trim(), {
    tenant_name: ctx.tenant_name,
    support_email: ctx.support_email,
    website_url: ctx.website_url,
    country: ctx.country,
  });
}

export function defaultPrivacyHtml(ctx: LegalTemplateContext): string {
  return interpolateLegal(PRIVACY_TEMPLATE.trim(), {
    tenant_name: ctx.tenant_name,
    support_email: ctx.support_email,
    website_url: ctx.website_url,
    country: ctx.country,
  });
}
