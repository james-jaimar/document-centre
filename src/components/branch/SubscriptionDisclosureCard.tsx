import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollText, Check } from "lucide-react";
import { CHECKOUT_REQUIRED_DOCS, LEGAL_DOCS } from "@/lib/legal/versions";
import { LEGAL_ENTITY } from "@/lib/legal/entity";
import { useBranchAcceptanceHistory } from "@/hooks/useBranchBillingSelfService";

export interface AcceptedDocument {
  slug: string;
  version: number;
}

interface Props {
  branchId?: string;
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
 *
 * If the branch has previously accepted the current version of a doc,
 * that row renders as pre-checked + disabled with an "Accepted <date>"
 * note, and is auto-included in the outgoing `accepted` list.
 */
export function SubscriptionDisclosureCard({ branchId, planSlug, priceLabel, trialDays, onChange }: Props) {
  const docs = useMemo(
    () => CHECKOUT_REQUIRED_DOCS.map((slug) => LEGAL_DOCS[slug]),
    [],
  );
  const { data: history } = useBranchAcceptanceHistory(branchId);

  // Map slug -> latest acceptance row (at current version or newer)
  const alreadyAccepted = useMemo(() => {
    const map: Record<string, { version: number; accepted_at: string } | null> = {};
    for (const d of docs) {
      const latest = (history ?? [])
        .filter((h) => h.document_slug === d.slug && h.document_version >= d.version)
        .sort((a, b) => (a.accepted_at < b.accepted_at ? 1 : -1))[0];
      map[d.slug] = latest ? { version: latest.document_version, accepted_at: latest.accepted_at } : null;
    }
    return map;
  }, [history, docs]);

  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Seed local state from ledger once history loads
  useEffect(() => {
    if (!history) return;
    setChecked((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const d of docs) {
        if (alreadyAccepted[d.slug] && !next[d.slug]) {
          next[d.slug] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [history, alreadyAccepted, docs]);

  // Emit onChange whenever effective checked-state changes
  useEffect(() => {
    const allOk = docs.every((d) => checked[d.slug]);
    onChange(
      allOk ? docs.map((d) => ({ slug: d.slug, version: d.version })) : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, docs]);

  const toggle = (slug: string, v: boolean) => {
    setChecked((prev) => ({ ...prev, [slug]: v }));
  };

  const allPreAccepted = docs.every((d) => alreadyAccepted[d.slug]);

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

        {allPreAccepted ? (
          <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-sm font-medium">
              <Check className="h-4 w-4" /> Terms accepted for this branch
            </div>
            <ul className="text-xs text-muted-foreground space-y-0.5 pl-6 list-disc">
              {docs.map((d) => {
                const a = alreadyAccepted[d.slug]!;
                return (
                  <li key={d.slug}>
                    <Link to={d.route} target="_blank" rel="noreferrer" className="underline">
                      {d.title}
                    </Link>{" "}
                    (v{a.version}) — {new Date(a.accepted_at).toLocaleDateString()}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => {
              const pre = alreadyAccepted[d.slug];
              return (
                <div key={d.slug} className="flex items-start gap-2">
                  <Checkbox
                    id={`accept-${d.slug}`}
                    checked={!!checked[d.slug]}
                    disabled={!!pre}
                    onCheckedChange={(v) => toggle(d.slug, v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor={`accept-${d.slug}`} className="text-sm font-normal leading-snug">
                    I have read and accept the{" "}
                    <Link to={d.route} target="_blank" rel="noreferrer" className="underline">
                      {d.title}
                    </Link>{" "}
                    <span className="text-muted-foreground">(v{d.version})</span>
                    {pre ? (
                      <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-400">
                        · accepted {new Date(pre.accepted_at).toLocaleDateString()}
                      </span>
                    ) : null}
                  </Label>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SubscriptionDisclosureCard;
