import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, Loader2 } from "lucide-react";
import { useBranchAcceptanceHistory } from "@/hooks/useBranchBillingSelfService";
import { LEGAL_DOCS, type LegalDocSlug } from "@/lib/legal/versions";

function docTitle(slug: string): string {
  return (LEGAL_DOCS as any)[slug as LegalDocSlug]?.title ?? slug;
}

const contextLabel: Record<string, string> = {
  branch_checkout: "Checkout",
  branch_reacceptance: "Re-acceptance",
};

export function BranchAcceptanceHistory({ branchId }: { branchId: string }) {
  const { data, isLoading } = useBranchAcceptanceHistory(branchId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Acceptance history
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No acceptances recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{docTitle(row.document_slug)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">v{row.document_version}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(row.accepted_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {contextLabel[row.context ?? ""] ?? row.context ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {row.ip_address ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default BranchAcceptanceHistory;
