import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Save, Plus, Trash2 } from "lucide-react";

interface Region {
  id: string;
  region_code: string;
  region_label: string;
  currency_code: string;
  currency_symbol: string;
  country_codes: string[];
  tax_note: string | null;
  is_default: boolean;
  sort_order: number;
}

interface Plan {
  id: string;
  region_id: string;
  plan_slug: string;
  plan_name: string;
  price: number;
  sort_order: number;
  stripe_price_id: string | null;
}

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸", UK: "🇬🇧", EU: "🇪🇺", AU: "🇦🇺", ZA: "🇿🇦",
};

export default function PlatformPricingRegions() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("platform_pricing_regions").select("*").order("sort_order"),
      supabase.from("platform_pricing_plans").select("*").order("sort_order"),
    ]);
    setRegions((r as Region[]) || []);
    setPlans((p as Plan[]) || []);
    setLoading(false);
  }

  function getPlanPrice(regionId: string, slug: string): string {
    const p = plans.find((pl) => pl.region_id === regionId && pl.plan_slug === slug);
    return p ? String(p.price) : "";
  }

  function setPlanPrice(regionId: string, slug: string, value: string) {
    setPlans((prev) => {
      const idx = prev.findIndex((p) => p.region_id === regionId && p.plan_slug === slug);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], price: parseFloat(value) || 0 };
        return updated;
      }
      return prev;
    });
  }

  function getPlanStripePriceId(regionId: string, slug: string): string {
    const p = plans.find((pl) => pl.region_id === regionId && pl.plan_slug === slug);
    return p?.stripe_price_id || "";
  }

  function setPlanStripePriceId(regionId: string, slug: string, value: string) {
    setPlans((prev) => {
      const idx = prev.findIndex((p) => p.region_id === regionId && p.plan_slug === slug);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], stripe_price_id: value || null };
        return updated;
      }
      return prev;
    });
  }

  function updateRegionField(id: string, field: keyof Region, value: any) {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function saveAll() {
    setSaving(true);
    try {
      // Update regions
      for (const r of regions) {
        await supabase.from("platform_pricing_regions").update({
          region_label: r.region_label,
          currency_code: r.currency_code,
          currency_symbol: r.currency_symbol,
          country_codes: r.country_codes,
          tax_note: r.tax_note,
          is_default: r.is_default,
          sort_order: r.sort_order,
        }).eq("id", r.id);
      }

      // Update plans
      for (const p of plans) {
        await supabase.from("platform_pricing_plans").update({
          price: p.price,
          plan_name: p.plan_name,
        }).eq("id", p.id);
      }

      toast.success("Pricing regions saved");
    } catch (e) {
      toast.error("Failed to save");
    }
    setSaving(false);
  }

  const planSlugs = ["starter", "core", "multi_branch"];

  if (loading) return <div className="p-8 text-muted-foreground">Loading pricing regions…</div>;

  return (
    <div className="p-6 max-w-6xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pricing Regions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage regional pricing for the public pricing page
          </p>
        </div>
        <Button onClick={saveAll} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving…" : "Save All"}
        </Button>
      </div>

      {/* Regions table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-semibold">Region</th>
              <th className="px-4 py-3 text-left font-semibold">Label</th>
              <th className="px-4 py-3 text-left font-semibold">Currency</th>
              <th className="px-4 py-3 text-left font-semibold">Symbol</th>
              <th className="px-4 py-3 text-left font-semibold">Country Codes</th>
              <th className="px-4 py-3 text-left font-semibold">Tax Note</th>
              <th className="px-4 py-3 text-center font-semibold">Default</th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2 font-medium">
                  {FLAG_MAP[r.region_code] || ""} {r.region_code}
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={r.region_label}
                    onChange={(e) => updateRegionField(r.id, "region_label", e.target.value)}
                    className="h-8 w-40"
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={r.currency_code}
                    onChange={(e) => updateRegionField(r.id, "currency_code", e.target.value)}
                    className="h-8 w-20"
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={r.currency_symbol}
                    onChange={(e) => updateRegionField(r.id, "currency_symbol", e.target.value)}
                    className="h-8 w-16"
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={r.country_codes.join(", ")}
                    onChange={(e) =>
                      updateRegionField(
                        r.id,
                        "country_codes",
                        e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                      )
                    }
                    className="h-8 w-48"
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={r.tax_note || ""}
                    onChange={(e) => updateRegionField(r.id, "tax_note", e.target.value || null)}
                    className="h-8 w-28"
                    placeholder="e.g. excl. VAT"
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="radio"
                    name="default_region"
                    checked={r.is_default}
                    onChange={() => {
                      setRegions((prev) =>
                        prev.map((reg) => ({ ...reg, is_default: reg.id === r.id }))
                      );
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Plan prices matrix */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Plan Prices</h2>
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-semibold">Region</th>
                <th className="px-4 py-3 text-right font-semibold">Starter</th>
                <th className="px-4 py-3 text-right font-semibold">Core</th>
                <th className="px-4 py-3 text-right font-semibold">Multi-Branch</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">
                    {FLAG_MAP[r.region_code] || ""} {r.currency_symbol}
                  </td>
                  {planSlugs.map((slug) => (
                    <td key={slug} className="px-4 py-2 text-right">
                      <Input
                        type="number"
                        value={getPlanPrice(r.id, slug)}
                        onChange={(e) => setPlanPrice(r.id, slug, e.target.value)}
                        className="h-8 w-28 ml-auto text-right"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
