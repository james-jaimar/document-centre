import LegalDocPage from "@/components/legal/LegalDocPage";
import { LEGAL_ENTITY as E } from "@/lib/legal/entity";

export function Body() {
  return (
    <>
      <p>
        {E.legalName} takes the security of customer data seriously. This statement describes
        the technical and organisational measures we use to protect the Document Centre
        platform. It is a good-faith description of the controls we operate today; it is not a
        certification and not a substitute for the formal commitments in the{" "}
        <a href="/legal/dpa">Data Processing Addendum</a>.
      </p>

      <h2>1. Encryption</h2>
      <ul>
        <li><strong>In transit:</strong> all traffic to the platform is served over HTTPS/TLS 1.2 or above. Plaintext HTTP is redirected.</li>
        <li><strong>At rest:</strong> our database, object storage and backups are encrypted at rest using the AES-256 facilities provided by Supabase, Amazon Web Services and Google Cloud.</li>
        <li><strong>Payment data:</strong> card details are entered into Stripe-hosted elements and never transit or rest on our servers. We store only Stripe identifiers and a last-four / brand for display.</li>
      </ul>

      <h2>2. Tenant isolation</h2>
      <ul>
        <li>Every row of data carries a tenant identifier and, where applicable, a branch identifier.</li>
        <li>Postgres Row-Level Security policies enforce isolation at the database layer for every read and write, in addition to checks in application code.</li>
        <li>Storefront API requests carry an <code>x-storefront-tenant</code> header that database policies verify, so a compromised client cannot trivially read another tenant's data.</li>
        <li>Sensitive branch identifiers (banking details, VAT/registration numbers, finance emails) live in a separate <code>branch_private</code> table reachable only by owner/admin roles within that branch's tenant.</li>
      </ul>

      <h2>3. Authentication and access control</h2>
      <ul>
        <li>Email + password authentication with industry-standard password hashing, plus OAuth sign-in with Google.</li>
        <li>Role-based access using granular tenant memberships (Owner, Admin, Sales, Production, Accounts, Customer).</li>
        <li>Platform-administrator roles are stored in a separate <code>user_roles</code> table — never on the user profile — to mitigate privilege-escalation risk.</li>
        <li>Privileged actions are audited (see Section 6).</li>
        <li>Edge Functions enforce <code>supabase.auth.getUser()</code> on every privileged call; service-role keys are never exposed to the browser.</li>
      </ul>

      <h2>4. Network and infrastructure security</h2>
      <ul>
        <li>Production database access is restricted to authorised Supabase service principals; there is no direct public Postgres endpoint.</li>
        <li>Cloud Run rendering workers run in a private VPC with concurrency limits and per-job timeouts.</li>
        <li>Cloudflare provides DNS, basic edge protection and bot heuristics on the marketing domain.</li>
        <li>Secrets (API keys, signing secrets, service-role keys) are held in the relevant cloud secret manager and injected at runtime; secrets are never committed to source control.</li>
      </ul>

      <h2>5. Software development and change management</h2>
      <ul>
        <li>All production changes go through code review and automated build/typecheck checks before deployment.</li>
        <li>Database schema changes are tracked as versioned, reviewable migrations.</li>
        <li>We monitor dependency-vulnerability advisories and patch on a risk-prioritised cadence.</li>
      </ul>

      <h2>6. Logging, monitoring and audit</h2>
      <ul>
        <li>Application and edge-function logs are retained for up to 90 days.</li>
        <li>Sensitive administrative actions (subscription overrides, plan assignment, user-role changes) are written to an audit log.</li>
        <li>We monitor platform-level error rates and queue health, and alert on material anomalies.</li>
      </ul>

      <h2>7. Backups and disaster recovery</h2>
      <ul>
        <li>The production database is backed up on a rolling daily basis by Supabase, with point-in-time recovery within Supabase's published window.</li>
        <li>Object storage (uploaded files and rendered output) is held in Amazon S3 with versioning and lifecycle policies appropriate to the retention schedule.</li>
        <li>Backups are intended for disaster recovery and platform restoration; they are not a substitute for branch-level recordkeeping or for recovery of a single accidentally-deleted record some weeks after the fact.</li>
        <li>We do not commit to a published Recovery Time Objective (RTO) or Recovery Point Objective (RPO); restoration is performed on a best-effort basis using our infrastructure providers' published facilities.</li>
      </ul>

      <h2>8. Personnel</h2>
      <ul>
        <li>All persons with access to production data are bound by appropriate confidentiality obligations.</li>
        <li>Access to production data is limited to the minimum number of personnel necessary to operate and support the Service.</li>
      </ul>

      <h2>9. Incident response</h2>
      <p>
        We aim to detect, contain and remediate personal-data breaches as quickly as practicable
        and to notify affected Customers within 72 hours of becoming aware of a qualifying
        breach, in line with Section 6 of the <a href="/legal/dpa">Data Processing Addendum</a>.
        Notifying supervisory authorities and affected data subjects of a breach involving
        Customer data remains the Customer's responsibility unless we agree otherwise in
        writing.
      </p>

      <h2>10. Responsible disclosure</h2>
      <p>
        If you believe you have identified a security vulnerability in the Service, please
        report it to <a href={`mailto:${E.supportEmail}`}>{E.supportEmail}</a> with steps to
        reproduce. Please do not publicly disclose vulnerabilities before we have had a
        reasonable opportunity to investigate and remediate. We will acknowledge legitimate
        reports and keep you informed of progress.
      </p>

      <h2>11. No guarantee</h2>
      <p>
        No system is 100% secure. We work hard to protect customer data, but we cannot
        guarantee absolute security and accept no liability for security incidents to the
        extent excluded or limited by the Terms of Service.
      </p>
    </LegalLayout>
  );
}
