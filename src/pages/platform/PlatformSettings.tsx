import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

const PlatformSettings = () => {
  const [wiping, setWiping] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const handleWipe = async () => {
    if (!confirm("This will permanently delete ALL files from Supabase Storage buckets. Continue?")) return;
    setWiping(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("wipe-storage", { body: {} });
      if (error) throw error;
      setResult(data);
      toast.success("Storage wipe completed");
    } catch (e) {
      toast.error((e as Error).message);
      setResult({ error: (e as Error).message });
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Platform Settings</h1>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Danger Zone — Wipe Supabase Storage
          </CardTitle>
          <CardDescription>
            Permanently deletes every object from <code>document-uploads</code>, <code>documents</code>,{" "}
            <code>previews</code>, <code>proofs</code>, <code>uploads</code> and <code>assets</code> buckets.
            New uploads now go to S3, so Supabase storage should stay near-empty.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="destructive" onClick={handleWipe} disabled={wiping}>
            {wiping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {wiping ? "Wiping…" : "Wipe all storage buckets"}
          </Button>
          {result ? (
            <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default PlatformSettings;
