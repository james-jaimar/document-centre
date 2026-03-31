import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { toast } from "sonner";
import { Save, Bell } from "lucide-react";

const NOTIFICATION_EVENTS = [
  { key: "order_confirmation", label: "Order Confirmation" },
  { key: "payment_received", label: "Payment Received" },
  { key: "proof_ready", label: "Proof Ready" },
  { key: "order_dispatched", label: "Order Dispatched" },
  { key: "order_completed", label: "Order Completed" },
];

export function NotificationsTab() {
  const { settingsMap, isLoading } = useTenantSettingsMap("notifications");
  const bulkUpsert = useBulkUpsertTenantSettings();

  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");

  useEffect(() => {
    if (!isLoading && settingsMap) {
      const t: Record<string, boolean> = {};
      NOTIFICATION_EVENTS.forEach(({ key }) => { t[key] = settingsMap[key] !== false; });
      setToggles(t);
      setSenderName((settingsMap.sender_name as string) ?? "");
      setSenderEmail((settingsMap.sender_email as string) ?? "");
    }
  }, [isLoading, settingsMap]);

  const handleSave = async () => {
    try {
      const settings = [
        ...NOTIFICATION_EVENTS.map(({ key }) => ({
          category: "notifications", setting_key: key, setting_value: toggles[key] ?? true, value_type: "boolean",
        })),
        { category: "notifications", setting_key: "sender_name", setting_value: senderName, value_type: "string" },
        { category: "notifications", setting_key: "sender_email", setting_value: senderEmail, value_type: "string" },
      ];
      await bulkUpsert.mutateAsync(settings);
      toast.success("Notification settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Email Notifications</CardTitle>
          <CardDescription>Choose which order events trigger customer emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {NOTIFICATION_EVENTS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label className="cursor-pointer">{label}</Label>
              <Switch
                checked={toggles[key] ?? true}
                onCheckedChange={(v) => setToggles((prev) => ({ ...prev, [key]: v }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sender Details</CardTitle>
          <CardDescription>The "from" name and email for outbound notifications</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 max-w-lg">
          <div className="space-y-2">
            <Label>Sender Name</Label>
            <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="e.g. My Print Shop" />
          </div>
          <div className="space-y-2">
            <Label>Sender Email</Label>
            <Input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="orders@example.com" />
          </div>
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
