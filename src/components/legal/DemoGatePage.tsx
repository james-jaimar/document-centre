import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { DemoGateConfig } from "@/hooks/useDemoGate";

interface Props {
  tenantId: string;
  tenantName?: string | null;
  config: DemoGateConfig;
  onUnlock: (expires_at: number) => void;
}

export default function DemoGatePage({ tenantId, tenantName, config, onUnlock }: Props) {
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) {
      toast.error("Please accept the disclaimer to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("demo-gate-unlock", {
        body: { tenant_id: tenantId, password },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Incorrect password");
      onUnlock(data.expires_at as number);
      toast.success("Welcome — demo unlocked.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not unlock");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">{config.headline}</CardTitle>
          {tenantName && (
            <CardDescription>
              You are viewing a private preview of <strong>{tenantName}</strong>.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {config.disclaimer_html && (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: config.disclaimer_html }}
            />
          )}

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="demo-password">Access password</Label>
              <Input
                id="demo-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                required
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={accepted}
                onCheckedChange={(v) => setAccepted(!!v)}
                className="mt-0.5"
              />
              <span>
                I understand this is a concept demonstration and not a live commercial
                service.
              </span>
            </label>
            <Button type="submit" disabled={submitting || !password} className="w-full">
              {submitting ? "Unlocking…" : "Enter demo"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
