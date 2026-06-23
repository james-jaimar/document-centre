import LegalLayout from "./LegalLayout";
import { Link } from "react-router-dom";
import { LEGAL_DOCS_LIST } from "@/lib/legal/versions";
import { LEGAL_ENTITY as E } from "@/lib/legal/entity";

const descriptions: Record<string, string> = {
  terms: "The master agreement covering use of the Document Centre platform, both for print-shop subscribers and end-customers ordering through a storefront.",
  privacy: "How we collect, use, store and protect personal information — for the marketing site, the admin portal, and customer storefronts.",
  dpa: "Operator / data-processing terms covering personal data we process on behalf of a subscribing branch (UK GDPR Article 28 / POPIA Operator).",
  aup: "What you may and may not upload, print, distribute or do on the platform.",
  sla: "Our service availability target, exclusions, and what happens during scheduled or emergency maintenance.",
  billing: "Subscription pricing, trials, billing cycle, descriptors, failed payments, grace period, cancellation, and refunds.",
  subprocessors: "The third-party infrastructure providers we use to deliver the Service, what they do, and where they process data.",
  security: "The technical and organisational controls we use to protect the platform, plus our backup and recovery position.",
  cookies: "The cookies and similar technologies we set, what they do, and how to control them.",
};

export default function LegalIndex() {
  return (
    <LegalLayout title="Legal Centre" updated="1 January 2027">
      <p>
        Welcome to the legal centre for the Document Centre platform, operated by{" "}
        <strong>{E.legalName}</strong> (Company No. {E.companyNumber}, {E.jurisdiction}),
        trading as {E.tradingName}.
      </p>
      <p>
        All of the documents below apply to your use of the Service. When you subscribe a
        branch, you accept the Terms of Service, Privacy Policy, Data Processing Addendum, and
        Billing &amp; Cancellation Policy at checkout — the remaining documents are
        incorporated by reference.
      </p>

      <div className="not-prose mt-8 grid gap-3">
        {LEGAL_DOCS_LIST.map((d) => (
          <Link
            key={d.slug}
            to={d.route}
            className="block rounded-lg border border-[hsl(var(--dc-border))] bg-white p-5 hover:border-[hsl(var(--dc-blue))] hover:shadow-sm transition"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-lg font-semibold text-[hsl(var(--dc-navy))]">{d.title}</h3>
              <span className="text-xs text-[hsl(var(--dc-navy))]/50 shrink-0">
                v{d.version} · {d.effective}
              </span>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-[hsl(var(--dc-navy))]/70">
              {descriptions[d.slug]}
            </p>
          </Link>
        ))}
      </div>

      <h2 className="mt-12">Contact</h2>
      <p>
        For legal, privacy or data-protection enquiries, write to{" "}
        <a href={`mailto:${E.dpoEmail}`}>{E.dpoEmail}</a> or by post to {E.legalName},{" "}
        {E.registeredOffice}.
      </p>
    </LegalLayout>
  );
}
