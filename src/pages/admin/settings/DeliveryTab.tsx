import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { toast } from "sonner";
import { Save, Truck } from "lucide-react";

const DELIVERY_METHODS = [
  { value: "collection", label: "Collection / Pickup" },
  { value: "courier", label: "Courier" },
  { value: "delivery", label: "Local Delivery" },
  { value: "postal", label: "Postal / Mail" },
  { value: "digital", label: "Digital Only" },
];

export function DeliveryTab() {
  const { settingsMap, isLoading } = useTenantSettingsMap("delivery");
  const bulkUpsert = useBulkUpsertTenantSettings();

  const [methods, setMethods] = useState<string[]>(["collection", "courier", "delivery"]);
  const [freeThreshold, setFreeThreshold] = useState("500");

  useEffect(() => {
    if (!isLoading && settingsMap) {
      const m = settingsMap.methods_enabled;
      setMethods(Array.isArray(m) ? m as string[] : ["collection", "courier", "delivery"]);
      setFreeThreshold(String(settingsMap.free_shipping_threshold ?? 500));
    }
  }, [isLoading, settingsMap]);

  const toggleMethod = (method: string) => {
    setMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  const handleSave = async () => {
    try {
      await bulkUpsert.mutateAsync([
        { category: "delivery", setting_key: "methods_enabled", setting_value: methods, value_type: "json" },
        { category: "delivery", setting_key: "free_shipping_threshold", setting_value: parseFloat(freeThreshold), value_type: "number" },
      ]);
      toast.success("Delivery settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" /> Delivery Methods</CardTitle>
          <CardDescription>Which fulfilment methods are available to customers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {DELIVERY_METHODS.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-3">
              <Checkbox
                checked={methods.includes(value)}
                onCheckedChange={() => toggleMethod(value)}
              />
              <Label className="cursor-pointer">{label}</Label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Free Shipping Threshold</CardTitle>
          <CardDescription>Order value above which shipping is free (in tenant currency)</CardDescription>
        </CardHeader>
        <CardContent className="max-w-xs">
          <Input type="number" value={freeThreshold} onChange={(e) => setFreeThreshold(e.target.value)} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={bulkUpsert.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save Changes
        </Button>
      </div>
    </div>
  );
}
