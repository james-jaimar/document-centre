import { usePlatformSettings, useUpsertPlatformSetting } from "@/hooks/usePlatformSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EventRow {
  key: string;
  title: string;
  description: string;
}

const EVENTS: EventRow[] = [
  { key: "tenant_created",         title: "Tenant created",                description: "Notify platform admins when a new tenant signs up." },
  { key: "tenant_onboarding_done", title: "Tenant onboarding completed",   description: "Notify platform admins once a tenant finishes onboarding." },
  { key: "plan_changed",           title: "Plan assigned / changed",       description: "Notify tenant owners when their subscription plan changes." },
  { key: "trial_started",          title: "Trial started",                 description: "Notify the branch billing contact when a trial begins." },
  { key: "subscription_past_due",  title: "Subscription past due",         description: "Alert tenant owner + platform admins on a failed renewal." },
  { key: "subscription_cancelled", title: "Subscription cancelled",        description: "Notify the tenant when a subscription is cancelled." },
  { key: "invoice_paid",           title: "Invoice paid",                  description: "Send a receipt when Stripe successfully charges a tenant." },
  { key: "invoice_failed",         title: "Invoice payment failed",        description: "Alert tenant + platform admins on a failed Stripe invoice." },
  { key: "platform_admin_invite",  title: "Platform admin invitation",     description: "Send the invite email when granting platform admin access." },
];

export function PlatformNotificationsTab() {
  const { data: settings = [], isLoading } = usePlatformSettings("notifications");
  const upsert = useUpsertPlatformSetting();

  const valueOf = (key: string): boolean => {
    const row = settings.find((s) => s.setting_key === key);
    if (!row) return true;
    return row.setting_value === true || row.setting_value === "true";
  };

  const toggle = async (key: string, next: boolean) => {
    try {
      await upsert.mutateAsync({
        category: "notifications",
        setting_key: key,
        setting_value: next,
        value_type: "boolean",
      });
      toast.success(`${next ? "Enabled" : "Disabled"} ${key}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Platform notifications</CardTitle>
        <CardDescription>
          These emails are sent from the platform mailbox configured in the Email tab. Toggling an
          event off stops it for every tenant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          EVENTS.map((ev) => {
            const checked = valueOf(ev.key);
            return (
              <div key={ev.key} className="flex items-start justify-between gap-4 py-3 border-b last:border-b-0">
                <div className="space-y-0.5">
                  <Label htmlFor={`notif-${ev.key}`} className="text-sm font-medium">{ev.title}</Label>
                  <p className="text-xs text-muted-foreground">{ev.description}</p>
                </div>
                <Switch
                  id={`notif-${ev.key}`}
                  checked={checked}
                  onCheckedChange={(v) => toggle(ev.key, v)}
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
