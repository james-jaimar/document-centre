import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { opsApi, type OpsJob } from "@/lib/opsApi";
import { toast } from "sonner";
import { Ban, Eye, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_OPTIONS = ["all", "queued", "started", "completed", "failed", "retry"];

export default function PlatformDocumentCentreJobs() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [tenantId, setTenantId] = useState("");
  const [selected, setSelected] = useState<OpsJob | null>(null);

  const jobs = useQuery({
    queryKey: ["ops", "jobs", status, tenantId],
    queryFn: () => opsApi.jobs({
      limit: 200,
      status: status === "all" ? undefined : status,
      tenant_id: tenantId || undefined,
    }),
    refetchInterval: 5000,
  });

  const revoke = useMutation({
    mutationFn: ({ id, terminate }: { id: string; terminate: boolean }) => opsApi.revokeTask(id, terminate),
    onSuccess: () => { toast.success("Task revoked"); qc.invalidateQueries({ queryKey: ["ops", "jobs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Jobs</h2>
          <p className="text-sm text-muted-foreground">Recent processing jobs across all tenants.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Filter by tenant_id" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-64" />
          <Button size="sm" variant="outline" onClick={() => jobs.refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operation</TableHead>
                <TableHead>Queue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead className="text-right">Retries</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.data?.map((j) => (
                <TableRow key={j.id} className="cursor-pointer" onClick={() => setSelected(j)}>
                  <TableCell className="font-mono text-xs">{j.operation}</TableCell>
                  <TableCell className="text-xs">{j.queue}</TableCell>
                  <TableCell>
                    <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>
                      {j.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs truncate max-w-32">{j.tenant_id ?? "—"}</TableCell>
                  <TableCell className="text-right">{j.retries}</TableCell>
                  <TableCell className="text-right text-xs">{j.duration_ms ? `${j.duration_ms}ms` : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(j); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(j.status === "queued" || j.status === "started") && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Revoke and terminate this task?")) revoke.mutate({ id: j.id, terminate: true });
                      }}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {jobs.data?.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No jobs</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Job {selected.id}</h3>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button>
            </div>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">{JSON.stringify(selected, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
