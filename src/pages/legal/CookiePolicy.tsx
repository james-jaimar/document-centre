import LegalLayout from "./LegalLayout";
import { LEGAL_ENTITY as E } from "@/lib/legal/entity";
import { LEGAL_DOCS } from "@/lib/legal/versions";

export default function CookiePolicy() {
  const v = LEGAL_DOCS.cookies;
  return (
    <LegalLayout title={v.title} updated={v.effective} version={v.version}>
      <p>
        This Cookie Policy explains how {E.legalName} uses cookies and similar technologies on
        the Document Centre marketing website, admin portal and customer storefronts.
      </p>

      <h2>1. What cookies are</h2>
      <p>
        Cookies are small text files placed on your device by your browser. They are widely
        used to make websites work, to make them work more efficiently, and to provide
        information to the owners of the site. Similar technologies — including
        <code>localStorage</code> and <code>sessionStorage</code> — perform comparable roles
        and are covered by this policy where relevant.
      </p>

      <h2>2. Categories of cookies we use</h2>
      <ul>
        <li>
          <strong>Strictly necessary</strong> — used to keep you signed in (Supabase
          authentication tokens stored in <code>localStorage</code>), to maintain a CSRF token
          on form submissions, and to remember your tenant/branch selection while you navigate.
          These cannot be switched off without breaking the Service.
        </li>
        <li>
          <strong>Functional</strong> — used to remember non-essential preferences such as your
          sidebar collapsed/expanded state, theme preference, and recently selected products.
        </li>
        <li>
          <strong>Analytics</strong> — where the marketing website enables Google Analytics or
          a similar privacy-conscious analytics provider, we use cookies to count visits and
          understand which pages are most useful. Analytics is configured to anonymise IP
          addresses where the provider supports it. Analytics is disabled where you decline
          analytics in any cookie banner we present.
        </li>
        <li>
          <strong>Third-party</strong> — Stripe sets cookies on its hosted checkout and
          billing-portal pages, which we cannot control; their use is governed by Stripe's
          cookie policy. We do not use advertising or cross-site tracking cookies.
        </li>
      </ul>

      <h2>3. Managing cookies</h2>
      <p>
        Most browsers allow you to view, delete and block cookies from individual sites or all
        sites. Refer to your browser's help pages for instructions. Disabling strictly
        necessary cookies will prevent the Service from working correctly — for example, you
        will not be able to stay signed in.
      </p>

      <h2>4. Changes</h2>
      <p>
        We will update this policy when we add or remove cookie-setting technologies on the
        Service. The "Last updated" date above will reflect any change.
      </p>

      <h2>5. Contact</h2>
      <p>
        Questions about this Cookie Policy can be sent to{" "}
        <a href={`mailto:${E.dpoEmail}`}>{E.dpoEmail}</a>.
      </p>
    </LegalLayout>
  );
}
