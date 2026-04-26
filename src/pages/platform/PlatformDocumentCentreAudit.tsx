import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { opsApi } from "@/lib/opsApi";
import { formatDistanceToNow } from "date-fns";

export default function PlatformDocumentCentreAudit() {
  const [action, setAction] = useState("");
  const [tenantId, setTenantId] = useState("");
  const audit = useQuery({
    queryKey: ["ops", "audit", action, tenantId],
    queryFn: () => opsApi.audit({
      limit: 200,
      action: action || undefined,
      tenant_id: tenantId || undefined,
    }),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Audit log</h2>
          <p className="text-sm text-muted-foreground">Every privileged ops action is recorded here.</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} className="w-48" />
          <Input placeholder="Filter by tenant_id" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-64" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.data?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="font-mono text-xs">{e.action}</Badge></TableCell>
                  <TableCell className="text-xs">
                    <div>{e.actor_email ?? "—"}</div>
                    <div className="text-muted-foreground">{e.actor_role ?? ""}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.target ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs truncate max-w-32">{e.tenant_id ?? "—"}</TableCell>
                  <TableCell>
                    {e.detail && (
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {JSON.stringify(e.detail).slice(0, 80)}
                      </code>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {audit.data?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No audit entries</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
