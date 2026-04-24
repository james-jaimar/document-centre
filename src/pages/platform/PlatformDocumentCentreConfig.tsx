import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { opsApi } from "@/lib/opsApi";

export default function PlatformDocumentCentreConfig() {
  const config = useQuery({ queryKey: ["ops", "config"], queryFn: opsApi.config });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Config</h2>
        <p className="text-sm text-muted-foreground">Effective server configuration. Sensitive values are masked.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Server config</CardTitle></CardHeader>
        <CardContent>
          {config.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {config.error && <p className="text-sm text-destructive">{(config.error as Error).message}</p>}
          {config.data && (
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[600px]">
              {JSON.stringify(config.data, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
