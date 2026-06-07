import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { opsApi } from "@/lib/opsApi";
import { AlertTriangle, Search } from "lucide-react";

type PipelineEvent = {
  id: string;
  stage: string | null;
  status: string | null;
  task_name?: string | null;
  worker_name?: string | null;
  queue_name?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PipelineResponse = {
  asset_id: string;
  asset: Record<string, unknown> | null;
  jobs: Array<Record<string, unknown>>;
  derived_files: Array<Record<string, unknown>>;
  events: PipelineEvent[];
  counts?: Record<string, number>;
  cache?: Record<string, unknown>;
};

function MutoolFailureCard({ events }: { events: PipelineEvent[] }) {
  const failures = useMemo(
    () => events.filter((e) => e.stage === "mutool_failed"),
    [events],
  );
  if (failures.length === 0) return null;

  return (
    <Card className="border-destructive/50">
      <CardHeader className="flex flex-row items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <CardTitle className="text-base text-destructive">
          MuPDF render failures · {failures.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {failures.map((evt) => {
          const meta = (evt.metadata ?? {}) as Record<string, any>;
          const missing: number[] = Array.isArray(meta.missing_pages)
            ? meta.missing_pages
            : Array.isArray(meta.missing)
              ? meta.missing
              : [];
          const cmd: string | undefined = meta.cmd || meta.command;
          const stderr: string | undefined =
            meta.stderr_tail || meta.stderr || meta.error;
          const retry = meta.retry as
            | { ok?: boolean; range?: [number, number] }
            | undefined;
          const runtime = (meta.runtime ?? {}) as Record<string, any>;
          const unexpected: string | undefined = meta.unexpected_error;
          return (
            <div
              key={evt.id}
              className="rounded border border-destructive/30 bg-destructive/5 p-3 space-y-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">mutool_failed</Badge>
                {retry?.ok === true && (
                  <Badge variant="secondary">retry succeeded</Badge>
                )}
                {retry?.ok === false && (
                  <Badge variant="destructive">retry failed</Badge>
                )}
                {runtime.K_REVISION && (
                  <Badge variant="outline">rev {String(runtime.K_REVISION)}</Badge>
                )}
                {runtime.K_SERVICE && (
                  <Badge variant="outline">{String(runtime.K_SERVICE)}</Badge>
                )}
                {evt.worker_name && (
                  <Badge variant="outline">{evt.worker_name}</Badge>
                )}
                <span className="text-muted-foreground ml-auto">
                  {evt.started_at}
                </span>
              </div>

              {evt.message && (
                <div className="font-medium">{evt.message}</div>
              )}
              {unexpected && (
                <div>
                  <span className="text-muted-foreground">Unexpected error: </span>
                  <code>{unexpected}</code>
                </div>
              )}
              {missing.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Missing pages: </span>
                  <code>{missing.join(", ")}</code>
                </div>
              )}
              {retry?.range && (
                <div>
                  <span className="text-muted-foreground">Retry range: </span>
                  <code>
                    {retry.range[0]}–{retry.range[1]}
                  </code>
                </div>
              )}
              {cmd && (
                <div>
                  <div className="text-muted-foreground">Command</div>
                  <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted p-2">
                    {cmd}
                  </pre>
                </div>
              )}
              {stderr && (
                <div>
                  <div className="text-muted-foreground">stderr (tail)</div>
                  <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted p-2 max-h-48 overflow-auto">
                    {stderr}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function PlatformDocumentCentreAssets() {
  const [assetId, setAssetId] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const pipeline = useQuery<PipelineResponse>({
    queryKey: ["ops", "asset-pipeline", submitted],
    queryFn: () => opsApi.assetPipeline(submitted!),
    enabled: !!submitted,
    refetchInterval: 5000,
  });

  const cloudLogs = useQuery({
    queryKey: ["ops", "cloud-run-logs", submitted],
    queryFn: () => opsApi.cloudRunLogs(submitted!, 120, 150),
    enabled: !!submitted,
    refetchInterval: 10000,
  });

  const events = pipeline.data?.events ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Assets</h2>
        <p className="text-sm text-muted-foreground">
          Inspect the processing pipeline for any backend asset.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asset lookup</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (assetId.trim()) setSubmitted(assetId.trim());
            }}
            className="flex gap-2"
          >
            <Input
              placeholder="Asset UUID"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            />
            <Button type="submit">
              <Search className="h-4 w-4 mr-2" />
              Inspect
            </Button>
          </form>
        </CardContent>
      </Card>

      {submitted && (
        <>
          <MutoolFailureCard events={events} />

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Pipeline · {submitted}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pipeline.isLoading && (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                )}
                {pipeline.error && (
                  <p className="text-sm text-destructive">
                    {(pipeline.error as Error).message}
                  </p>
                )}
                {pipeline.data != null && (
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[600px]">
                    {JSON.stringify(pipeline.data, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Cloud Run logs · last 2 hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cloudLogs.isLoading && (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                )}
                {cloudLogs.error && (
                  <p className="text-sm text-destructive">
                    {(cloudLogs.error as Error).message}
                  </p>
                )}
                {cloudLogs.data != null && (
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[600px]">
                    {JSON.stringify(cloudLogs.data, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
