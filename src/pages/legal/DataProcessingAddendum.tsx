import LegalLayout from "./LegalLayout";
import { Link } from "react-router-dom";
import { LEGAL_ENTITY as E } from "@/lib/legal/entity";
import { LEGAL_DOCS } from "@/lib/legal/versions";

export default function DataProcessingAddendum() {
  const v = LEGAL_DOCS.dpa;
  return (
    <LegalLayout title={v.title} updated={v.effective} version={v.version}>
      <p>
        This Data Processing Addendum ("DPA") forms part of the Terms of Service between{" "}
        <strong>{E.legalName}</strong> ("{E.tradingName}", "we", "us", "Processor") and the
        subscribing organisation ("Customer", "Tenant", "Controller", "Responsible Party"). It
        sets out the terms on which we process personal data on the Customer's behalf in the
        course of providing the Document Centre Service.
      </p>
      <p>
        This DPA is designed to meet the requirements of Article 28 of the UK General Data
        Protection Regulation ("UK GDPR") and, where applicable, of Article 28 of the EU GDPR
        and of section 21 of the South African Protection of Personal Information Act, 2013
        ("POPIA") governing "Operators". Capitalised terms not defined here have the meaning
        given to them in the Terms of Service or in the applicable data-protection law.
      </p>

      <h2>1. Roles of the parties</h2>
      <p>
        For personal data processed by us in the course of providing the Service to the Customer
        (including end-customer account data, order data, uploaded files, contact information
        and order communications), the Customer is the <strong>Controller</strong> (POPIA:{" "}
        <em>Responsible Party</em>) and {E.legalName} is the <strong>Processor</strong> (POPIA:{" "}
        <em>Operator</em>). The Customer determines the purposes and means of processing; we
        process only on the Customer's documented instructions, which include the use of the
        Service in accordance with the Terms and this DPA.
      </p>

      <h2>2. Subject-matter, duration and nature of processing</h2>
      <ul>
        <li><strong>Subject-matter:</strong> processing required to provide, secure, support and improve the Service.</li>
        <li><strong>Duration:</strong> for the term of the subscription, plus a reasonable wind-down period as set out in Section 9.</li>
        <li><strong>Nature and purpose:</strong> hosting, transmission, storage, transformation (rasterisation, imposition, preflight), display, backup, and processing of payments.</li>
        <li><strong>Categories of data subjects:</strong> Customer's end-customers, Customer's staff, and other individuals whose data the Customer routes through the Service.</li>
        <li><strong>Categories of personal data:</strong> name, contact details, billing/delivery address, order content (which may include personal data uploaded by the data subject), authentication identifiers, IP address and device data, communications records.</li>
        <li><strong>Special categories:</strong> the Service is not designed to process special-category data or POPIA "special personal information". The Customer must not route such data through the Service without first agreeing additional safeguards with us in writing.</li>
      </ul>

      <h2>3. Our obligations</h2>
      <ol>
        <li>Process personal data only on the Customer's documented instructions, including with regard to transfers, except where required by law (in which case we will inform the Customer beforehand unless prohibited from doing so).</li>
        <li>Ensure that persons authorised to process personal data are bound by appropriate confidentiality obligations.</li>
        <li>Implement the technical and organisational security measures described in our <Link to="/legal/security">Security &amp; Backups</Link> statement.</li>
        <li>Assist the Customer, by appropriate technical and organisational measures and taking into account the nature of the processing, to fulfil its obligation to respond to data-subject requests.</li>
        <li>Assist the Customer in ensuring compliance with its obligations relating to security of processing, breach notification, data-protection impact assessments and prior consultation with supervisory authorities, taking into account the nature of processing and the information available to us.</li>
        <li>At the Customer's choice, delete or return all personal data after the end of the provision of services, as set out in Section 9.</li>
        <li>Make available to the Customer all information reasonably necessary to demonstrate compliance with this DPA, and allow for and contribute to audits as set out in Section 7.</li>
      </ol>

      <h2>4. Sub-processors</h2>
      <p>
        The Customer provides general written authorisation for us to engage sub-processors to
        process personal data on the Customer's behalf. Our current list of sub-processors,
        including the categories of processing and the location of processing, is published at
        {" "}<Link to="/legal/sub-processors">/legal/sub-processors</Link>.
      </p>
      <p>
        We will give the Customer at least 30 days' prior notice of the addition or replacement
        of a sub-processor (by updating that page and, where the Customer has opted in to legal
        notifications, by email) and the Customer may object on reasonable data-protection
        grounds, in which case the parties will work together in good faith to find a
        resolution; if none can be found, the Customer may terminate the affected service.
      </p>
      <p>
        We remain liable for the acts and omissions of our sub-processors in respect of their
        processing of personal data under this DPA.
      </p>

      <h2>5. International data transfers</h2>
      <p>
        Personal data processed by us and our sub-processors may be transferred to, stored in,
        and processed in the United Kingdom, the European Economic Area, the United States and
        South Africa. Where personal data is transferred from the UK or the EEA to a country
        that does not benefit from an adequacy decision, the parties agree that the UK
        International Data Transfer Agreement ("IDTA") and, where applicable, the EU Standard
        Contractual Clauses (Commission Implementing Decision (EU) 2021/914, Module 2 or 3 as
        appropriate) are incorporated into this DPA by reference and apply to such transfers.
      </p>
      <p>
        For transfers governed by POPIA, we comply with the conditions in section 72 of POPIA,
        including contractual safeguards equivalent to POPIA's conditions for lawful
        processing.
      </p>

      <h2>6. Personal-data breach</h2>
      <p>
        We will notify the Customer without undue delay, and in any event within 72 hours of
        becoming aware of a personal-data breach affecting the Customer's personal data. Our
        notification will, to the extent reasonably available, include the nature of the breach,
        the categories and approximate number of data subjects and records concerned, the
        likely consequences, and the measures taken or proposed to address the breach.
      </p>
      <p>
        Notifying supervisory authorities (such as the UK Information Commissioner's Office or
        the South African Information Regulator) and affected data subjects remains the
        Customer's responsibility unless we agree otherwise in writing.
      </p>

      <h2>7. Audits</h2>
      <p>
        We will make available to the Customer, on reasonable written request and no more than
        once in any 12-month period (except where required by a supervisory authority or
        following a personal-data breach), the information reasonably required to demonstrate
        compliance with this DPA. Audits will be conducted at the Customer's expense, during
        business hours, on at least 30 days' written notice, in a manner that does not disrupt
        the Service, and subject to confidentiality undertakings.
      </p>

      <h2>8. Data-subject requests</h2>
      <p>
        Where we receive a request directly from a data subject seeking to exercise their
        rights in relation to personal data we process on the Customer's behalf, we will not
        respond to the request ourselves (other than to acknowledge receipt and direct the data
        subject to the Customer) and will forward the request to the Customer without undue
        delay.
      </p>

      <h2>9. Deletion and return on termination</h2>
      <p>
        On termination or expiry of the subscription, and at the Customer's written election
        within 30 days, we will either return to the Customer or delete all personal data
        processed on the Customer's behalf, save to the extent we are required by law to retain
        copies. Subject to that election:
      </p>
      <ul>
        <li>Production files (uploads and rendered output) are deleted from active storage 180 days after order completion or account cancellation, whichever is earlier.</li>
        <li>System and application logs are retained for up to 90 days.</li>
        <li>Order and invoice records are retained for up to 5 years for accounting, tax, dispute-resolution and statutory record-keeping purposes.</li>
        <li>Backups are retained on a rolling basis for up to 35 days; any personal data persisting in a backup will be deleted on the next backup-rotation cycle.</li>
      </ul>

      <h2>10. Liability</h2>
      <p>
        The liability of each party under this DPA is subject to the limitations and exclusions
        of liability set out in the Terms of Service.
      </p>

      <h2>11. Contact</h2>
      <p>
        The point of contact for matters arising under this DPA, and the role of "Information
        Officer" for POPIA purposes for {E.legalName}, is reachable at{" "}
        <a href={`mailto:${E.dpoEmail}`}>{E.dpoEmail}</a>.
      </p>

      <p className="text-sm text-[hsl(var(--dc-navy))]/60 mt-10">
        This DPA is provided as a framework and applies on acceptance of the Terms of Service.
        For an executable counterpart on company letterhead, please contact{" "}
        <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>.
      </p>
    </LegalLayout>
  );
}
