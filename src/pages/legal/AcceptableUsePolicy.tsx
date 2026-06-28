import LegalDocPage from "@/components/legal/LegalDocPage";
import { LEGAL_ENTITY as E } from "@/lib/legal/entity";

export function Body() {
  return (
    <>
      <p>
        This Acceptable Use Policy ("AUP") applies to every user of the Document Centre Service,
        whether you are a subscribing print shop ("Tenant"), a member of a Tenant's team, or an
        end-customer ordering through a Tenant's storefront. Breach of this AUP is a breach of
        our Terms of Service and may result in suspension or termination of access, removal of
        offending content, and — where appropriate — referral to law-enforcement or regulatory
        authorities.
      </p>

      <h2>1. Content you upload</h2>
      <p>You confirm and warrant that, for every file, image, document, logo or other material you upload to the Service:</p>
      <ul>
        <li>You own it, or you have the necessary rights, licences, consents and permissions to upload it and to have it printed, stored and processed by us and the Tenant.</li>
        <li>It does not infringe any third-party intellectual-property right, right of personality, privacy right or contractual right.</li>
        <li>It is not unlawful, defamatory, obscene, sexually explicit involving minors, hateful, harassing, threatening, or designed to incite violence or unlawful conduct.</li>
        <li>It is not designed to commit, facilitate or conceal fraud or identity theft (this includes — without limitation — counterfeit currency, forged identification documents, fake academic credentials, counterfeit tickets, or pirated tax stamps).</li>
        <li>It does not contain malware, viruses, ransomware, worms, trojans, or any other malicious code or instructions.</li>
      </ul>

      <h2>2. Prohibited uses of the Service</h2>
      <p>You may not use the Service to:</p>
      <ul>
        <li>Reproduce currency, security documents, identity documents (passports, ID cards, driver's licences) or any document whose reproduction is restricted by law in the jurisdiction of production or destination;</li>
        <li>Print, reproduce or distribute content that infringes copyright, trade marks, design rights or other intellectual-property rights;</li>
        <li>Attempt to gain unauthorised access to the Service, to any account, sub-system, server or network, or to any data not intended for you;</li>
        <li>Probe, scan or test the vulnerability of the Service or breach any security or authentication measure (other than under an authorised security-research programme we publish);</li>
        <li>Interfere with or disrupt the Service, including by overloading, flooding or denial-of-service activity;</li>
        <li>Use the Service to send unsolicited communications, "spam", phishing messages, or to harvest contact details;</li>
        <li>Use automated means (bots, crawlers, scrapers) to access the Service in a way that exceeds reasonable use or that violates the technical limits of the Service;</li>
        <li>Reverse-engineer, decompile, disassemble or attempt to derive source code from the Service, except to the extent expressly permitted by law;</li>
        <li>Resell, sublicense, rent, lease or commercially exploit the Service except as expressly permitted in writing by us;</li>
        <li>Use the Service to operate any high-risk activity in which failure could lead to death, personal injury or environmental damage.</li>
      </ul>

      <h2>3. Tenant responsibilities</h2>
      <p>
        Tenants are responsible for the conduct of their own staff, contractors and end-customers
        on the Service. Tenants must:
      </p>
      <ul>
        <li>Publish accurate product information, pricing, lead times and delivery terms on their storefront;</li>
        <li>Operate their storefront in compliance with applicable consumer-protection, data-protection and tax laws (including, in South Africa, POPIA and the Consumer Protection Act, 2008);</li>
        <li>Respond reasonably promptly to customer-service enquiries from their own end-customers;</li>
        <li>Configure and maintain their own payment-provider credentials, refund policy and dispute-handling process;</li>
        <li>Promptly take down or block any content on their storefront that breaches this AUP.</li>
      </ul>

      <h2>4. End-customer responsibilities</h2>
      <p>End-customers must:</p>
      <ul>
        <li>Provide accurate contact, billing and delivery information;</li>
        <li>Only upload files they are entitled to upload (see Section 1);</li>
        <li>Use the Service for lawful printing purposes only.</li>
      </ul>

      <h2>5. Print-file review</h2>
      <p>
        The Service performs automated preflight (image resolution, font embedding, page sizing,
        colour-space heuristics) on uploaded files. Automated preflight is not a substitute for
        human review or a guarantee of print quality. We do not check legal ownership or
        suitability of uploaded artwork, and we do not provide a human print-checking service as
        part of a standard subscription.
      </p>

      <h2>6. Reporting abuse</h2>
      <p>
        If you believe content on the platform breaches this AUP or your rights, please report
        it to <a href={`mailto:${E.supportEmail}`}>{E.supportEmail}</a>. For copyright-infringement
        notices, please include sufficient information to identify the work and the allegedly
        infringing material, your contact details, and a good-faith statement.
      </p>

      <h2>7. Enforcement</h2>
      <p>
        We may, at our discretion, investigate suspected breaches, remove or disable access to
        offending content, suspend or terminate the account responsible, and cooperate with
        law-enforcement or regulatory authorities. We are not obliged to monitor user content
        but reserve the right to do so where reasonable.
      </p>
    </LegalLayout>
  );
}
