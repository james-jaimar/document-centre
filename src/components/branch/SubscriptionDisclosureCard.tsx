import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollText } from "lucide-react";
import { CHECKOUT_REQUIRED_DOCS, LEGAL_DOCS } from "@/lib/legal/versions";
import { LEGAL_ENTITY } from "@/lib/legal/entity";

export interface AcceptedDocument {
  slug: string;
  version: number;
}

interface Props {
  planSlug?: string | null;
  priceLabel?: string | null;
  trialDays?: number | null;
  onChange: (accepted: AcceptedDocument[] | null) => void;
}

/**
 * Shown immediately before "Pay Now" / "Add payment method". The branch
 * subscriber must explicitly tick each required document; we hand the
 * list of accepted (slug, version) tuples back to the parent panel so
 * the edge function can persist them in `subscription_acceptances`.
 */
export function SubscriptionDisclosureCard({ planSlug, priceLabel, trialDays, onChange }: Props) {
  const docs = useMemo(
    () => CHECKOUT_REQUIRED_DOCS.map((slug) => LEGAL_DOCS[slug]),
    [],
  );
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (slug: string, v: boolean) => {
    const next = { ...checked, [slug]: v };
    setChecked(next);
    const allOk = docs.every((d) => next[d.slug]);
    onChange(
      allOk
        ? docs.map((d) => ({ slug: d.slug, version: d.version }))
        : null,
    );
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="h-4 w-4" /> Before you continue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="rounded-md bg-muted/40 p-3 space-y-1">
          <p>
            <strong>{LEGAL_ENTITY.tradingName}</strong> ({LEGAL_ENTITY.legalName},
            company no. {LEGAL_ENTITY.companyNumber}) will bill this branch
            for the <strong className="capitalize">{planSlug ?? "selected"}</strong> plan
            {priceLabel ? <> at <strong>{priceLabel}</strong></> : null}
            {trialDays && trialDays > 0 ? <> after a {trialDays}-day trial</> : null}.
          </p>
          <ul className="list-disc pl-5 text-muted-foreground text-xs space-y-0.5">
            <li>Billed in advance each period via Stripe. VAT not applicable.</li>
            <li>Cancel any time — access continues until the end of the paid period; no pro-rata refunds.</li>
            <li>If payment fails we keep the branch live for a 7-day grace window before restricting access.</li>
          </ul>
        </div>

        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.slug} className="flex items-start gap-2">
              <Checkbox
                id={`accept-${d.slug}`}
                checked={!!checked[d.slug]}
                onCheckedChange={(v) => toggle(d.slug, v === true)}
                className="mt-0.5"
              />
              <Label htmlFor={`accept-${d.slug}`} className="text-sm font-normal leading-snug">
                I have read and accept the{" "}
                <Link to={d.route} target="_blank" rel="noreferrer" className="underline">
                  {d.title}
                </Link>{" "}
                <span className="text-muted-foreground">(v{d.version})</span>
              </Label>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default SubscriptionDisclosureCard;
