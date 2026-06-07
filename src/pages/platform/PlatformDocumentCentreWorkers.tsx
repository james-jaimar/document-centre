import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { opsApi } from "@/lib/opsApi";
import { RefreshCw } from "lucide-react";

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

function ms(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 1000) return `${v.toFixed(0)}ms`;
  return `${(v / 1000).toFixed(2)}s`;
}

export default function PlatformDocumentCentreWorkers() {
  const live = useQuery({
    queryKey: ["ops", "gcp", "live"],
    queryFn: opsApi.gcpLive,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const services = live.data?.cloud_run?.services ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cloud Run services</h2>
          <p className="text-sm text-muted-foreground">
            Live CPU, memory, instance count and request latency per Cloud Run service. Region: <code>{live.data?.cloud_run?.region ?? live.data?.region ?? "—"}</code>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => live.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Instances</TableHead>
                <TableHead className="text-right">CPU</TableHead>
                <TableHead className="text-right">Memory</TableHead>
                <TableHead className="text-right">Req / min</TableHead>
                <TableHead className="text-right">p95</TableHead>
                <TableHead className="text-right">Cold start</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.service}>
                  <TableCell className="font-mono text-xs">{s.service}</TableCell>
                  <TableCell className="text-right">{s.instance_count?.toFixed(0) ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={(s.cpu_utilization ?? 0) > 0.7 ? "destructive" : "secondary"}>{pct(s.cpu_utilization)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{pct(s.memory_utilization)}</TableCell>
                  <TableCell className="text-right">{s.request_count_1m?.toFixed(0) ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs">{ms(s.request_latency_p95_ms)}</TableCell>
                  <TableCell className="text-right text-xs">{ms(s.startup_latency_ms)}</TableCell>
                </TableRow>
              ))}
              {services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {live.data?.cloud_run?.error
                      ? `Monitoring error: ${live.data.cloud_run.error}`
                      : <>No services. Set <code>OPS_CLOUD_RUN_SERVICES</code> on pdf-api and grant <code>roles/monitoring.viewer</code>.</>}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Scaling, restarts and concurrency are managed by Cloud Run itself —
        adjust via <code>gcloud run services update {"<service>"}</code> or the GCP console; this view is read-only.
      </p>
    </div>
  );
}
