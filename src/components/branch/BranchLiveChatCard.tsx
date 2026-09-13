import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MessageSquare, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  chatEmbedSrc,
  isValidPropertyId,
  isValidWidgetId,
  parseChatPaste,
  unwrapSetting,
} from "@/lib/liveChat";

interface Props {
  tenantId: string;
  branchId: string;
  canManage?: boolean;
}

const CATEGORY = "integrations";

/**
 * Per-branch Tawk.to live chat. Each branch talks to its own customers, so
 * the widget belongs here rather than on the tenant. Leaving this off falls
 * back to the tenant-wide default (Tenant Settings → General).
 */
export function BranchLiveChatCard({ tenantId, branchId, canManage = true }: Props) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [widgetId, setWidgetId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["branch_live_chat_settings", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const [branchRes, tenantRes] = await Promise.all([
        supabase
          .from("branch_settings" as any)
          .select("setting_key, setting_value")
          .eq("branch_id", branchId)
          .eq("category", CATEGORY),
        supabase
          .from("tenant_settings")
          .select("setting_key, setting_value")
          .eq("tenant_id", tenantId)
          .eq("category", CATEGORY),
      ]);
      const toMap = (rows: any[] | null | undefined) => {
        const m: Record<string, unknown> = {};
        for (const r of rows ?? []) m[r.setting_key] = r.setting_value;
        return m;
      };
      return { branch: toMap(branchRes.data as any), tenant: toMap(tenantRes.data as any) };
    },
  });

  useEffect(() => {
    if (!data) return;
    const b = data.branch;
    setEnabled(b.tawk_enabled === true);
    setPropertyId(unwrapSetting(b.tawk_property_id));
    setWidgetId(unwrapSetting(b.tawk_widget_id));
  }, [data]);

  const tenantProperty = unwrapSetting(data?.tenant?.tawk_property_id);
  const tenantWidget = unwrapSetting(data?.tenant?.tawk_widget_id);
  const tenantSrc = data?.tenant?.tawk_enabled === true
    ? chatEmbedSrc({ propertyId: tenantProperty, widgetId: tenantWidget })
    : null;

  const handlePaste = (value: string) => {
    const parsed = parseChatPaste(value);
    if (parsed.propertyId) setPropertyId(parsed.propertyId);
    if (parsed.widgetId) setWidgetId(parsed.widgetId);
    else setPropertyId(value.trim());
  };

  const propertyOk = !propertyId || isValidPropertyId(propertyId);
  const widgetOk = !widgetId || isValidWidgetId(widgetId);
  const src = chatEmbedSrc({ propertyId, widgetId });
  const incomplete = enabled && !src;

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = [
        { setting_key: "tawk_enabled", setting_value: enabled as any, value_type: "boolean" },
        { setting_key: "tawk_property_id", setting_value: propertyId as any, value_type: "string" },
        { setting_key: "tawk_widget_id", setting_value: widgetId as any, value_type: "string" },
      ].map((r) => ({ tenant_id: tenantId, branch_id: branchId, category: CATEGORY, ...r }));
      const { error } = await supabase
        .from("branch_settings" as any)
        .upsert(rows as any, { onConflict: "branch_id,category,setting_key" });
      if (error) throw error;
      toast.success("Live chat settings saved");
      qc.invalidateQueries({ queryKey: ["branch_live_chat_settings", branchId] });
      qc.invalidateQueries({ queryKey: ["live-chat-settings"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare size={16} /> Live Chat (Tawk.to)
        </CardTitle>
        <CardDescription>
          Live chat for this branch's own customers. Use your own free{" "}
          <a
            href="https://www.tawk.to"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary"
          >
            tawk.to
          </a>{" "}
          account so conversations land in your inbox, not head office's.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor="branch-tawk-enabled">Enable live chat for this branch</Label>
              <Switch
                id="branch-tawk-enabled"
                checked={enabled}
                disabled={!canManage}
                onCheckedChange={setEnabled}
              />
            </div>

            {!enabled && (
              <p className="text-xs text-muted-foreground">
                {data && Object.keys(data.branch).length === 0 && tenantSrc
                  ? "Not set up here — customers on this branch see the head-office chat widget."
                  : "Off — no chat widget is shown to customers on this branch, even if head office has one."}
              </p>
            )}

            {enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="branch-tawk-paste">Paste your Direct Chat Link</Label>
                  <Input
                    id="branch-tawk-paste"
                    placeholder="https://embed.tawk.to/60a1b2c3d4e5f6001c7g8h9i/1abc2defg"
                    disabled={!canManage}
                    onChange={(e) => handlePaste(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tawk.to Dashboard → Administration → Chat Widget → Direct Chat Link.
                    Pasting it here fills both fields below automatically.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="branch-tawk-property">Property ID</Label>
                    <Input
                      id="branch-tawk-property"
                      value={propertyId}
                      disabled={!canManage}
                      onChange={(e) => setPropertyId(e.target.value.trim())}
                      placeholder="60a1b2c3d4e5f6001c7g8h9i"
                    />
                    {!propertyOk && (
                      <p className="text-xs text-destructive">
                        That doesn't look like a property ID (24 characters, letters and numbers).
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="branch-tawk-widget">Widget ID</Label>
                    <Input
                      id="branch-tawk-widget"
                      value={widgetId}
                      disabled={!canManage}
                      onChange={(e) => setWidgetId(e.target.value.trim())}
                      placeholder="1abc2defg"
                    />
                    {!widgetOk && (
                      <p className="text-xs text-destructive">
                        That doesn't look like a widget ID (the short code after the last slash).
                      </p>
                    )}
                  </div>
                </div>

                {incomplete ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                    Both parts are needed before the chat bubble will appear. Copy the whole
                    Direct Chat Link and paste it above.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground break-all">
                    Widget: <code>{src}</code>
                  </p>
                )}
              </>
            )}

            {canManage && (
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  <Save size={14} className="mr-1.5" /> {saving ? "Saving…" : "Save live chat"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default BranchLiveChatCard;
