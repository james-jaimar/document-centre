import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { LEGAL_DOCS, CHECKOUT_REQUIRED_DOCS, type LegalDocSlug } from "@/lib/legal/versions";
import { usePlatformLegalAcceptance, usePlatformBranchSubscriptions } from "@/hooks/usePlatformSubscriptions";

export default function PlatformLegalStatus() {
  const { data: acceptances, isLoading } = usePlatformLegalAcceptance();
  const { data: subs } = usePlatformBranchSubscriptions();

  // Group: branch -> doc_slug -> acceptance
  const byBranch = useMemo(() => {
    const map = new Map<string, { branchName: string; tenantName: string; docs: Map<string, { version: number; acceptedAt: string }> }>();
    for (const a of acceptances ?? []) {
      const key = a.branch_id;
      if (!map.has(key)) {
        map.set(key, { branchName: a.branch_name, tenantName: a.tenant_name, docs: new Map() });
      }
      map.get(key)!.docs.set(a.doc_slug, { version: a.accepted_version, acceptedAt: a.accepted_at });
    }
    // Seed branches that have a subscription but no acceptance yet
    for (const s of subs ?? []) {
      if (!map.has(s.branch_id)) {
        map.set(s.branch_id, { branchName: s.branch_name, tenantName: s.tenant_name, docs: new Map() });
      }
    }
    return Array.from(map.entries())
      .map(([branchId, v]) => ({ branchId, ...v }))
      .sort((a, b) => (a.tenantName + a.branchName).localeCompare(b.tenantName + b.branchName));
  }, [acceptances, subs]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Legal Acceptance Status</h1>
        <p className="text-muted-foreground">
          Which branches have accepted the current published version of each required document.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current published versions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {CHECKOUT_REQUIRED_DOCS.map((slug) => {
              const doc = LEGAL_DOCS[slug];
              return (
                <div key={slug} className="border rounded-md p-3">
                  <div className="font-medium text-sm">{doc.title}</div>
                  <div className="text-xs text-muted-foreground">v{doc.version} · {doc.effective}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-branch acceptance ({byBranch.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Branch</TableHead>
                  {CHECKOUT_REQUIRED_DOCS.map((slug) => (
                    <TableHead key={slug}>{LEGAL_DOCS[slug].title}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {byBranch.map((b) => (
                  <TableRow key={b.branchId}>
                    <TableCell className="font-medium">{b.tenantName}</TableCell>
                    <TableCell>{b.branchName}</TableCell>
                    {CHECKOUT_REQUIRED_DOCS.map((slug: LegalDocSlug) => {
                      const accepted = b.docs.get(slug);
                      const required = LEGAL_DOCS[slug].version;
                      if (!accepted) {
                        return (
                          <TableCell key={slug}>
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" /> Missing
                            </Badge>
                          </TableCell>
                        );
                      }
                      if (accepted.version < required) {
                        return (
                          <TableCell key={slug}>
                            <Badge className="bg-amber-100 text-amber-800 gap-1">
                              <AlertCircle className="h-3 w-3" /> v{accepted.version} (needs v{required})
                            </Badge>
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell key={slug}>
                          <Badge className="bg-green-100 text-green-800 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> v{accepted.version}
                          </Badge>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {byBranch.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2 + CHECKOUT_REQUIRED_DOCS.length} className="text-center text-muted-foreground py-8">
                      No branches yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
