import { BookOpen, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useBookshelfEnabled } from "@/hooks/useBookshelf";
import { useUpsertTenantSetting } from "@/hooks/useTenantSettings";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function BookshelfTab() {
  const feature = useBookshelfEnabled();
  const update = useUpsertTenantSetting();
  const qc = useQueryClient();
  return <section className="space-y-6 max-w-2xl">
    <div className="flex items-center gap-3"><BookOpen className="h-6 w-6 text-primary" /><h2 className="text-lg font-semibold">Customer Bookshelf</h2></div>
    <div className="flex items-center justify-between gap-6 border-y border-border py-5">
      <Label htmlFor="bookshelf-enabled" className="text-base">Enable bookshelf for this tenant</Label>
      {feature.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Switch id="bookshelf-enabled" checked={feature.data === true} disabled={update.isPending || feature.isError} onCheckedChange={async enabled => {
        try {
          await update.mutateAsync({ category: "bookshelf", setting_key: "enabled", setting_value: enabled, value_type: "boolean" });
          await qc.invalidateQueries({ queryKey: ["bookshelf-enabled"] });
          await qc.invalidateQueries({ queryKey: ["bookshelf"] });
          toast.success(enabled ? "Bookshelf enabled for this tenant" : "Bookshelf disabled for this tenant");
        } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update bookshelf settings"); }
      }} />}
    </div>
    {feature.isError && <p className="text-destructive">Could not load the bookshelf setting.</p>}
  </section>;
}