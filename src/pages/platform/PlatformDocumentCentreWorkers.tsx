import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { opsApi } from "@/lib/opsApi";
import { toast } from "sonner";
import { Plus, Minus, Power, RefreshCw } from "lucide-react";

export default function PlatformDocumentCentreWorkers() {
  const qc = useQueryClient();
  const workers = useQuery({ queryKey: ["ops", "workers"], queryFn: opsApi.workers, refetchInterval: 15000, refetchIntervalInBackground: false });

  const ping = useMutation({
    mutationFn: opsApi.pingWorkers,
    onSuccess: () => { toast.success("Ping sent"); qc.invalidateQueries({ queryKey: ["ops", "workers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const grow = useMutation({
    mutationFn: ({ name, n }: { name: string; n: number }) => opsApi.poolGrow(name, n),
    onSuccess: () => { toast.success("Pool grown"); qc.invalidateQueries({ queryKey: ["ops", "workers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const shrink = useMutation({
    mutationFn: ({ name, n }: { name: string; n: number }) => opsApi.poolShrink(name, n),
    onSuccess: () => { toast.success("Pool shrunk"); qc.invalidateQueries({ queryKey: ["ops", "workers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const shutdown = useMutation({
    mutationFn: (name: string) => opsApi.shutdownWorker(name),
    onSuccess: () => { toast.success("Worker shutdown signal sent"); qc.invalidateQueries({ queryKey: ["ops", "workers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Workers</h2>
          <p className="text-sm text-muted-foreground">Celery worker pools — pool size, queues, status.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => ping.mutate()} disabled={ping.isPending}>
            <RefreshCw className="h-4 w-4 mr-2" /> Ping all
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Pool</TableHead>
                <TableHead>Queues</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.data?.map((w) => (
                <TableRow key={w.name}>
                  <TableCell className="font-mono text-xs">{w.name}</TableCell>
                  <TableCell>
                    <Badge variant={w.status === "online" ? "default" : "destructive"}>{w.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{w.active}</TableCell>
                  <TableCell className="text-right">{w.pool_size}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {w.queues.map((q) => <Badge key={q} variant="secondary" className="text-xs">{q}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => grow.mutate({ name: w.name, n: 1 })}>
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => shrink.mutate({ name: w.name, n: 1 })}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm(`Shutdown ${w.name}? Active tasks will be drained.`)) shutdown.mutate(w.name);
                    }} className="text-destructive">
                      <Power className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {workers.data?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No workers online</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
