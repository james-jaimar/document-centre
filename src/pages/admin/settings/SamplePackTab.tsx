import { useEffect, useMemo, useState } from "react";
import {
  useTenantSettingsMap,
  useBulkUpsertTenantSettings,
} from "@/hooks/useTenantSettings";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import {
  SAMPLE_PACK_CATEGORY,
  SAMPLE_PACK_DEFAULTS,
  parseSamplePackConfig,
} from "@/lib/samplePack/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

/**
 * Sample packs: one of each chosen product, personalised by the customer and
 * delivered for a single flat price. Trade-facing taster offer.
 */
export function SamplePackTab() {
  const { tenantId } = useTenantContext();
  const { settingsMap, isLoading } = useTenantSettingsMap(SAMPLE_PACK_CATEGORY);
  const bulkSave = useBulkUpsertTenantSettings();
  const { data: families, isLoading: familiesLoading } = useProductFamilies(tenantId);

  const [enabled, setEnabled] = useState(SAMPLE_PACK_DEFAULTS.enabled);
  const [price, setPrice] = useState<number>(SAMPLE_PACK_DEFAULTS.price);
  const [familyIds, setFamilyIds] = useState<string[]>([]);
  const [tradeOnly, setTradeOnly] = useState(SAMPLE_PACK_DEFAULTS.tradeOnly);
  const [onePerCompany, setOnePerCompany] = useState(SAMPLE_PACK_DEFAULTS.onePerCompany);
  const [headline, setHeadline] = useState(SAMPLE_PACK_DEFAULTS.headline);
  const [blurb, setBlurb] = useState(SAMPLE_PACK_DEFAULTS.blurb);

  useEffect(() => {
    if (isLoading) return;
    const cfg = parseSamplePackConfig(settingsMap);
    setEnabled(cfg.enabled);
    setPrice(cfg.price);
    setFamilyIds(cfg.familyIds);
    setTradeOnly(cfg.tradeOnly);
    setOnePerCompany(cfg.onePerCompany);
    setHeadline(cfg.headline);
    setBlurb(cfg.blurb);
  }, [isLoading, settingsMap]);

  const activeFamilies = useMemo(
    () => (families ?? []).filter((f: any) => f.is_active !== false),
    [families],
  );

  const toggleFamily = (id: string) =>
    setFamilyIds((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));

  const save = async () => {
    if (enabled && familyIds.length === 0) {
      toast.error("Choose at least one product for the pack");
      return;
    }
    try {
      await bulkSave.mutateAsync([
        { category: SAMPLE_PACK_CATEGORY, setting_key: "enabled", setting_value: enabled, value_type: "boolean" },
        { category: SAMPLE_PACK_CATEGORY, setting_key: "price", setting_value: Number(price) || 0, value_type: "number" },
        { category: SAMPLE_PACK_CATEGORY, setting_key: "family_ids", setting_value: familyIds, value_type: "json" },
        { category: SAMPLE_PACK_CATEGORY, setting_key: "trade_only", setting_value: tradeOnly, value_type: "boolean" },
        { category: SAMPLE_PACK_CATEGORY, setting_key: "one_per_company", setting_value: onePerCompany, value_type: "boolean" },
        { category: SAMPLE_PACK_CATEGORY, setting_key: "headline", setting_value: headline, value_type: "string" },
        { category: SAMPLE_PACK_CATEGORY, setting_key: "blurb", setting_value: blurb, value_type: "string" },
      ]);
      toast.success("Sample pack settings saved");
    } catch (e: any) {
      toast.error("Failed to save", { description: e.message });
    }
  };

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sample pack</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <Label htmlFor="sp-enabled" className="text-base">Offer a sample pack</Label>
              <p className="text-sm text-muted-foreground">
                Customers build one of each chosen product and pay a single flat price.
              </p>
            </div>
            <Switch id="sp-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div>
            <Label htmlFor="sp-price">Pack price (delivery included)</Label>
            <Input
              id="sp-price"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="max-w-xs"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Entered excluding VAT, the same as every other price. Delivery is never charged on a
              sample pack.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label htmlFor="sp-trade">Trade accounts only</Label>
                <p className="text-xs text-muted-foreground">Hide the offer from everyone else.</p>
              </div>
              <Switch id="sp-trade" checked={tradeOnly} onCheckedChange={setTradeOnly} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <Label htmlFor="sp-once">One pack per business</Label>
                <p className="text-xs text-muted-foreground">
                  You can allow extra packs on a business's own page.
                </p>
              </div>
              <Switch id="sp-once" checked={onePerCompany} onCheckedChange={setOnePerCompany} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What's in the pack</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pick the products included. The customer personalises one of each before they can check
            out.
          </p>
          {familiesLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeFamilies.map((f: any) => (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <Checkbox
                    checked={familyIds.includes(f.id)}
                    onCheckedChange={() => toggleFamily(f.id)}
                  />
                  <span className="text-foreground">{f.name}</span>
                </label>
              ))}
            </div>
          )}
          {familyIds.length > 0 && (
            <p className="text-xs text-muted-foreground">{familyIds.length} product(s) selected.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What customers see</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="sp-headline">Headline</Label>
            <Input id="sp-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sp-blurb">Wording</Label>
            <Textarea id="sp-blurb" rows={3} value={blurb} onChange={(e) => setBlurb(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={bulkSave.isPending}>
        {bulkSave.isPending ? "Saving…" : "Save Settings"}
      </Button>
    </div>
  );
}
