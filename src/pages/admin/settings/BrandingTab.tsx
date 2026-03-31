import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save, Palette } from "lucide-react";

export function BrandingTab() {
  const { settingsMap, isLoading } = useTenantSettingsMap("branding");
  const bulkUpsert = useBulkUpsertTenantSettings();

  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [portalName, setPortalName] = useState("");

  useEffect(() => {
    if (!isLoading && settingsMap) {
      setPrimaryColor((settingsMap.primary_color as string) ?? "#1a1a2e");
      setSecondaryColor((settingsMap.secondary_color as string) ?? "#16213e");
      setAccentColor((settingsMap.accent_color as string) ?? "#0f3460");
      setPortalName((settingsMap.portal_name as string) ?? "");
    }
  }, [isLoading, settingsMap]);

  const handleSave = async () => {
    try {
      await bulkUpsert.mutateAsync([
        { category: "branding", setting_key: "primary_color", setting_value: primaryColor, value_type: "string" },
        { category: "branding", setting_key: "secondary_color", setting_value: secondaryColor, value_type: "string" },
        { category: "branding", setting_key: "accent_color", setting_value: accentColor, value_type: "string" },
        { category: "branding", setting_key: "portal_name", setting_value: portalName, value_type: "string" },
      ]);
      toast.success("Branding settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Brand Colors</CardTitle>
          <CardDescription>Colors used on the customer-facing storefront and emails</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          {[
            { label: "Primary Color", value: primaryColor, set: setPrimaryColor },
            { label: "Secondary Color", value: secondaryColor, set: setSecondaryColor },
            { label: "Accent Color", value: accentColor, set: setAccentColor },
          ].map(({ label, value, set }) => (
            <div key={label} className="space-y-2">
              <Label>{label}</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={value} onChange={(e) => set(e.target.value)} className="h-10 w-10 cursor-pointer rounded border border-input" />
                <Input value={value} onChange={(e) => set(e.target.value)} className="font-mono" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portal Name</CardTitle>
          <CardDescription>Displayed in the header and browser tab for the customer portal</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md">
          <Input value={portalName} onChange={(e) => setPortalName(e.target.value)} placeholder="e.g. My Print Shop" />
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
