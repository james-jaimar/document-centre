import LegalDocPage from "@/components/legal/LegalDocPage";
import { LEGAL_ENTITY as E } from "@/lib/legal/entity";

interface Sub {
  name: string;
  purpose: string;
  data: string;
  location: string;
  link: string;
}

const SUBS: Sub[] = [
  {
    name: "Supabase Inc. (Lovable Cloud)",
    purpose: "Primary database (Postgres), authentication, row-level-security policy enforcement, file storage and Edge Functions",
    data: "Account, tenant and order data; uploaded files; audit/event logs",
    location: "EU (primary region) with US replication for backups",
    link: "https://supabase.com/privacy",
  },
  {
    name: "Amazon Web Services EMEA SARL",
    purpose: "S3 object storage for production artefacts, marketing-site hosting (Amplify), CloudFront CDN",
    data: "Uploaded files and rendered output; marketing-site assets and access logs",
    location: "eu-west-1 (Ireland)",
    link: "https://aws.amazon.com/privacy/",
  },
  {
    name: "Google Cloud EMEA Limited",
    purpose: "Cloud Run for PDF rendering/imposition workers; Cloud Tasks for job queueing",
    data: "Uploaded files (transient processing); job metadata",
    location: "europe-west2 (London)",
    link: "https://cloud.google.com/terms/data-processing-addendum",
  },
  {
    name: "Stripe Payments Europe, Limited",
    purpose: "Subscription billing, invoicing, payment-method storage, hosted customer billing portal",
    data: "Billing contact, payment-method tokens, invoice and transaction records (no full card numbers reach our servers)",
    location: "Ireland (with Stripe global infrastructure)",
    link: "https://stripe.com/privacy",
  },
  {
    name: "Mailgun Technologies, Inc.",
    purpose: "Transactional email delivery (auth emails, order notifications, subscription notifications)",
    data: "Recipient email, sender, subject, message body, delivery events",
    location: "EU sending region",
    link: "https://www.mailgun.com/privacy-policy/",
  },
  {
    name: "Cloudflare, Inc.",
    purpose: "DNS and edge security for the document-centre.com domain",
    data: "Request metadata (IP, user agent, request path) for security and traffic-management purposes",
    location: "Global edge",
    link: "https://www.cloudflare.com/privacypolicy/",
  },
  {
    name: "Google LLC (Sign-in)",
    purpose: "OAuth authentication where users choose to sign in with Google",
    data: "Name, email, profile picture, provider identifier",
    location: "Global",
    link: "https://policies.google.com/privacy",
  },
];
export function Body() {
  return (
    <>
      <p>
        {E.legalName} engages the following sub-processors to help us provide the Document
        Centre Service. This list is incorporated into our <a href="/legal/dpa">Data Processing
        Addendum</a>. We will give at least 30 days' notice on this page (and, where you have
        opted in to legal notifications, by email) before adding or replacing a sub-processor.
      </p>

      <div className="not-prose mt-8 overflow-x-auto rounded-lg border border-[hsl(var(--dc-border))]">
        <table className="w-full text-[14px]">
          <thead className="bg-[hsl(var(--dc-navy))] text-white">
            <tr>
              <th className="text-left p-3 font-semibold">Sub-processor</th>
              <th className="text-left p-3 font-semibold">Purpose</th>
              <th className="text-left p-3 font-semibold">Data categories</th>
              <th className="text-left p-3 font-semibold">Location</th>
              <th className="text-left p-3 font-semibold">Privacy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--dc-border))]">
            {SUBS.map((s) => (
              <tr key={s.name} className="align-top">
                <td className="p-3 font-medium text-[hsl(var(--dc-navy))]">{s.name}</td>
                <td className="p-3 text-[hsl(var(--dc-navy))]/80">{s.purpose}</td>
                <td className="p-3 text-[hsl(var(--dc-navy))]/80">{s.data}</td>
                <td className="p-3 text-[hsl(var(--dc-navy))]/80">{s.location}</td>
                <td className="p-3">
                  <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--dc-blue))] hover:underline">
                    Policy ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10">Customer-controlled sub-processors</h2>
      <p>
        Tenants may, through their own admin portal, configure additional third-party services
        — for example a Tenant's own SMTP/IMAP email account, payment gateway, or delivery
        courier integration. Those services are engaged by the Tenant as data controller and
        are not sub-processors of {E.legalName}.
      </p>

      <h2>Questions</h2>
      <p>
        Sub-processor questions can be sent to{" "}
        <a href={`mailto:${E.dpoEmail}`}>{E.dpoEmail}</a>.
      </p>
    </LegalLayout>
  );
}
