import LegalLayout from "./LegalLayout";

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" updated="28 April 2026">
      <p>
        This Privacy Policy explains how <strong>Document Centre</strong> ("Document Centre", "we",
        "us", or "our") collects, uses, discloses, and safeguards your information when you use our
        web-to-print software-as-a-service platform, including any associated websites, customer
        storefronts, and applications (collectively, the "Service").
      </p>
      <p>
        Document Centre is operated from South Africa and complies with the Protection of Personal
        Information Act, 2013 (POPIA) and, where applicable, the EU General Data Protection
        Regulation (GDPR). By using the Service, you agree to the collection and use of information
        in accordance with this policy.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Document Centre provides a multi-tenant web-to-print platform that enables print shops
        ("Tenants") to operate online storefronts where their customers can upload, configure, and
        order printed documents. Depending on context:
      </p>
      <ul>
        <li>
          When you visit our marketing site or sign up as a Tenant, Document Centre acts as the
          <strong> data controller</strong> (responsible party under POPIA) of your personal
          information.
        </li>
        <li>
          When you use a Tenant's storefront as an end-customer, the Tenant is the data controller
          of your information, and Document Centre acts as the <strong>data processor</strong>
          (operator under POPIA) on the Tenant's behalf.
        </li>
      </ul>

      <h2>2. Information we collect</h2>
      <h3>Information you provide directly</h3>
      <ul>
        <li><strong>Account information</strong> — name, email address, phone number, organisation name, billing address, and password (stored hashed).</li>
        <li><strong>Authentication data</strong> — when you sign in with Google or another OAuth provider, we receive your name, email, profile picture, and a unique provider identifier. We do not receive your password.</li>
        <li><strong>Order content</strong> — files (PDF, images, office documents) you upload for printing, together with the print configuration you select (paper, binding, finishing, quantity, delivery address).</li>
        <li><strong>Communications</strong> — messages you send to us or to a Tenant via our support channels, order timeline, or email.</li>
        <li><strong>Payment information</strong> — when payments are enabled, payment details are processed by our payment provider (e.g. Stripe or Paddle). We do not store full card numbers on our servers.</li>
      </ul>
      <h3>Information collected automatically</h3>
      <ul>
        <li><strong>Usage data</strong> — pages viewed, features used, timestamps, referring URL, and actions taken within the Service.</li>
        <li><strong>Device and log data</strong> — IP address, browser type and version, operating system, device identifiers, and crash reports.</li>
        <li><strong>Cookies and similar technologies</strong> — see Section 8 below.</li>
      </ul>

      <h2>3. How we use your information</h2>
      <p>We use personal information to:</p>
      <ul>
        <li>Provide, operate, maintain, and improve the Service;</li>
        <li>Create and manage your account, authenticate sign-in (including via Google OAuth), and secure the Service;</li>
        <li>Process and fulfil print orders, including transmitting order content to the relevant Tenant for production;</li>
        <li>Send transactional emails such as order confirmations, status updates, password resets, and invoices;</li>
        <li>Provide customer support, including via our embedded chat widget;</li>
        <li>Detect, prevent, and address fraud, abuse, security incidents, and technical issues;</li>
        <li>Comply with legal obligations and enforce our Terms of Service.</li>
      </ul>

      <h2>4. Legal bases for processing</h2>
      <p>Where GDPR applies, we rely on the following legal bases:</p>
      <ul>
        <li><strong>Performance of a contract</strong> — to provide the Service you have requested;</li>
        <li><strong>Legitimate interests</strong> — to improve and secure the Service, prevent abuse, and operate our business;</li>
        <li><strong>Consent</strong> — where required, for example for non-essential cookies or marketing communications;</li>
        <li><strong>Legal obligation</strong> — to comply with applicable laws.</li>
      </ul>

      <h2>5. How we share information</h2>
      <p>We do not sell your personal information. We share it only in these circumstances:</p>
      <ul>
        <li><strong>With Tenants</strong> — order content, contact details, and order metadata are shared with the Tenant whose storefront you order from, so they can produce and fulfil your order.</li>
        <li><strong>With sub-processors</strong> who help us run the Service, including:
          <ul>
            <li>Supabase / Lovable Cloud — database, authentication, file storage, and edge functions;</li>
            <li>Google LLC — OAuth sign-in and (where enabled) Google Workspace email delivery;</li>
            <li>Our PDF processing infrastructure (the "Document Centre" rendering pipeline) hosted on dedicated servers;</li>
            <li>Email and SMTP providers used to deliver transactional email;</li>
            <li>Payment processors (where payments are enabled);</li>
            <li>Customer support tools such as our embedded chat widget.</li>
          </ul>
        </li>
        <li><strong>For legal reasons</strong> — when required by law, court order, or to protect our rights, property, or the safety of our users.</li>
        <li><strong>In connection with a business transaction</strong> — such as a merger, acquisition, or asset sale, subject to standard confidentiality protections.</li>
      </ul>

      <h2>6. Data retention</h2>
      <p>
        We retain personal information for as long as your account is active and for a reasonable
        period afterward to comply with legal obligations, resolve disputes, and enforce our
        agreements. Uploaded order files are retained for the period configured by the relevant
        Tenant; abandoned drafts are typically purged automatically. You may request deletion of
        your account and associated personal data at any time (see Section 9).
      </p>

      <h2>7. International data transfers</h2>
      <p>
        Our infrastructure and sub-processors may store or process data outside your country of
        residence, including in the European Union and the United States. Where required, we use
        appropriate safeguards such as Standard Contractual Clauses or equivalent mechanisms.
      </p>

      <h2>8. Cookies and tracking</h2>
      <p>
        We use a small number of essential cookies to keep you signed in and to remember your
        preferences. We may also use limited analytics cookies to understand how the Service is
        used. You can control cookies through your browser settings. Disabling essential cookies may
        prevent parts of the Service from working.
      </p>

      <h2>9. Your rights</h2>
      <p>Depending on your jurisdiction, you may have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you;</li>
        <li>Request correction of inaccurate or incomplete data;</li>
        <li>Request deletion of your data ("right to be forgotten");</li>
        <li>Object to or restrict certain processing;</li>
        <li>Request a copy of your data in a portable format;</li>
        <li>Withdraw consent where processing is based on consent;</li>
        <li>Lodge a complaint with your local data protection authority — in South Africa, the Information Regulator (<a href="https://inforegulator.org.za" target="_blank" rel="noopener noreferrer">inforegulator.org.za</a>).</li>
      </ul>
      <p>
        To exercise these rights, email us at the address in Section 12. If your information is
        held by a Tenant (i.e. you ordered through their storefront), we will refer your request to
        the relevant Tenant.
      </p>

      <h2>10. Security</h2>
      <p>
        We use industry-standard security measures including TLS encryption in transit, encryption
        at rest, role-based access control, row-level security on our database, and strict
        authentication for our infrastructure. No method of transmission over the Internet is 100%
        secure, but we work hard to protect your information.
      </p>

      <h2>11. Children's privacy</h2>
      <p>
        The Service is not directed to children under 18, and we do not knowingly collect personal
        information from children. If you believe a child has provided us with personal
        information, please contact us and we will delete it.
      </p>

      <h2>12. Contact us</h2>
      <p>
        If you have questions about this Privacy Policy or how we handle your information, please
        contact us at:
      </p>
      <p>
        <strong>Document Centre</strong><br />
        Email: <a href="mailto:privacy@document-centre.com">privacy@document-centre.com</a>
      </p>

      <h2>13. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will revise the "Last
        updated" date above and, for material changes, notify you by email or through a prominent
        notice in the Service. Your continued use of the Service after changes take effect
        constitutes acceptance of the updated policy.
      </p>
    </LegalLayout>
  );
}
