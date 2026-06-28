import LegalDocPage from "@/components/legal/LegalDocPage";
import { LEGAL_ENTITY as E } from "@/lib/legal/entity";
import { SUPPORT_SCOPE } from "@/lib/legal/supportScope";

export function Body() {
  return (
    <>
      <p>
        This document describes the target availability of the Document Centre Service and the
        support we provide as part of a paid subscription. It is provided in good faith as a
        service commitment and does not, by itself, create a separate contract or a financial
        service-level agreement. Any service credits or remedies are governed by, and limited
        by, the Terms of Service.
      </p>

      <h2>1. Availability target</h2>
      <p>
        We aim to keep the Service available at <strong>99.5% or better per calendar month</strong>,
        measured as the percentage of minutes in the month during which the platform's primary
        admin and storefront URLs are reachable and responding to authenticated requests within
        a reasonable time.
      </p>

      <h2>2. Exclusions</h2>
      <p>
        The following periods do not count as downtime for the purposes of the availability
        target:
      </p>
      <ul>
        <li>Scheduled maintenance, announced at least 48 hours in advance (we aim to schedule maintenance outside UK business hours where practical);</li>
        <li>Emergency maintenance required to address a security, integrity or stability issue;</li>
        <li>Outages, errors or degradations of any third-party service the platform depends on, including but not limited to Supabase, Amazon Web Services, Google Cloud, Stripe, our DNS provider, our email provider, and the public internet;</li>
        <li>Faults caused by the Customer's own configuration, integrations, custom domains, or end-user devices and connectivity;</li>
        <li>Force-majeure events, including war, civil unrest, governmental action, natural disasters, pandemics, strikes and large-scale internet outages;</li>
        <li>Issues affecting features designated as "beta", "preview" or "experimental".</li>
      </ul>

      <h2>3. What's included in support</h2>
      <ul>
        {SUPPORT_SCOPE.included.map((line) => <li key={line}>{line}</li>)}
      </ul>

      <h2>4. What's not included (available separately on quote)</h2>
      <ul>
        {SUPPORT_SCOPE.notIncluded.map((line) => <li key={line}>{line}</li>)}
      </ul>

      <h2>5. Support channel and response targets</h2>
      <p>
        Support is provided by email at{" "}
        <a href={`mailto:${E.supportEmail}`}>{E.supportEmail}</a>, during normal UK business
        hours (Monday–Friday, 09:00–17:00 Europe/London, excluding public holidays). We aim to
        acknowledge support enquiries within one (1) business day. Acknowledgement is not the
        same as resolution; resolution time depends on the nature of the issue and may require
        cooperation from the Customer or from third-party providers.
      </p>

      <h2>6. Status communications</h2>
      <p>
        We will use reasonable efforts to communicate about platform incidents and planned
        maintenance through in-app banners, the Document Centre status page, and — for material
        events — by email to designated tenant contacts.
      </p>

      <h2>7. No service credits, no liquidated damages</h2>
      <p>
        Where the availability target is not met, the Customer's remedies are limited to those
        set out in the Terms of Service. We do not offer automatic service credits or liquidated
        damages. Custom service-level agreements, including financial remedies, are available
        only on request and on separately agreed commercial terms.
      </p>
    </>
  );
}

export default function ServiceLevel() {
  return <LegalDocPage slug="sla" Fallback={Body} />;
}
