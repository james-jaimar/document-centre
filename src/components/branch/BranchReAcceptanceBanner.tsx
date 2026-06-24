import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LEGAL_DOCS, type LegalDocSlug } from "@/lib/legal/versions";
import {
  useBranchDocsNeedingReacceptance,
  useRecordBranchReacceptance,
} from "@/hooks/useBranchBillingSelfService";

/**
 * Shown when LEGAL_DOCS has bumped one of the required docs past
 * whatever this branch most recently accepted. The branch admin
 * must tick every stale doc to re-accept. We never block the UI —
 * this is a banner, not a modal — so they can still pay bills.
 */
export function BranchReAcceptanceBanner({ branchId }: { branchId: string }) {
  const { stale, isLoading } = useBranchDocsNeedingReacceptance(branchId);
  const record = useRecordBranchReacceptance();
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const docs = useMemo(
    () => stale.map((s) => ({ ...LEGAL_DOCS[s.slug], current: s.current, accepted: s.accepted })),
    [stale],
  );
  const allChecked = docs.length > 0 && docs.every((d) => checked[d.slug]);

  if (isLoading || docs.length === 0) return null;

  const submit = async () => {
    try {
      await record.mutateAsync({
        branch_id: branchId,
        acceptances: docs.map((d) => ({ slug: d.slug, version: d.current })),
      });
      toast.success("Thanks — your acceptance is on file.");
      setChecked({});
    } catch (e: any) {
      toast.error(e.message || "Failed to record acceptance");
    }
  };

  return (
    <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" /> Updated terms need your acceptance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-amber-800 dark:text-amber-300">
          We've updated the following documents. Please review and re-accept to keep your subscription in good standing.
        </p>
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.slug} className="flex items-start gap-2">
              <Checkbox
                id={`reaccept-${d.slug}`}
                checked={!!checked[d.slug]}
                onCheckedChange={(v) => setChecked((c) => ({ ...c, [d.slug as LegalDocSlug]: v === true }))}
                className="mt-0.5"
              />
              <Label htmlFor={`reaccept-${d.slug}`} className="font-normal leading-snug">
                I have read and accept the{" "}
                <Link to={d.route} target="_blank" rel="noreferrer" className="underline">{d.title}</Link>{" "}
                <span className="text-muted-foreground">
                  (v{d.current}{d.accepted !== null ? `, previously v${d.accepted}` : ", first acceptance"})
                </span>
              </Label>
            </div>
          ))}
        </div>
        <Button size="sm" onClick={submit} disabled={!allChecked || record.isPending}>
          {record.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm acceptance
        </Button>
      </CardContent>
    </Card>
  );
}

export default BranchReAcceptanceBanner;
