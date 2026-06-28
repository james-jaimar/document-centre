import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { Body as AupBody } from "@/pages/legal/AcceptableUsePolicy";
import { Body as BillingBody } from "@/pages/legal/BillingPolicy";
import { Body as CookiesBody } from "@/pages/legal/CookiePolicy";
import { Body as DpaBody } from "@/pages/legal/DataProcessingAddendum";
import { Body as SecurityBody } from "@/pages/legal/SecurityStatement";
import { Body as SlaBody } from "@/pages/legal/ServiceLevel";
import { Body as SubprocessorsBody } from "@/pages/legal/SubProcessors";
import type { LegalDocSlug } from "./versions";

const BODIES: Record<string, () => JSX.Element> = {
  aup: AupBody,
  billing: BillingBody,
  cookies: CookiesBody,
  dpa: DpaBody,
  security: SecurityBody,
  sla: SlaBody,
  subprocessors: SubprocessorsBody,
};

/**
 * Renders the current hardcoded body of a platform legal doc to HTML
 * so the admin can seed the editor with the default copy and start
 * editing from there.
 */
export function getDefaultHtml(slug: LegalDocSlug): string {
  const Body = BODIES[slug];
  if (!Body) return "";
  return renderToStaticMarkup(
    <MemoryRouter>
      <Body />
    </MemoryRouter>
  );
}
