import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useUpdateTenant, type Tenant } from "@/hooks/useTenants";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Globe, ExternalLink, Copy } from "lucide-react";

const CURRENCIES = ["ZAR", "USD", "GBP", "EUR", "AUD", "CAD", "NZD"];
const COUNTRIES = [
  { code: "ZA", name: "South Africa" }, { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" }, { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" }, { code: "NZ", name: "New Zealand" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" },
];
const TIMEZONES = [
  "Africa/Johannesburg", "Europe/London", "America/New_York", "America/Los_Angeles",
  "Australia/Sydney", "Pacific/Auckland", "Europe/Berlin", "Europe/Paris",
];
const LOCALES = ["en-ZA", "en-US", "en-GB", "en-AU", "de-DE", "fr-FR"];
const ONBOARDING_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "setup_in_progress", label: "Setup In Progress" },
  { value: "ready", label: "Ready" },
  { value: "suspended", label: "Suspended" },
];

export function GeneralTab() {
  const { tenantId } = useTenantContext();
  const updateTenant = useUpdateTenant();
  const [tenant, setTenant] = useState<Partial<Tenant> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();
      setTenant(data);
      setLoading(false);
    })();
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenant || !tenantId) return;
    try {
      await updateTenant.mutateAsync({ id: tenantId, ...tenant });
      toast.success("Tenant settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const update = (field: string, value: string) =>
    setTenant((prev) => (prev ? { ...prev, [field]: value } : prev));

  if (loading) return <div className="text-muted-foreground">Loading...</div>;
  if (!tenant) return <div className="text-muted-foreground">No tenant found</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company Identity</CardTitle>
          <CardDescription>Legal and display name details for invoices and compliance</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={tenant.name ?? ""} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Trading Name</Label>
            <Input value={(tenant as any).trading_name ?? ""} onChange={(e) => update("trading_name", e.target.value)} placeholder="e.g. ABC Print" />
          </div>
          <div className="space-y-2">
            <Label>Legal Name</Label>
            <Input value={(tenant as any).legal_name ?? ""} onChange={(e) => update("legal_name", e.target.value)} placeholder="e.g. ABC Packaging (Pty) Ltd" />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={tenant.slug ?? ""} onChange={(e) => update("slug", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>VAT Number</Label>
            <Input value={(tenant as any).vat_number ?? ""} onChange={(e) => update("vat_number", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Registration Number</Label>
            <Input value={(tenant as any).registration_number ?? ""} onChange={(e) => update("registration_number", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Details</CardTitle>
          <CardDescription>Support and billing contact info</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Billing Email</Label>
            <Input type="email" value={(tenant as any).billing_email ?? ""} onChange={(e) => update("billing_email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Support Email</Label>
            <Input type="email" value={(tenant as any).support_email ?? ""} onChange={(e) => update("support_email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Support Phone</Label>
            <Input value={(tenant as any).support_phone ?? ""} onChange={(e) => update("support_phone", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Website URL</Label>
            <Input value={(tenant as any).website_url ?? ""} onChange={(e) => update("website_url", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regional Settings</CardTitle>
          <CardDescription>Currency, timezone, and locale defaults</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Default Currency</Label>
            <Select value={(tenant as any).default_currency ?? "ZAR"} onValueChange={(v) => update("default_currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Select value={(tenant as any).country ?? "ZA"} onValueChange={(v) => update("country", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={(tenant as any).timezone ?? "Africa/Johannesburg"} onValueChange={(v) => update("timezone", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Locale</Label>
            <Select value={(tenant as any).locale ?? "en-ZA"} onValueChange={(v) => update("locale", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LOCALES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding Status</CardTitle>
          <CardDescription>Track tenant setup progress</CardDescription>
        </CardHeader>
        <CardContent className="max-w-sm">
          <Select value={(tenant as any).onboarding_status ?? "draft"} onValueChange={(v) => update("onboarding_status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ONBOARDING_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateTenant.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save Changes
        </Button>
      </div>
    </div>
  );
}
