-- Seed default terms_of_service / privacy_policy under the new "legal" category
-- for every tenant that doesn't already have them. Uses a minimal in-SQL
-- template so the migration is self-contained; admins can edit later in the UI.

DO $$
DECLARE
  t RECORD;
  v_terms text;
  v_privacy text;
  v_now text := to_jsonb(now())::text; -- "2026-..."Z
BEGIN
  FOR t IN
    SELECT id, name, COALESCE(country, 'South Africa') AS country
    FROM public.tenants
  LOOP
    v_terms := replace(replace($tpl$
<h2>1. About Us</h2>
<p>These Terms of Service ("Terms") govern your use of the online ordering platform operated by __NAME__ ("we", "us", "our"). By placing an order you agree to be bound by these Terms.</p>
<h2>2. Acceptance of Terms</h2>
<p>By accessing or using our online ordering service you confirm that you are at least 18 years old (or have the legal capacity to contract) and that you accept these Terms in full.</p>
<h2>3. Account Registration</h2>
<p>You may be required to create an account to place certain orders. You are responsible for keeping your login details confidential and for all activity carried out under your account.</p>
<h2>4. Orders, Pricing &amp; VAT</h2>
<ul><li>All prices are quoted in South African Rand (ZAR) and, where applicable, include VAT at the prevailing rate.</li><li>An order is only accepted once we issue a written order confirmation.</li><li>We reserve the right to correct pricing errors before despatch.</li></ul>
<h2>5. Payment</h2>
<p>We accept payment via the methods enabled on our checkout (which may include PayFast, electronic funds transfer, or approved account billing). Production will only commence once payment has been received in full, unless you have an approved credit account with us.</p>
<h2>6. Production Turnaround &amp; Delivery</h2>
<p>Estimated turnaround times are calculated from the time we receive print-ready files and confirmed payment. Delivery is performed by our nominated couriers or print fulfilment partners. Delivery dates are estimates and not guaranteed.</p>
<h2>7. Customer-Supplied Artwork &amp; Content</h2>
<p>You are solely responsible for the content of any files you upload, including spelling, layout, colour, copyright and licensing. We will print your files as supplied, subject to basic preflight checks.</p>
<h2>8. Cancellations &amp; Refunds</h2>
<p>Because most of our products are printed to order and personalised to your specifications, they are exempt from the cooling-off period under section 44 of the Electronic Communications and Transactions Act, 25 of 2002. Once production has commenced, orders cannot be cancelled and are non-refundable. If a product is defective or differs materially from what you ordered, please contact us within 7 days of delivery and we will reprint or refund the affected items at our discretion.</p>
<h2>9. Intellectual Property</h2>
<p>All trademarks, logos and content on this site are the property of __NAME__ or its licensors. You retain ownership of artwork you upload, and grant us a limited licence to reproduce it solely for the purpose of fulfilling your order.</p>
<h2>10. Limitation of Liability</h2>
<p>To the maximum extent permitted by law, our total liability arising out of or in connection with any order is limited to the value of the order in question.</p>
<h2>11. Governing Law &amp; Disputes</h2>
<p>These Terms are governed by the laws of __COUNTRY__. Any dispute will first be addressed by good-faith negotiation and, failing resolution, will be referred to the courts of competent jurisdiction in __COUNTRY__.</p>
<h2>12. Contact</h2>
<p>If you have any questions about these Terms, please contact us via the contact details shown on this site.</p>
$tpl$, '__NAME__', t.name), '__COUNTRY__', t.country);

    v_privacy := replace(replace($tpl$
<h2>1. Who We Are</h2>
<p>__NAME__ ("we", "us", "our") is the responsible party for the processing of your personal information as defined in the Protection of Personal Information Act, 4 of 2013 ("POPIA").</p>
<h2>2. Information We Collect</h2>
<ul><li><strong>Account details</strong>: name, email address, phone number and password.</li><li><strong>Order information</strong>: billing and delivery addresses, order history and communication preferences.</li><li><strong>Payment information</strong>: handled by our payment processors (e.g. PayFast). We do not store full card numbers on our servers.</li><li><strong>Uploaded files</strong>: documents and artwork you upload for printing.</li><li><strong>Technical data</strong>: IP address, browser, device information and basic analytics.</li></ul>
<h2>3. How We Use Your Information</h2>
<p>We process your personal information to create and manage your account, process and deliver your orders, communicate with you, comply with legal obligations, and improve our services.</p>
<h2>4. Sharing With Third Parties</h2>
<p>We share personal information only with operators acting on our instructions, including payment processors, print production and fulfilment partners, and cloud hosting / email providers. We do not sell your personal information.</p>
<h2>5. Cookies &amp; Analytics</h2>
<p>We use cookies and similar technologies to keep you signed in, remember your cart, and understand how visitors use our site.</p>
<h2>6. Data Retention</h2>
<p>We retain personal information for as long as your account is active and thereafter for the periods required by tax, accounting and other legal obligations.</p>
<h2>7. Your POPIA Rights</h2>
<p>You have the right to access, correct or delete your personal information, object to processing, and lodge a complaint with the Information Regulator (South Africa).</p>
<h2>8. Security</h2>
<p>We take reasonable technical and organisational measures to protect personal information against loss, misuse and unauthorised access.</p>
<h2>9. International Transfers</h2>
<p>Some of our service providers may process data outside of __COUNTRY__. Where this occurs, we require those providers to apply protections substantially similar to those required by POPIA.</p>
<h2>10. Contact Us</h2>
<p>To exercise any of your rights or to ask questions about this policy, please contact us via the contact details shown on this site.</p>
$tpl$, '__NAME__', t.name), '__COUNTRY__', t.country);

    -- Insert only when missing
    INSERT INTO public.tenant_settings (tenant_id, category, setting_key, setting_value, value_type)
    VALUES (t.id, 'legal', 'terms_of_service', to_jsonb(v_terms), 'string')
    ON CONFLICT (tenant_id, category, setting_key) DO NOTHING;

    INSERT INTO public.tenant_settings (tenant_id, category, setting_key, setting_value, value_type)
    VALUES (t.id, 'legal', 'privacy_policy', to_jsonb(v_privacy), 'string')
    ON CONFLICT (tenant_id, category, setting_key) DO NOTHING;

    INSERT INTO public.tenant_settings (tenant_id, category, setting_key, setting_value, value_type)
    VALUES (t.id, 'legal', 'terms_updated_at', to_jsonb(now()::text), 'string')
    ON CONFLICT (tenant_id, category, setting_key) DO NOTHING;

    INSERT INTO public.tenant_settings (tenant_id, category, setting_key, setting_value, value_type)
    VALUES (t.id, 'legal', 'privacy_updated_at', to_jsonb(now()::text), 'string')
    ON CONFLICT (tenant_id, category, setting_key) DO NOTHING;
  END LOOP;
END $$;

-- Ensure the resolve_tenant_setting RPC is callable by anonymous storefront visitors.
GRANT EXECUTE ON FUNCTION public.resolve_tenant_setting(uuid, text, text) TO anon, authenticated;