import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Receipt, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Props {
  tenantId: string;
  branchId: string;
}

type TriState = "inherit" | "on" | "off";

interface FormState {
  enabled: TriState;
  rate: string; // empty = inherit
  inclusive: TriState;
  label: string; // empty = inherit
}

/**
 * Per-branch override for VAT/tax settings. Empty / "Inherit" leaves the
 * tenant default in force. Setting any value writes a `branch_settings` row
 * that overrides the matching tenant setting for that branch's orders.
 */
export function BranchTaxCard({ tenantId, branchId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>({
    enabled: "inherit",
    rate: "",
    inclusive: "inherit",
    label: "",
  });
  const [saving, setSaving] = useState(false);

  // Load current branch + tenant values so we can show the effective config.
  const { data, isLoading } = useQuery({
    queryKey: ["branch_tax_settings", tenantId, branchId],
    queryFn: async () => {
      const [tenantRes, branchRes] = await Promise.all([
        supabase
          .from("tenant_settings")
          .select("setting_key, setting_value")
          .eq("tenant_id", tenantId)
          .eq("category", "financial"),
        supabase
          .from("branch_settings" as any)
          .select("setting_key, setting_value")
          .eq("branch_id", branchId)
          .eq("category", "financial"),
      ]);
      const toMap = (rows: any[] | null | undefined) => {
        const m: Record<string, unknown> = {};
        for (const r of rows ?? []) m[r.setting_key] = r.setting_value;
        return m;
      };
      return { tenant: toMap(tenantRes.data as any), branch: toMap(branchRes.data as any) };
    },
    enabled: !!tenantId && !!branchId,
  });

  useEffect(() => {
    if (!data) return;
    const b = data.branch;
    setForm({
      enabled:
        b.tax_enabled === true ? "on" : b.tax_enabled === false ? "off" : "inherit",
      rate: b.tax_rate !== undefined && b.tax_rate !== null ? String(b.tax_rate) : "",
      inclusive:
        b.tax_inclusive === true ? "on" : b.tax_inclusive === false ? "off" : "inherit",
      label: (b.tax_label as string) ?? "",
    });
  }, [data]);

  const tenant = data?.tenant ?? {};
  const tenantRate = Number(tenant.tax_rate ?? 15);
  const tenantEnabled =
    tenant.tax_enabled === undefined ? tenantRate > 0 : tenant.tax_enabled === true;
  const tenantLabel = (tenant.tax_label as string) ?? "VAT";
  const tenantInclusive = tenant.tax_inclusive === true;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build the list of rows to upsert AND the keys to delete (inherit).
      const upserts: Array<{ setting_key: string; setting_value: any; value_type: string }> = [];
      const deletes: string[] = [];

      if (form.enabled === "inherit") deletes.push("tax_enabled");
      else upserts.push({ setting_key: "tax_enabled", setting_value: form.enabled === "on", value_type: "boolean" });

      if (form.rate === "") deletes.push("tax_rate");
      else upserts.push({ setting_key: "tax_rate", setting_value: parseFloat(form.rate), value_type: "number" });

      if (form.inclusive === "inherit") deletes.push("tax_inclusive");
      else upserts.push({ setting_key: "tax_inclusive", setting_value: form.inclusive === "on", value_type: "boolean" });

      if (form.label.trim() === "") deletes.push("tax_label");
      else upserts.push({ setting_key: "tax_label", setting_value: form.label.trim(), value_type: "string" });

      if (deletes.length) {
        const { error } = await supabase
          .from("branch_settings" as any)
          .delete()
          .eq("branch_id", branchId)
          .eq("category", "financial")
          .in("setting_key", deletes);
        if (error) throw error;
      }

      if (upserts.length) {
        const rows = upserts.map((u) => ({
          tenant_id: tenantId,
          branch_id: branchId,
          category: "financial",
          ...u,
        }));
        const { error } = await supabase
          .from("branch_settings" as any)
          .upsert(rows as any, { onConflict: "branch_id,category,setting_key" });
        if (error) throw error;
      }

      toast.success("Branch tax settings saved");
      qc.invalidateQueries({ queryKey: ["branch_tax_settings", tenantId, branchId] });
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
          <Receipt size={16} /> Tax / VAT Override
        </CardTitle>
        <CardDescription>
          Override tenant-wide tax settings for this branch only. Leave a field
          on <em>Inherit</em> to use the tenant default
          ({tenantEnabled ? `${tenantLabel} ${tenantRate}%${tenantInclusive ? " incl." : " excl."}` : "tax disabled"}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label>Charge tax</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.value as TriState }))}
                >
                  <option value="inherit">Inherit ({tenantEnabled ? "On" : "Off"})</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Rate (%)</Label>
                <Input
                  type="number"
                  value={form.rate}
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                  placeholder={`Inherit (${tenantRate})`}
                  disabled={form.enabled === "off"}
                />
              </div>
              <div className="space-y-2">
                <Label>Pricing</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.inclusive}
                  onChange={(e) => setForm((f) => ({ ...f, inclusive: e.target.value as TriState }))}
                  disabled={form.enabled === "off"}
                >
                  <option value="inherit">Inherit ({tenantInclusive ? "Inclusive" : "Exclusive"})</option>
                  <option value="off">Exclusive (add on top)</option>
                  <option value="on">Inclusive (built in)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder={`Inherit (${tenantLabel})`}
                  disabled={form.enabled === "off"}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Save size={14} className="mr-1.5" /> {saving ? "Saving…" : "Save tax settings"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
