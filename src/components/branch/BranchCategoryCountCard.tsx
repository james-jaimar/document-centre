import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_COUNT_CATEGORY, CATEGORY_COUNT_KEY } from "@/hooks/useShowCategoryCounts";

type TriState = "inherit" | "on" | "off";

const asBool = (v: unknown): boolean | null =>
  v === true || v === "true" ? true : v === false || v === "false" ? false : null;

/** Branch override for the product-count badge on storefront category tiles. */
export function BranchCategoryCountCard({
  tenantId,
  branchId,
}: {
  tenantId: string;
  branchId: string;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState<TriState>("inherit");
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["branch_category_count_setting", tenantId, branchId],
    enabled: !!tenantId && !!branchId,
    queryFn: async () => {
      const [tenantRes, branchRes] = await Promise.all([
        supabase
          .from("tenant_settings")
          .select("setting_value")
          .eq("tenant_id", tenantId)
          .eq("category", CATEGORY_COUNT_CATEGORY)
          .eq("setting_key", CATEGORY_COUNT_KEY)
          .maybeSingle(),
        supabase
          .from("branch_settings" as any)
          .select("setting_value")
          .eq("branch_id", branchId)
          .eq("category", CATEGORY_COUNT_CATEGORY)
          .eq("setting_key", CATEGORY_COUNT_KEY)
          .maybeSingle(),
      ]);
      return {
        tenant: asBool((tenantRes.data as any)?.setting_value) ?? true,
        branch: asBool((branchRes.data as any)?.setting_value),
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    setValue(data.branch === true ? "on" : data.branch === false ? "off" : "inherit");
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (value === "inherit") {
        const { error } = await supabase
          .from("branch_settings" as any)
          .delete()
          .eq("branch_id", branchId)
          .eq("category", CATEGORY_COUNT_CATEGORY)
          .eq("setting_key", CATEGORY_COUNT_KEY);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("branch_settings" as any).upsert(
          {
            tenant_id: tenantId,
            branch_id: branchId,
            category: CATEGORY_COUNT_CATEGORY,
            setting_key: CATEGORY_COUNT_KEY,
            setting_value: value === "on",
            value_type: "boolean",
          } as any,
          { onConflict: "branch_id,category,setting_key" },
        );
        if (error) throw error;
      }
      toast.success("Category display saved");
      qc.invalidateQueries({ queryKey: ["branch_category_count_setting", tenantId, branchId] });
      qc.invalidateQueries({ queryKey: ["show_category_counts"] });
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
          <LayoutGrid size={16} /> Category Product Counts
        </CardTitle>
        <CardDescription>
          Show or hide the number of products on storefront category tiles for this branch.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>Product count badge</Label>
          <select
            className="h-10 w-56 rounded-md border bg-background px-3 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value as TriState)}
          >
            <option value="inherit">Inherit ({data?.tenant === false ? "Hidden" : "Shown"})</option>
            <option value="on">Shown</option>
            <option value="off">Hidden</option>
          </select>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save size={14} className="mr-1.5" /> {saving ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
