import LegalLayout from "./LegalLayout";
import { LEGAL_ENTITY as E } from "@/lib/legal/entity";

export default function TermsOfService() {
  return (
    <LegalLayout title="Terms of Service" updated="1 June 2026">
      <p>
        These Terms of Service ("Terms") govern your access to and use of the Document Centre
        web-to-print platform, marketing website, customer storefronts, and related services
        (collectively, the "Service"). The Service is provided by{" "}
        <strong>{E.legalName}</strong>, a company registered in {E.jurisdiction} under company
        number {E.companyNumber}, whose registered office is at {E.registeredOffice}{" "}
        ("{E.tradingName}", "we", "us", or "our"). Document Centre is a trading name of{" "}
        {E.legalName}. By creating an account or using the Service, you agree to be bound by
        these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        Document Centre provides a multi-tenant software-as-a-service platform that enables print
        shops ("Tenants") to operate online storefronts and process print orders, and enables
        end-customers ("Customers") to upload files, configure print jobs, and place orders with
        a Tenant. We may modify, suspend, or discontinue any part of the Service at any time,
        with reasonable notice for material changes that affect paid features.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <ul>
        <li>You must be at least 18 years old, or the age of majority in your jurisdiction, to use the Service.</li>
        <li>You must provide accurate and complete information when creating an account and keep it up to date.</li>
        <li>You are responsible for safeguarding your account credentials and for any activity under your account.</li>
        <li>You must notify us promptly of any unauthorised access or security breach.</li>
      </ul>

      <h2>3. Roles: Tenants and Customers</h2>
      <p>
        <strong>Tenants</strong> use Document Centre to operate their print business. Tenants are
        solely responsible for the products and services they offer, the accuracy of their
        pricing and product descriptions, the production and fulfilment of orders, and their
        compliance with applicable laws (including consumer-protection, data-protection and tax
        laws in the territories in which they operate).
      </p>
      <p>
        <strong>Customers</strong> place orders directly with a Tenant through that Tenant's
        storefront. The contract for the supply of printed goods is between the Customer and the
        Tenant. {E.legalName} is not a party to that contract and does not produce, ship, or
        guarantee the goods.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>Upload, print, or distribute content that is unlawful, infringing, defamatory, obscene, hateful, or harmful;</li>
        <li>Reproduce copyrighted, trademarked, or other protected material without the necessary rights or permissions;</li>
        <li>Print currency, official documents, identification documents, or other materials whose reproduction is restricted by law;</li>
        <li>Distribute malware, attempt to compromise the security or integrity of the Service, or interfere with other users' use of the Service;</li>
        <li>Reverse-engineer, decompile, or attempt to extract the source code of the Service, except as permitted by law;</li>
        <li>Use the Service to send unsolicited communications or to scrape, harvest, or mass-collect data;</li>
        <li>Resell, sublicense, or commercially exploit the Service except as expressly permitted.</li>
      </ul>

      <h2>5. Your content</h2>
      <p>
        You retain ownership of all files, designs, text, images, and other content you upload to
        the Service ("Your Content"). You grant {E.legalName} and the relevant Tenant a
        non-exclusive, worldwide, royalty-free licence to host, store, transmit, render,
        rasterise, transform (including conversion to PDF, imposition, and preflight), and
        otherwise process Your Content solely as necessary to provide the Service and fulfil
        your orders.
      </p>
      <p>
        You represent and warrant that you have all rights necessary to upload Your Content and
        that Your Content does not infringe any third-party rights or violate any law.
      </p>

      <h2>6. Fees, taxes and payment</h2>
      <p>
        Where the Service or specific features are offered for a fee, the applicable fees,
        billing cycle, and trial terms will be presented at sign-up. Unless stated otherwise:
      </p>
      <ul>
        <li>
          Fees are quoted in Pounds Sterling (GBP) by default. South African Tenants may be billed
          in South African Rand (ZAR) where a regional plan is published; the billing currency for
          your subscription is shown at checkout.
        </li>
        <li>
          {E.legalName} is established in the United Kingdom and is not currently registered for
          UK VAT. No UK VAT is charged on subscription fees. For Tenants established outside the
          United Kingdom, the supply of the Service is treated as a business-to-business supply
          of electronically supplied services with the place of supply being the Tenant's country.
          Tenants are responsible for self-assessing any VAT, GST, sales tax, or equivalent
          indirect tax due in their own jurisdiction (for example, the reverse-charge or
          electronic-services rules that apply in South Africa).
        </li>
        <li>Subscription fees are billed in advance and are non-refundable except where required by law;</li>
        <li>You authorise us (or our payment processor) to charge your payment method on a recurring basis until cancelled;</li>
        <li>If a payment fails, we may suspend or downgrade your account until payment is made.</li>
      </ul>
      <p>
        Payments for printed goods ordered by Customers from a Tenant are governed by the
        Tenant's own commercial terms and are processed through payment credentials that the
        Tenant configures in its own administration portal. Those payments do not pass through
        {" "}{E.legalName}.
      </p>

      <h2>7. Free trials</h2>
      <p>
        We may offer a free trial period for new Tenants. At the end of the trial, your account
        will convert to a paid subscription unless you cancel before the trial ends. We may
        modify or end trial offers at any time.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        The Service, including all software, design, text, graphics, logos, and trademarks
        (other than Your Content and Tenant branding), is owned by {E.legalName} or its
        licensors and is protected by intellectual property laws. We grant you a limited,
        non-exclusive, non-transferable, revocable licence to use the Service in accordance with
        these Terms. "Document Centre" is a trading name of {E.legalName}.
      </p>

      <h2>9. Third-party services</h2>
      <p>
        The Service integrates with third-party services (such as Google for sign-in, Stripe for
        subscription billing, email providers, and cloud infrastructure including Supabase and
        Amazon Web Services). Your use of those services is subject to the respective third
        party's terms and privacy policies. We are not responsible for third-party services we
        do not control.
      </p>

      <h2>10. Data protection</h2>
      <p>
        Where we process personal data on behalf of a Tenant in the course of providing the
        Service (for example, end-customer account data, order data and uploaded files), the
        Tenant is the data controller and {E.legalName} acts as a data processor. The data
        processing terms set out in our Privacy Policy form the data processing addendum between
        us and the Tenant for the purposes of UK GDPR Article 28 and, where applicable, EU GDPR
        Article 28.
      </p>

      <h2>11. Suspension and termination</h2>
      <p>
        You may stop using the Service at any time and may close your account through your
        account settings or by contacting us. We may suspend or terminate your access to the
        Service, immediately and without liability, if you breach these Terms, if required by
        law, or if we reasonably believe your conduct creates risk for us, other users, or third
        parties.
      </p>
      <p>
        On termination, your right to use the Service ceases immediately. We may retain certain
        data as described in our Privacy Policy or as required by law. Sections of these Terms
        that by their nature should survive termination will survive (including IP, disclaimers,
        liability, and dispute provisions).
      </p>

      <h2>12. Disclaimers</h2>
      <p>
        The Service is provided on an "as is" and "as available" basis. To the maximum extent
        permitted by law, {E.legalName} disclaims all warranties, whether express, implied, or
        statutory, including warranties of satisfactory quality, fitness for a particular
        purpose, non-infringement, and uninterrupted or error-free operation. We do not warrant
        that the Service will meet your requirements or that any defects will be corrected.
      </p>
      <p>
        {E.legalName} does not produce printed goods. The quality, accuracy, and timeliness of
        printed goods are the responsibility of the Tenant fulfilling the order.
      </p>

      <h2>13. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {E.legalName} and its officers, employees,
        agents, and suppliers will not be liable for any indirect, incidental, special,
        consequential, exemplary, or punitive damages, or for loss of profits, revenue, data,
        goodwill, or other intangible losses, arising out of or in connection with your use of
        the Service.
      </p>
      <p>
        Our total aggregate liability arising out of or relating to these Terms or the Service
        will not exceed the greater of (a) the total fees you paid to {E.legalName} in the
        twelve (12) months preceding the event giving rise to the claim, or (b) one hundred
        Pounds Sterling (GBP 100).
      </p>
      <p>
        Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or
        limited, including liability for death or personal injury caused by negligence, or for
        fraud or fraudulent misrepresentation.
      </p>

      <h2>14. Indemnity</h2>
      <p>
        You agree to indemnify and hold harmless {E.legalName} and its affiliates, officers,
        employees, and agents from and against any claims, damages, losses, liabilities, costs,
        and expenses (including reasonable legal fees) arising out of or related to (a) Your
        Content, (b) your use of the Service, or (c) your breach of these Terms or any law.
      </p>

      <h2>15. Changes to the Terms</h2>
      <p>
        We may update these Terms from time to time. When we do, we will revise the "Last
        updated" date above and, for material changes, notify you by email or through a
        prominent notice in the Service. Your continued use of the Service after changes take
        effect constitutes acceptance of the updated Terms.
      </p>

      <h2>16. Governing law and disputes</h2>
      <p>
        These Terms and any non-contractual obligations arising out of or in connection with
        them are governed by the laws of {E.jurisdiction}. The courts of {E.jurisdiction} have
        exclusive jurisdiction over any dispute arising out of or in connection with these
        Terms or the Service, except that we may seek injunctive relief in any court of
        competent jurisdiction.
      </p>

      <h2>17. Contact</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>, or by post to {E.legalName},
        {" "}{E.registeredOffice}.
      </p>
    </LegalLayout>
  );
}
