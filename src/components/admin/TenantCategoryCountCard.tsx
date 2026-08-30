import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { CATEGORY_COUNT_CATEGORY, CATEGORY_COUNT_KEY } from "@/hooks/useShowCategoryCounts";

const asBool = (v: unknown): boolean | null =>
  v === true || v === "true" ? true : v === false || v === "false" ? false : null;

/** Tenant-wide default for the product-count badge on category tiles. */
export function TenantCategoryCountCard() {
  const { tenantId } = useTenantContext();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["tenant_category_count_setting", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenant_settings")
        .select("setting_value")
        .eq("tenant_id", tenantId!)
        .eq("category", CATEGORY_COUNT_CATEGORY)
        .eq("setting_key", CATEGORY_COUNT_KEY)
        .maybeSingle();
      return asBool((data as any)?.setting_value) ?? true;
    },
  });

  useEffect(() => {
    if (data !== undefined) setEnabled(data);
  }, [data]);

  const handleChange = async (next: boolean) => {
    if (!tenantId) return;
    setEnabled(next);
    setSaving(true);
    try {
      const { error } = await supabase.from("tenant_settings").upsert(
        {
          tenant_id: tenantId,
          category: CATEGORY_COUNT_CATEGORY,
          setting_key: CATEGORY_COUNT_KEY,
          setting_value: next as any,
          value_type: "boolean",
        } as any,
        { onConflict: "tenant_id,category,setting_key" },
      );
      if (error) throw error;
      toast.success(next ? "Product counts shown" : "Product counts hidden");
      qc.invalidateQueries({ queryKey: ["tenant_category_count_setting", tenantId] });
      qc.invalidateQueries({ queryKey: ["show_category_counts"] });
    } catch (e: any) {
      setEnabled(!next);
      toast.error(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5" /> Category Product Counts
        </CardTitle>
        <CardDescription>
          Show the number of products on storefront category tiles. Branches can override this.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <Label htmlFor="category-counts">Show product count badge</Label>
        <Switch
          id="category-counts"
          checked={enabled}
          disabled={saving}
          onCheckedChange={handleChange}
        />
      </CardContent>
    </Card>
  );
}
