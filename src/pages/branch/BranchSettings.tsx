import { useState, useEffect } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranches, useUpdateBranch } from "@/hooks/useBranches";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Save, Clock, Truck, MapPin, Phone, IdCard, CreditCard } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BranchIdentityBankingCard from "@/components/branch/BranchIdentityBankingCard";
import { PaymentGatewaysCard } from "@/components/payments/PaymentGatewaysCard";

interface BranchSettingsData {
  manager_name: string;
  local_phone: string;
  local_email: string;
  walk_in_enabled: boolean;
  max_daily_orders: number | null;
  turnaround_override: string;
  delivery_radius_km: number | null;
  accepts_delivery: boolean;
  collection_available: boolean;
  special_instructions: string;
  operating_hours: Record<string, { open: string; close: string; closed: boolean }>;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DEFAULT_HOURS = { open: "08:00", close: "17:00", closed: false };

const defaultSettings: BranchSettingsData = {
  manager_name: "",
  local_phone: "",
  local_email: "",
  walk_in_enabled: true,
  max_daily_orders: null,
  turnaround_override: "",
  delivery_radius_km: null,
  accepts_delivery: false,
  collection_available: true,
  special_instructions: "",
  operating_hours: Object.fromEntries(
    DAYS.map((d) => [d, d === "sunday" ? { ...DEFAULT_HOURS, closed: true } : { ...DEFAULT_HOURS }])
  ),
};

const BranchSettings = () => {
  const { tenantId, branchId } = useTenantContext();
  const { data: branches } = useBranches(tenantId);
  const branch = branches?.find((b) => b.id === branchId);
  const updateBranch = useUpdateBranch();
  const [settings, setSettings] = useState<BranchSettingsData>(defaultSettings);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (branch?.settings && typeof branch.settings === "object") {
      const s = branch.settings as Record<string, unknown>;
      setSettings({
        ...defaultSettings,
        ...s,
        operating_hours: {
          ...defaultSettings.operating_hours,
          ...(typeof s.operating_hours === "object" ? (s.operating_hours as any) : {}),
        },
      });
    }
  }, [branch]);

  const set = <K extends keyof BranchSettingsData>(key: K, value: BranchSettingsData[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const setHours = (day: string, field: string, value: string | boolean) => {
    setSettings((prev) => ({
      ...prev,
      operating_hours: {
        ...prev.operating_hours,
        [day]: { ...prev.operating_hours[day], [field]: value },
      },
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!branch) return;
    try {
      await updateBranch.mutateAsync({ id: branch.id, settings: settings as any });
      toast.success("Branch settings saved");
      setDirty(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (!branch) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Branch Settings</h1>
        <p className="text-muted-foreground">No branch assigned to your account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Branch Settings</h1>
          <p className="text-muted-foreground">{branch.name}</p>
        </div>
        <Button onClick={handleSave} disabled={!dirty || updateBranch.isPending}>
          <Save size={14} className="mr-1.5" />
          {updateBranch.isPending ? "Saving…" : "Save Operations"}
        </Button>
      </div>

      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity" className="gap-1.5"><IdCard size={14} /> Identity & Banking</TabsTrigger>
          <TabsTrigger value="operations" className="gap-1.5"><Clock size={14} /> Operations</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5"><CreditCard size={14} /> Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="identity">
          <BranchIdentityBankingCard branch={branch} />
        </TabsContent>

        <TabsContent value="payments">
          {tenantId && (
            <PaymentGatewaysCard scope="branch" scopeId={branch.id} tenantId={tenantId} />
          )}
        </TabsContent>

        <TabsContent value="operations" className="space-y-6">
      {/* Contact Overrides */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Phone size={16} /> Contact Information</CardTitle>
          <CardDescription>Local contact details for this branch</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Manager Name</Label>
            <Input value={settings.manager_name} onChange={(e) => set("manager_name", e.target.value)} placeholder="Branch manager" />
          </div>
          <div>
            <Label>Local Phone</Label>
            <Input value={settings.local_phone} onChange={(e) => set("local_phone", e.target.value)} placeholder="+27 ..." />
          </div>
          <div>
            <Label>Local Email</Label>
            <Input value={settings.local_email} onChange={(e) => set("local_email", e.target.value)} placeholder="branch@postnet.co.za" />
          </div>
        </CardContent>
      </Card>

      {/* Operating Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Clock size={16} /> Operating Hours</CardTitle>
          <CardDescription>When this branch accepts orders</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAYS.map((day) => {
            const h = settings.operating_hours[day] || DEFAULT_HOURS;
            return (
              <div key={day} className="flex items-center gap-4">
                <span className="w-24 text-sm font-medium capitalize">{day}</span>
                <Switch checked={!h.closed} onCheckedChange={(v) => setHours(day, "closed", !v)} />
                {!h.closed ? (
                  <div className="flex items-center gap-2">
                    <Input type="time" value={h.open} onChange={(e) => setHours(day, "open", e.target.value)} className="w-32" />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="time" value={h.close} onChange={(e) => setHours(day, "close", e.target.value)} className="w-32" />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Fulfillment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Truck size={16} /> Fulfillment Options</CardTitle>
          <CardDescription>How customers receive their orders</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <Switch id="walk-in" checked={settings.walk_in_enabled} onCheckedChange={(v) => set("walk_in_enabled", v)} />
              <Label htmlFor="walk-in">Walk-in Customers Accepted</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="collection" checked={settings.collection_available} onCheckedChange={(v) => set("collection_available", v)} />
              <Label htmlFor="collection">Collection Available</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="delivery" checked={settings.accepts_delivery} onCheckedChange={(v) => set("accepts_delivery", v)} />
              <Label htmlFor="delivery">Accepts Delivery Orders</Label>
            </div>
          </div>

          {settings.accepts_delivery && (
            <div className="max-w-xs">
              <Label>Delivery Radius (km)</Label>
              <Input
                type="number"
                value={settings.delivery_radius_km ?? ""}
                onChange={(e) => set("delivery_radius_km", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="e.g. 15"
              />
            </div>
          )}

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Max Daily Orders</Label>
              <Input
                type="number"
                value={settings.max_daily_orders ?? ""}
                onChange={(e) => set("max_daily_orders", e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Unlimited"
              />
            </div>
            <div>
              <Label>Turnaround Override</Label>
              <Input
                value={settings.turnaround_override}
                onChange={(e) => set("turnaround_override", e.target.value)}
                placeholder="e.g. Same day, 24 hours"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Special Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><MapPin size={16} /> Customer Notes</CardTitle>
          <CardDescription>Special instructions for customers visiting this branch</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={settings.special_instructions}
            onChange={(e) => set("special_instructions", e.target.value)}
            placeholder="e.g. Free parking available behind the building. Enter via the side entrance."
            rows={3}
          />
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BranchSettings;
