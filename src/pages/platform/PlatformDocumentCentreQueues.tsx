import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { opsApi } from "@/lib/opsApi";
import { RefreshCw } from "lucide-react";

export default function PlatformDocumentCentreQueues() {
  const live = useQuery({
    queryKey: ["ops", "gcp", "live"],
    queryFn: opsApi.gcpLive,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const queues = live.data?.cloud_tasks?.queues ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cloud Tasks queues</h2>
          <p className="text-sm text-muted-foreground">
            Live depth, in-flight dispatches and throughput from Cloud Tasks. Backend: <code>{live.data?.cloud_tasks?.backend ?? "—"}</code>
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
                <TableHead>Queue</TableHead>
                <TableHead>Logical</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">In flight</TableHead>
                <TableHead className="text-right">Exec / min</TableHead>
                <TableHead className="text-right">Oldest ETA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queues.map((q) => {
                const oldestAge = q.oldest_eta ? (Date.now() - new Date(q.oldest_eta).getTime()) / 1000 : null;
                return (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs">{q.id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{q.logical ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={(q.tasks_count ?? 0) > 100 ? "destructive" : (q.tasks_count ?? 0) > 0 ? "secondary" : "default"}>
                        {q.tasks_count ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{q.concurrent_dispatches ?? 0}</TableCell>
                    <TableCell className="text-right">{q.executed_last_minute ?? 0}</TableCell>
                    <TableCell className="text-right text-xs">
                      {oldestAge != null ? (
                        <Badge variant={oldestAge > 300 ? "destructive" : "secondary"}>{Math.round(oldestAge)}s ago</Badge>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {queues.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No queues. Confirm Cloud Tasks backend is configured and the runtime SA has <code>roles/cloudtasks.viewer</code>.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Peek / purge are not exposed for Cloud Tasks queues from this dashboard — use <code>gcloud tasks queues purge {"<id>"}</code> in the GCP CLI if you need to flush a queue.
      </p>
    </div>
  );
}
