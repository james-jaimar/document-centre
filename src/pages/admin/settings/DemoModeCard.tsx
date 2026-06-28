import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";

interface GateRow {
  tenant_id: string;
  enabled: boolean;
  headline: string;
  disclaimer_html: string;
  cookie_days: number;
  password_hash: string | null;
}

export function DemoModeCard() {
  const { tenantId } = useTenantContext();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["demo-gate-admin", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<GateRow | null> => {
      const { data, error } = await supabase
        .from("tenant_demo_gate")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as GateRow | null;
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [headline, setHeadline] = useState("Concept Demo");
  const [disclaimer, setDisclaimer] = useState("");
  const [cookieDays, setCookieDays] = useState(30);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    setEnabled(!!data?.enabled);
    setHeadline(data?.headline ?? "Concept Demo");
    setDisclaimer(data?.disclaimer_html ?? "");
    setCookieDays(data?.cookie_days ?? 30);
  }, [isLoading, data]);

  const hasPassword = !!data?.password_hash;

  const saveSettings = async () => {
    if (!tenantId) return;
    if (enabled && !hasPassword && !newPassword) {
      toast.error("Set a password before enabling the gate.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tenant_demo_gate")
        .upsert(
          {
            tenant_id: tenantId,
            enabled,
            headline,
            disclaimer_html: disclaimer,
            cookie_days: Math.max(1, Math.min(365, cookieDays || 30)),
          },
          { onConflict: "tenant_id" },
        );
      if (error) throw error;
      toast.success("Demo gate saved");
      qc.invalidateQueries({ queryKey: ["demo-gate-admin", tenantId] });
      qc.invalidateQueries({ queryKey: ["demo-gate-config", tenantId] });
    } catch (e: any) {
      setEnabled(!!data?.enabled);
      setHeadline(data?.headline ?? "Concept Demo");
      setDisclaimer(data?.disclaimer_html ?? "");
      setCookieDays(data?.cookie_days ?? 30);
      toast.error("Save failed", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (!tenantId || !newPassword) return;
    if (newPassword.length < 4) {
      toast.error("Password must be at least 4 characters.");
      return;
    }
    setSavingPwd(true);
    try {
      const { data, error } = await supabase.functions.invoke("demo-gate-set-password", {
        body: { tenant_id: tenantId, password: newPassword },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Failed");
      setNewPassword("");
      toast.success("Password updated");
      qc.invalidateQueries({ queryKey: ["demo-gate-admin", tenantId] });
      qc.invalidateQueries({ queryKey: ["demo-gate-config", tenantId] });
    } catch (e: any) {
      toast.error("Could not update password", { description: e.message });
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> Demo Mode (private preview gate)
          </CardTitle>
          <CardDescription>
            Hide this tenant's storefront and customer portal behind a shared
            password and a legal disclaimer. Platform admins and your own staff
            always bypass.
          </CardDescription>
        </div>
        <Badge variant={enabled ? "default" : "secondary"} className="shrink-0">
          {enabled ? "Active" : "Off"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Enable demo gate</div>
            <div className="text-xs text-muted-foreground">
              When on, visitors hit a password screen before any /t/{"<slug>"} route.
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="headline">Headline</Label>
            <Input
              id="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Concept Demo — Not Affiliated"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cookieDays">Remember unlock for (days)</Label>
            <Input
              id="cookieDays"
              type="number"
              min={1}
              max={365}
              value={cookieDays}
              onChange={(e) => setCookieDays(parseInt(e.target.value || "30", 10))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Disclaimer copy (shown above the password field)</Label>
          <RichTextEditor value={disclaimer} onChange={setDisclaimer} />
        </div>

        <div className="flex gap-2">
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? "Saving…" : "Save demo settings"}
          </Button>
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Access password</div>
              <div className="text-xs text-muted-foreground">
                {hasPassword
                  ? "A password is set. Enter a new one below to replace it."
                  : "No password set yet — set one before enabling the gate."}
              </div>
            </div>
            {hasPassword && <Badge variant="secondary">Set</Badge>}
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={hasPassword ? "New password" : "Set a password"}
              autoComplete="new-password"
            />
            <Button onClick={savePassword} disabled={!newPassword || savingPwd}>
              {savingPwd ? "Saving…" : hasPassword ? "Replace" : "Set password"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
