import { useState } from "react";
import DeliveryEditor from "@/components/delivery/DeliveryEditor";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export default function AdminDelivery() {
  const { tenantId } = useTenantContext();
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);

  const { data: isPlatformAdmin } = useQuery({
    queryKey: ["is-platform-admin", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "platform_admin")
        .maybeSingle();
      return !!data;
    },
  });

  const { data: postcodeStats, refetch: refetchStats } = useQuery({
    queryKey: ["za-postcode-stats"],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      const { count } = await supabase
        .from("delivery_zone_locations")
        .select("*", { count: "exact", head: true })
        .eq("match_type", "postcode_prefix")
        .eq("country", "ZA");
      return count ?? 0;
    },
  });

  async function handleSync() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-za-postcodes");
      if (error) throw error;
      const r = data as { total: number; majorCount: number; regionalCount: number };
      toast.success(
        `Synced ${r.total.toLocaleString()} SA postcodes (${r.majorCount} major, ${r.regionalCount} regional)`,
      );
      await refetchStats();
    } catch (e) {
      toast.error(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  if (!tenantId) {
    return <div className="p-6 text-sm text-muted-foreground">No active tenant.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {isPlatformAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">SA postcode database (platform)</CardTitle>
            <CardDescription>
              {postcodeStats ?? 0} ZA postcodes currently mapped to Major / Regional zones from
              GeoNames. Re-run to pull the latest dataset.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync SA postcodes"}
            </Button>
          </CardContent>
        </Card>
      )}
      <DeliveryEditor
        scope="tenant"
        tenantId={tenantId}
        title="Delivery & shipping"
        description="Zones, locations, and weight-tiered rates for your storefront. Branches can override these defaults from their branch detail page."
      />
    </div>
  );
}
