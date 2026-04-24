import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { opsApi } from "@/lib/opsApi";
import { Search } from "lucide-react";

export default function PlatformDocumentCentreAssets() {
  const [assetId, setAssetId] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const pipeline = useQuery({
    queryKey: ["ops", "asset-pipeline", submitted],
    queryFn: () => opsApi.assetPipeline(submitted!),
    enabled: !!submitted,
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Assets</h2>
        <p className="text-sm text-muted-foreground">Inspect the processing pipeline for any backend asset.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Asset lookup</CardTitle></CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); if (assetId.trim()) setSubmitted(assetId.trim()); }}
            className="flex gap-2"
          >
            <Input placeholder="Asset UUID" value={assetId} onChange={(e) => setAssetId(e.target.value)} />
            <Button type="submit"><Search className="h-4 w-4 mr-2" />Inspect</Button>
          </form>
        </CardContent>
      </Card>

      {submitted && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline · {submitted}</CardTitle>
          </CardHeader>
          <CardContent>
            {pipeline.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {pipeline.error && <p className="text-sm text-destructive">{(pipeline.error as Error).message}</p>}
            {pipeline.data != null && (
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[600px]">
                {JSON.stringify(pipeline.data, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
