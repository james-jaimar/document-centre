import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { opsApi } from "@/lib/opsApi";
import { toast } from "sonner";
import { Eye, Trash2, RefreshCw } from "lucide-react";

export default function PlatformDocumentCentreQueues() {
  const qc = useQueryClient();
  const queues = useQuery({ queryKey: ["ops", "queues"], queryFn: opsApi.queues, refetchInterval: 15000, refetchIntervalInBackground: false });
  const [peekName, setPeekName] = useState<string | null>(null);
  const [purgeName, setPurgeName] = useState<string | null>(null);

  const peek = useQuery({
    queryKey: ["ops", "queue-peek", peekName],
    queryFn: () => opsApi.peekQueue(peekName!, 25),
    enabled: !!peekName,
  });

  const purge = useMutation({
    mutationFn: (name: string) => opsApi.purgeQueue(name),
    onSuccess: (data, name) => {
      toast.success(`Purged ${data.purged} messages from ${name}`);
      qc.invalidateQueries({ queryKey: ["ops", "queues"] });
      setPurgeName(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Queues</h2>
          <p className="text-sm text-muted-foreground">Live depth, consumers and throughput per queue.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => queues.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead className="text-right">Depth</TableHead>
                <TableHead className="text-right">Consumers</TableHead>
                <TableHead className="text-right">Rate / min</TableHead>
                <TableHead className="text-right">Oldest age</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queues.data?.map((q) => (
                <TableRow key={q.name}>
                  <TableCell className="font-mono">{q.name}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={q.depth > 100 ? "destructive" : q.depth > 0 ? "secondary" : "default"}>
                      {q.depth}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{q.consumers}</TableCell>
                  <TableCell className="text-right">{q.rate_per_min?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell className="text-right">{q.oldest_age_s != null ? `${q.oldest_age_s}s` : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setPeekName(q.name)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPurgeName(q.name)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {queues.data?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No queues</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {peekName && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Peek: {peekName}</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setPeekName(null)}>Close</Button>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
              {peek.isLoading ? "Loading…" : JSON.stringify(peek.data ?? [], null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!purgeName} onOpenChange={(o) => !o && setPurgeName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge queue {purgeName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard ALL pending messages in <code>{purgeName}</code>. Running tasks are unaffected. This action is audited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => purgeName && purge.mutate(purgeName)} className="bg-destructive text-destructive-foreground">
              Purge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
