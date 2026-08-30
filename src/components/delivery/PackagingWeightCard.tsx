/**
 * Packaging & billable-weight rules. Branch values override tenant values;
 * blank means "inherit". These feed the courier weight bands, so they change
 * what customers are charged for delivery.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Package, Save } from "lucide-react";
import { DEFAULT_WEIGHT_SETTINGS } from "@/lib/weight/resolveItemWeight";
import { WEIGHT_SETTINGS_CATEGORY, WEIGHT_SETTING_KEYS } from "@/hooks/useWeightSettings";

interface Props {
  tenantId: string;
  /** Omit for the tenant-level card. */
  branchId?: string | null;
}

type FieldKey = keyof typeof WEIGHT_SETTING_KEYS;

const FIELDS: Array<{
  key: FieldKey;
  label: string;
  hint: string;
  step: string;
}> = [
  { key: "packagingGrams", label: "Packaging (g per parcel)", hint: "Bag, sleeve or box weight added once per item.", step: "1" },
  { key: "packagingPct", label: "Handling uplift (%)", hint: "Percentage added on top of the physical weight.", step: "0.5" },
  { key: "minBillableKg", label: "Minimum billable (kg)", hint: "Couriers charge a floor even for tiny parcels.", step: "0.1" },
  { key: "volumetricDivisor", label: "Volumetric divisor", hint: "L×W×H in cm ÷ this. 5000 is the industry norm.", step: "100" },
];

export default function PackagingWeightCard({ tenantId, branchId }: Props) {
  const qc = useQueryClient();
  const scope = branchId ? "branch" : "tenant";
  const [form, setForm] = useState<Record<FieldKey, string>>({
    packagingGrams: "",
    packagingPct: "",
    minBillableKg: "",
    volumetricDivisor: "",
  });
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["packaging_weight_settings", tenantId, branchId ?? null],
    enabled: !!tenantId,
    queryFn: async () => {
      const [tenantRes, branchRes] = await Promise.all([
        supabase
          .from("tenant_settings")
          .select("setting_key, setting_value")
          .eq("tenant_id", tenantId)
          .eq("category", WEIGHT_SETTINGS_CATEGORY),
        branchId
          ? supabase
              .from("branch_settings" as any)
              .select("setting_key, setting_value")
              .eq("branch_id", branchId)
              .eq("category", WEIGHT_SETTINGS_CATEGORY)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const toMap = (rows: any[] | null | undefined) => {
        const m: Record<string, unknown> = {};
        for (const r of rows ?? []) m[r.setting_key] = r.setting_value;
        return m;
      };
      return { tenant: toMap(tenantRes.data as any), branch: toMap((branchRes as any).data) };
    },
  });

  useEffect(() => {
    if (!data) return;
    const own = branchId ? data.branch : data.tenant;
    const next = {} as Record<FieldKey, string>;
    for (const f of FIELDS) {
      const raw = own[WEIGHT_SETTING_KEYS[f.key]];
      next[f.key] = raw === undefined || raw === null ? "" : String(raw);
    }
    setForm(next);
  }, [data, branchId]);

  const inherited = (key: FieldKey): number => {
    const tenantVal = data?.tenant?.[WEIGHT_SETTING_KEYS[key]];
    const n = Number(tenantVal);
    if (branchId && Number.isFinite(n)) return n;
    return Number.isFinite(n) && !branchId ? n : DEFAULT_WEIGHT_SETTINGS[key];
  };

  async function handleSave() {
    setSaving(true);
    try {
      const upserts: any[] = [];
      const deletes: string[] = [];
      for (const f of FIELDS) {
        const key = WEIGHT_SETTING_KEYS[f.key];
        const raw = form[f.key].trim();
        if (raw === "") {
          deletes.push(key);
          continue;
        }
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
          throw new Error(`${f.label} must be a positive number`);
        }
        upserts.push({ setting_key: key, setting_value: value, value_type: "number" });
      }

      const table = branchId ? "branch_settings" : "tenant_settings";
      const scopeFilter = (q: any) =>
        branchId ? q.eq("branch_id", branchId) : q.eq("tenant_id", tenantId).is("branch_id", null);

      if (deletes.length) {
        let q = (supabase as any).from(table).delete().eq("category", WEIGHT_SETTINGS_CATEGORY);
        q = branchId ? q.eq("branch_id", branchId) : q.eq("tenant_id", tenantId);
        const { error } = await q.in("setting_key", deletes);
        if (error) throw error;
      }

      if (upserts.length) {
        const rows = upserts.map((u) => ({
          tenant_id: tenantId,
          ...(branchId ? { branch_id: branchId } : {}),
          category: WEIGHT_SETTINGS_CATEGORY,
          ...u,
        }));
        const { error } = await (supabase as any)
          .from(table)
          .upsert(rows, {
            onConflict: branchId
              ? "branch_id,category,setting_key"
              : "tenant_id,category,setting_key",
          });
        if (error) throw error;
      }

      void scopeFilter;
      toast.success("Packaging rules saved");
      qc.invalidateQueries({ queryKey: ["packaging_weight_settings"] });
      qc.invalidateQueries({ queryKey: ["weight_settings"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package size={16} /> Packaging &amp; billable weight
        </CardTitle>
        <CardDescription>
          These rules turn a job's paper weight into the weight the courier bands are
          matched against.{" "}
          {scope === "branch"
            ? "Leave a field blank to inherit the tenant value."
            : "Leave a field blank to use the platform default."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={f.step}
                    value={form[f.key]}
                    placeholder={`Inherit (${inherited(f.key)})`}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">{f.hint}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Save size={14} className="mr-1.5" />
                {saving ? "Saving…" : "Save packaging rules"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
