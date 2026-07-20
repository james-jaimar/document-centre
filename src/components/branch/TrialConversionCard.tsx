import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, AlertTriangle, ShieldCheck, Store, History, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { CHECKOUT_REQUIRED_DOCS, LEGAL_DOCS } from "@/lib/legal/versions";
import { LEGAL_ENTITY } from "@/lib/legal/entity";
import { useBranchAcceptanceHistory } from "@/hooks/useBranchBillingSelfService";
import { BranchAcceptanceHistory } from "./BranchAcceptanceHistory";
import { SubscriptionDisclosureCard, AcceptedDocument } from "./SubscriptionDisclosureCard";
import type { ResolvedDiscount } from "@/hooks/useBranchActiveDiscount";

interface Props {
  branchId: string;
  branchName?: string | null;
  planSlug?: string | null;
  planName?: string | null;
  planPrice?: number | null;
  currencySymbol?: string | null;
  currencyCode?: string | null;
  trialEndsAt: string;
  onSubscribe: (accepted: AcceptedDocument[]) => void;
  loading?: boolean;
  disabled?: boolean;
}

export function TrialConversionCard({
  branchId,
  branchName,
  planSlug,
  planName,
  planPrice,
  currencySymbol,
  currencyCode,
  trialEndsAt,
  onSubscribe,
  loading,
  disabled,
}: Props) {
  const endDate = new Date(trialEndsAt);
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

  const { data: history } = useBranchAcceptanceHistory(branchId);
  const requiredDocs = useMemo(() => CHECKOUT_REQUIRED_DOCS.map((s) => LEGAL_DOCS[s]), []);
  const allAccepted = useMemo(() => {
    if (!history) return false;
    return requiredDocs.every((d) =>
      (history ?? []).some((h) => h.document_slug === d.slug && h.document_version >= d.version),
    );
  }, [history, requiredDocs]);

  const ledgerAcceptances: AcceptedDocument[] = useMemo(
    () => requiredDocs.map((d) => ({ slug: d.slug, version: d.version })),
    [requiredDocs],
  );

  const [fresh, setFresh] = useState<AcceptedDocument[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const canSubmit = allAccepted || (fresh && fresh.length > 0);

  const daysPillClass =
    daysLeft <= 3
      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
      : daysLeft <= 7
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";

  const priceLabel =
    typeof planPrice === "number"
      ? `${currencySymbol ?? ""}${planPrice.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}${currencyCode ? ` ${currencyCode}` : ""}/month`
      : null;

  const submit = () => onSubscribe(allAccepted ? ledgerAcceptances : fresh ?? []);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <Check className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-lg font-semibold capitalize leading-tight">{planName ?? planSlug}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                Trial
              </Badge>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${daysPillClass}`}>
                {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </span>
            </div>
          </div>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground">Trial ends</p>
          <p className="text-sm font-medium">{endDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
        </div>
      </div>

      {/* Urgent nudge */}
      {daysLeft <= 3 && (
        <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-900 dark:text-red-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Only <strong>{daysLeft} {daysLeft === 1 ? "day" : "days"}</strong> left — subscribe now to avoid losing access
            on {endDate.toLocaleDateString()}.
          </span>
        </div>
      )}

      {/* What happens next */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-sm">
            <ShieldCheck className="h-4 w-4" /> Subscribe before {endDate.toLocaleDateString()}
          </div>
          <ul className="text-xs text-emerald-900/80 dark:text-emerald-200/80 space-y-1 list-disc pl-5">
            <li>Zero downtime — your storefront stays live.</li>
            <li>All your branding, products, and pricing stay put.</li>
            <li>Billed monthly. Cancel anytime from the Stripe portal.</li>
          </ul>
        </div>
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-300 font-semibold text-sm">
            <Store className="h-4 w-4" /> If you do nothing
          </div>
          <ul className="text-xs text-red-900/80 dark:text-red-200/80 space-y-1 list-disc pl-5">
            <li>On {endDate.toLocaleDateString()} your storefront is paused — customers can't place orders.</li>
            <li>The branch admin becomes billing-only until you subscribe.</li>
            <li>Your data is preserved — reactivate any time to resume.</li>
          </ul>
        </div>
      </div>

      {/* Plan offer strip */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Your plan after trial</p>
          <p className="text-base font-semibold capitalize">{planName ?? planSlug}</p>
          {priceLabel ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{priceLabel}</span> · billed by {LEGAL_ENTITY.tradingName} · VAT not applicable
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Billed monthly by {LEGAL_ENTITY.tradingName} · VAT not applicable</p>
          )}
        </div>
      </div>

      {/* Re-acceptance if version bumped mid-trial */}
      {!allAccepted && (
        <SubscriptionDisclosureCard
          branchId={branchId}
          planSlug={planSlug}
          priceLabel={priceLabel}
          trialDays={0}
          onChange={setFresh}
        />
      )}

      {/* Primary CTA */}
      <Button
        onClick={submit}
        disabled={disabled || !canSubmit}
        size="lg"
        className="w-full"
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Subscribe now{branchName ? ` — keep ${branchName} live` : ""}
      </Button>

      {/* Terms history collapsible */}
      {allAccepted && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <History className="h-3.5 w-3.5" />
            {showHistory ? "Hide accepted terms" : "View accepted terms"}
            {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showHistory && (
            <div className="mt-3">
              <BranchAcceptanceHistory branchId={branchId} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TrialConversionCard;
