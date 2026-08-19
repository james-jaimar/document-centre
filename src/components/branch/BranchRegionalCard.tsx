import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Globe, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Props {
  tenantId: string;
  branchId: string;
  /** Read-only view for staff who cannot manage the branch. */
  canManage?: boolean;
}

type UnitChoice = "inherit" | "metric" | "imperial";

/**
 * A branch is a locale. This card pins the measurement system (which master
 * catalogue the branch draws from) and the currencies it sells in.
 *
 * - Measurement system is absolute: an imperial branch never shows gsm/mm
 *   items, a metric branch never shows lb/inch items.
 * - Currencies: geo detection picks within the sellable list; a visitor from
 *   outside those countries gets the branch default. If only one currency is
 *   sellable the storefront picker disappears entirely.
 */
export function BranchRegionalCard({ tenantId, branchId, canManage = true }: Props) {
  const qc = useQueryClient();
  const [unit, setUnit] = useState<UnitChoice>("inherit");
  // The unit system the branch catalogue was last cloned against. Changing it
  // means every branch size / paper / finishing row is from the wrong master
  // list, so the catalogue has to be rebuilt.
  const [savedUnit, setSavedUnit] = useState<UnitChoice>("inherit");
  const [defaultCurrency, setDefaultCurrency] = useState<string>("");
  const [accepted, setAccepted] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: regions = [] } = useQuery({
    queryKey: ["platform_pricing_regions_min"],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_pricing_regions")
        .select("region_code, region_label, currency_code, currency_symbol, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["branch_regional_settings", tenantId, branchId],
    enabled: !!tenantId && !!branchId,
    queryFn: async () => {
      const [tenantRes, branchRes] = await Promise.all([
        supabase
          .from("tenant_settings")
          .select("category, setting_key, setting_value")
          .eq("tenant_id", tenantId)
          .in("category", ["financial", "regional"]),
        supabase
          .from("branch_settings" as any)
          .select("category, setting_key, setting_value")
          .eq("branch_id", branchId)
          .in("category", ["financial", "regional"]),
      ]);
      const toMap = (rows: any[] | null | undefined) => {
        const m: Record<string, unknown> = {};
        for (const r of rows ?? []) m[`${r.category}.${r.setting_key}`] = r.setting_value;
        return m;
      };
      return { tenant: toMap(tenantRes.data as any), branch: toMap(branchRes.data as any) };
    },
  });

  useEffect(() => {
    if (!data) return;
    const b = data.branch;
    const rawUnit = String(b["regional.measurement_unit"] ?? "").replace(/"/g, "").toLowerCase();
    const nextUnit: UnitChoice =
      rawUnit === "metric" || rawUnit === "imperial" ? (rawUnit as UnitChoice) : "inherit";
    setUnit(nextUnit);
    setSavedUnit(nextUnit);
    setDefaultCurrency(
      String(b["financial.default_currency_code"] ?? "").replace(/"/g, "").toUpperCase(),
    );
    const acc = b["financial.accepted_currencies"];
    setAccepted(Array.isArray(acc) ? (acc as unknown[]).map((c) => String(c).toUpperCase()) : []);
  }, [data]);

  const tenantUnit =
    String(data?.tenant?.["regional.measurement_unit"] ?? "auto").replace(/"/g, "").toLowerCase();
  const tenantCurrency =
    String(data?.tenant?.["financial.default_currency_code"] ?? "ZAR").replace(/"/g, "").toUpperCase();

  const currencies = Array.from(
    new Map(regions.map((r: any) => [r.currency_code, r])).values(),
  ) as Array<{ currency_code: string; region_label: string; currency_symbol: string }>;

  const toggleCurrency = (code: string) => {
    setAccepted((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const effectiveUnit = unit === "inherit" ? (tenantUnit === "imperial" ? "imperial" : "metric") : unit;

  const handleSave = async () => {
    setSaving(true);
    try {
      const upserts: Array<{ category: string; setting_key: string; setting_value: any; value_type: string }> = [];
      const deletes: Array<{ category: string; setting_key: string }> = [];

      if (unit === "inherit") deletes.push({ category: "regional", setting_key: "measurement_unit" });
      else
        upserts.push({
          category: "regional",
          setting_key: "measurement_unit",
          setting_value: unit,
          value_type: "string",
        });

      if (!defaultCurrency) deletes.push({ category: "financial", setting_key: "default_currency_code" });
      else
        upserts.push({
          category: "financial",
          setting_key: "default_currency_code",
          setting_value: defaultCurrency,
          value_type: "string",
        });

      const list = defaultCurrency && !accepted.includes(defaultCurrency)
        ? [defaultCurrency, ...accepted]
        : accepted;
      if (list.length === 0) deletes.push({ category: "financial", setting_key: "accepted_currencies" });
      else
        upserts.push({
          category: "financial",
          setting_key: "accepted_currencies",
          setting_value: list,
          value_type: "json",
        });

      for (const d of deletes) {
        const { error } = await supabase
          .from("branch_settings" as any)
          .delete()
          .eq("branch_id", branchId)
          .eq("category", d.category)
          .eq("setting_key", d.setting_key);
        if (error) throw error;
      }

      if (upserts.length) {
        const rows = upserts.map((u) => ({ tenant_id: tenantId, branch_id: branchId, ...u }));
        const { error } = await supabase
          .from("branch_settings" as any)
          .upsert(rows as any, { onConflict: "branch_id,category,setting_key" });
        if (error) throw error;
      }

      setAccepted(list);

      // Switching the measurement system invalidates the whole branch
      // catalogue — rebuild it from the tenant against the new master list.
      const prevEffective =
        savedUnit === "inherit" ? (tenantUnit === "imperial" ? "imperial" : "metric") : savedUnit;
      if (prevEffective !== effectiveUnit) {
        const { error: resyncError } = await supabase.rpc(
          "resync_branch_catalog_from_tenant" as any,
          { p_branch_id: branchId },
        );
        if (resyncError) {
          toast.error(`Locale saved, but the catalogue rebuild failed: ${resyncError.message}`);
        } else {
          toast.success(
            `Branch locale saved — catalogue rebuilt from the ${effectiveUnit} master list`,
          );
        }
      } else {
        toast.success("Branch locale saved");
      }
      setSavedUnit(unit);
      qc.invalidateQueries({ queryKey: ["branch_regional_settings", tenantId, branchId] });
      qc.invalidateQueries({ queryKey: ["branch_locale", branchId] });
      qc.invalidateQueries({ queryKey: ["catalog_unit_system"] });
      qc.invalidateQueries({ queryKey: ["resolve_product_options"] });
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
          <Globe size={16} /> Regional &amp; Currency
        </CardTitle>
        <CardDescription>
          This branch is a locale. The measurement system decides which master
          catalogue it draws from, and the sellable currencies decide what a
          visitor can be charged in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Measurement system</Label>
              <select
                className="h-10 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
                value={unit}
                disabled={!canManage}
                onChange={(e) => setUnit(e.target.value as UnitChoice)}
              >
                <option value="inherit">
                  Inherit from tenant ({tenantUnit === "imperial" ? "Imperial" : "Metric"})
                </option>
                <option value="metric">Metric — mm / gsm</option>
                <option value="imperial">Imperial — inches / lb</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Customers on this branch only ever see the{" "}
                <strong>{effectiveUnit === "imperial" ? "imperial" : "metric"}</strong> master
                catalogue — sizes, paper stocks and finishing. Print attributes are shared.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Default currency</Label>
              <select
                className="h-10 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
                value={defaultCurrency}
                disabled={!canManage}
                onChange={(e) => setDefaultCurrency(e.target.value)}
              >
                <option value="">Inherit from tenant ({tenantCurrency})</option>
                {currencies.map((c) => (
                  <option key={c.currency_code} value={c.currency_code}>
                    {c.currency_code} ({c.currency_symbol})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Used when the visitor's country isn't one this branch sells to.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Sellable currencies</Label>
              <div className="flex flex-wrap gap-4">
                {currencies.map((c) => {
                  const checked = accepted.includes(c.currency_code) || defaultCurrency === c.currency_code;
                  return (
                    <label key={c.currency_code} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={!canManage || defaultCurrency === c.currency_code}
                        onCheckedChange={() => toggleCurrency(c.currency_code)}
                      />
                      {c.currency_code}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Geo-detection picks within this list. Tick one currency only and
                the storefront currency picker is hidden.
              </p>
              {accepted.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {accepted.map((c) => (
                    <Badge key={c} variant="secondary">{c}</Badge>
                  ))}
                </div>
              )}
            </div>

            {canManage && (
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  <Save size={14} className="mr-1.5" /> {saving ? "Saving…" : "Save locale"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default BranchRegionalCard;
