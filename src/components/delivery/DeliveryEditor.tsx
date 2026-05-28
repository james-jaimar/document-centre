import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, MapPin, Truck, RotateCw } from "lucide-react";

type Scope = "tenant" | "branch" | "platform";

interface Props {
  scope: Scope;
  tenantId?: string | null;
  branchId?: string | null;
  title?: string;
  description?: string;
}

type Zone = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  is_default_fallback: boolean;
  sort_order: number;
  is_active: boolean;
  scope_type: Scope;
  tenant_id: string | null;
  branch_id: string | null;
};

type Method = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  is_express: boolean;
  is_active: boolean;
  sort_order: number;
  tenant_id: string | null;
};

type Rate = {
  id: string;
  zone_id: string;
  method_id: string;
  min_weight_kg: number;
  max_weight_kg: number | null;
  price: number;
  currency_code: string;
  is_active: boolean;
  sort_order: number;
  scope_type: Scope;
  tenant_id: string | null;
  branch_id: string | null;
};

type Location = {
  id: string;
  zone_id: string;
  match_type: "city" | "postcode_prefix" | "province";
  value: string;
  country: string;
};

export default function DeliveryEditor({ scope, tenantId, branchId, title, description }: Props) {
  const qc = useQueryClient();

  const scopeKey = ["delivery", scope, tenantId ?? null, branchId ?? null];

  const zonesQuery = useQuery({
    queryKey: [...scopeKey, "zones"],
    queryFn: async () => {
      let q = supabase.from("delivery_zones").select("*").eq("scope_type", scope).order("sort_order");
      if (scope === "tenant") q = q.eq("tenant_id", tenantId!).is("branch_id", null);
      if (scope === "branch") q = q.eq("branch_id", branchId!);
      const { data, error } = await q;
      if (error) throw error;
      return data as Zone[];
    },
  });

  // Methods are tenant-scoped or platform (tenant_id is null)
  const methodsQuery = useQuery({
    queryKey: ["delivery", "methods", tenantId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_methods")
        .select("*")
        .or(`tenant_id.is.null${tenantId ? `,tenant_id.eq.${tenantId}` : ""}`)
        .order("sort_order");
      if (error) throw error;
      return data as Method[];
    },
  });

  const ratesQuery = useQuery({
    queryKey: [...scopeKey, "rates"],
    enabled: !!zonesQuery.data?.length,
    queryFn: async () => {
      const zoneIds = zonesQuery.data!.map((z) => z.id);
      const { data, error } = await supabase
        .from("delivery_rates")
        .select("*")
        .in("zone_id", zoneIds)
        .order("min_weight_kg");
      if (error) throw error;
      return data as Rate[];
    },
  });

  const locationsQuery = useQuery({
    queryKey: [...scopeKey, "locations"],
    enabled: !!zonesQuery.data?.length,
    queryFn: async () => {
      const zoneIds = zonesQuery.data!.map((z) => z.id);
      const { data, error } = await supabase
        .from("delivery_zone_locations")
        .select("*")
        .in("zone_id", zoneIds)
        .order("match_type");
      if (error) throw error;
      return data as Location[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["delivery"] });

  // ---------- Mutations ----------
  const saveZone = useMutation({
    mutationFn: async (z: Partial<Zone> & { id?: string }) => {
      if (z.id) {
        const { error } = await supabase.from("delivery_zones").update({
          label: z.label,
          code: z.code,
          description: z.description ?? null,
          is_default_fallback: z.is_default_fallback ?? false,
          is_active: z.is_active ?? true,
          sort_order: z.sort_order ?? 0,
        }).eq("id", z.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("delivery_zones").insert({
          scope_type: scope,
          tenant_id: scope === "platform" ? null : tenantId!,
          branch_id: scope === "branch" ? branchId! : null,
          code: z.code!,
          label: z.label!,
          description: z.description ?? null,
          is_default_fallback: z.is_default_fallback ?? false,
          is_active: z.is_active ?? true,
          sort_order: z.sort_order ?? 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Zone saved"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteZone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Zone deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveRate = useMutation({
    mutationFn: async (r: Partial<Rate> & { id?: string }) => {
      if (r.id) {
        const { error } = await supabase.from("delivery_rates").update({
          method_id: r.method_id,
          min_weight_kg: r.min_weight_kg,
          max_weight_kg: r.max_weight_kg ?? null,
          price: r.price,
          currency_code: r.currency_code,
          is_active: r.is_active ?? true,
        }).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("delivery_rates").insert({
          scope_type: scope,
          tenant_id: scope === "platform" ? null : tenantId!,
          branch_id: scope === "branch" ? branchId! : null,
          zone_id: r.zone_id!,
          method_id: r.method_id!,
          min_weight_kg: r.min_weight_kg ?? 0,
          max_weight_kg: r.max_weight_kg ?? null,
          price: r.price!,
          currency_code: r.currency_code ?? "ZAR",
          is_active: r.is_active ?? true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Rate saved"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delivery_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Rate deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveLocation = useMutation({
    mutationFn: async (l: Omit<Location, "id">) => {
      const { error } = await supabase.from("delivery_zone_locations").insert(l);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Location added"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteLocation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("delivery_zone_locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const cloneFromTenant = useMutation({
    mutationFn: async () => {
      if (scope !== "branch" || !branchId) throw new Error("Branch scope only");
      const { error } = await supabase.rpc("clone_tenant_delivery_to_branch", { p_branch_id: branchId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cloned tenant defaults"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const zones = zonesQuery.data ?? [];
  const methods = methodsQuery.data ?? [];
  const rates = ratesQuery.data ?? [];
  const locations = locationsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2"><Truck className="size-6" /> {title ?? "Delivery"}</h2>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {scope === "branch" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm"><RotateCw className="size-4 mr-2" />Reset from tenant</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset branch delivery setup?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will clone the tenant-level zones, locations, and rates into this branch. Existing branch entries with the same zone codes will be skipped.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => cloneFromTenant.mutate()}>Clone</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <Tabs defaultValue="zones">
        <TabsList>
          <TabsTrigger value="zones">Zones & Rates</TabsTrigger>
          <TabsTrigger value="methods">Methods</TabsTrigger>
        </TabsList>

        <TabsContent value="zones" className="space-y-4">
          <div className="flex justify-end">
            <ZoneDialog onSave={(z) => saveZone.mutate(z)} />
          </div>
          {zones.length === 0 && (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">
              No zones configured at this scope. {scope === "branch" && "Use 'Reset from tenant' to inherit defaults."}
            </CardContent></Card>
          )}
          {zones.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              methods={methods}
              rates={rates.filter((r) => r.zone_id === zone.id)}
              locations={locations.filter((l) => l.zone_id === zone.id)}
              onUpdateZone={(z) => saveZone.mutate({ ...z, id: zone.id })}
              onDeleteZone={() => deleteZone.mutate(zone.id)}
              onSaveRate={(r) => saveRate.mutate(r)}
              onDeleteRate={(id) => deleteRate.mutate(id)}
              onAddLocation={(l) => saveLocation.mutate({ ...l, zone_id: zone.id })}
              onDeleteLocation={(id) => deleteLocation.mutate(id)}
            />
          ))}
        </TabsContent>

        <TabsContent value="methods" className="space-y-4">
          <MethodsPanel methods={methods} tenantId={tenantId} branchId={branchId} scope={scope} onChanged={invalidate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Zone Card ----------
function ZoneCard({
  zone, methods, rates, locations,
  onUpdateZone, onDeleteZone, onSaveRate, onDeleteRate, onAddLocation, onDeleteLocation,
}: {
  zone: Zone; methods: Method[]; rates: Rate[]; locations: Location[];
  onUpdateZone: (z: Partial<Zone>) => void;
  onDeleteZone: () => void;
  onSaveRate: (r: Partial<Rate>) => void;
  onDeleteRate: (id: string) => void;
  onAddLocation: (l: Omit<Location, "id" | "zone_id">) => void;
  onDeleteLocation: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1 flex-1">
          <CardTitle className="flex items-center gap-2">
            {zone.label}
            <Badge variant="outline">{zone.code}</Badge>
            {zone.is_default_fallback && <Badge>Fallback</Badge>}
            {!zone.is_active && <Badge variant="secondary">Inactive</Badge>}
          </CardTitle>
          {zone.description && <CardDescription>{zone.description}</CardDescription>}
        </div>
        <div className="flex gap-2">
          <ZoneDialog zone={zone} onSave={onUpdateZone} trigger={<Button variant="outline" size="sm">Edit</Button>} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon"><Trash2 className="size-4 text-destructive" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Delete zone?</AlertDialogTitle>
                <AlertDialogDescription>All rates and locations under this zone will be removed.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDeleteZone}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Locations */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm flex items-center gap-2"><MapPin className="size-4" /> Locations</h4>
            <LocationDialog onAdd={onAddLocation} />
          </div>
          {locations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No locations — this zone won't match unless it's the fallback.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {locations.map((l) => (
                <Badge key={l.id} variant="secondary" className="gap-1 pl-2 pr-1">
                  <span className="text-[10px] uppercase opacity-70">{l.match_type.replace("_", " ")}</span>
                  {l.value}
                  <button onClick={() => onDeleteLocation(l.id)} className="hover:bg-destructive/20 rounded p-0.5">
                    <Trash2 className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </section>

        {/* Rates */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm">Weight tiers</h4>
            <RateDialog methods={methods} onSave={onSaveRate} />
          </div>
          {rates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No rates yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead>Weight (kg)</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r) => {
                  const m = methods.find((mm) => mm.id === r.method_id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{m?.label ?? r.method_id}</TableCell>
                      <TableCell>{r.min_weight_kg} – {r.max_weight_kg ?? "∞"}</TableCell>
                      <TableCell>{r.price.toFixed(2)}</TableCell>
                      <TableCell>{r.currency_code}</TableCell>
                      <TableCell className="flex gap-1 justify-end">
                        <RateDialog methods={methods} rate={r} onSave={(rr) => onSaveRate({ ...rr, id: r.id })}
                          trigger={<Button variant="ghost" size="sm">Edit</Button>} />
                        <Button variant="ghost" size="icon" onClick={() => onDeleteRate(r.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

// ---------- Zone Dialog ----------
function ZoneDialog({ zone, onSave, trigger }: { zone?: Zone; onSave: (z: Partial<Zone>) => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Zone>>(zone ?? { code: "", label: "", is_default_fallback: false, is_active: true, sort_order: 0 });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && zone) setForm(zone); else if (o) setForm({ code: "", label: "", is_default_fallback: false, is_active: true, sort_order: 0 }); }}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm"><Plus className="size-4 mr-1" />Add zone</Button>}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{zone ? "Edit zone" : "New zone"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Code</Label><Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="major_centre" /></div>
          <div><Label>Label</Label><Input value={form.label ?? ""} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Major Centre" /></div>
          <div><Label>Description</Label><Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Sort order</Label><Input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
          <div className="flex items-center justify-between"><Label>Default fallback</Label><Switch checked={form.is_default_fallback ?? false} onCheckedChange={(v) => setForm({ ...form, is_default_fallback: v })} /></div>
          <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { onSave(form); setOpen(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Rate Dialog ----------
function RateDialog({ methods, rate, onSave, trigger }: { methods: Method[]; rate?: Rate; onSave: (r: Partial<Rate>) => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const init: Partial<Rate> = rate ?? { min_weight_kg: 0, max_weight_kg: 2, price: 0, currency_code: "ZAR", is_active: true, method_id: methods[0]?.id };
  const [form, setForm] = useState<Partial<Rate>>(init);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(rate ?? { min_weight_kg: 0, max_weight_kg: 2, price: 0, currency_code: "ZAR", is_active: true, method_id: methods[0]?.id }); }}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm" variant="outline"><Plus className="size-4 mr-1" />Add tier</Button>}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{rate ? "Edit tier" : "New weight tier"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Method</Label>
            <Select value={form.method_id} onValueChange={(v) => setForm({ ...form, method_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>{methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Min weight (kg)</Label><Input type="number" step="0.01" value={form.min_weight_kg ?? 0} onChange={(e) => setForm({ ...form, min_weight_kg: Number(e.target.value) })} /></div>
            <div><Label>Max weight (kg)</Label><Input type="number" step="0.01" value={form.max_weight_kg ?? ""} placeholder="∞" onChange={(e) => setForm({ ...form, max_weight_kg: e.target.value === "" ? null : Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Price</Label><Input type="number" step="0.01" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
            <div><Label>Currency</Label><Input value={form.currency_code ?? "ZAR"} onChange={(e) => setForm({ ...form, currency_code: e.target.value.toUpperCase() })} /></div>
          </div>
          <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { onSave(form); setOpen(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Location Dialog ----------
function LocationDialog({ onAdd }: { onAdd: (l: Omit<Location, "id" | "zone_id">) => void }) {
  const [open, setOpen] = useState(false);
  const [matchType, setMatchType] = useState<Location["match_type"]>("city");
  const [value, setValue] = useState("");
  const [country, setCountry] = useState("ZA");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="size-4 mr-1" />Add location</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add location match</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Match type</Label>
            <Select value={matchType} onValueChange={(v) => setMatchType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="city">City</SelectItem>
                <SelectItem value="postcode_prefix">Postcode prefix</SelectItem>
                <SelectItem value="province">Province</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Value</Label><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={matchType === "postcode_prefix" ? "e.g. 80 (matches 80xx)" : "e.g. Cape Town"} /></div>
          <div><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { if (!value) return; onAdd({ match_type: matchType, value, country }); setOpen(false); setValue(""); }}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Methods Panel ----------
function MethodsPanel({ methods, tenantId, branchId, scope, onChanged }: { methods: Method[]; tenantId?: string | null; branchId?: string | null; scope: Scope; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Method>>({ code: "", label: "", is_express: false, is_active: true, sort_order: 0 });
  const isBranchScope = scope === "branch" && !!branchId;

  // Tenant-level and (when in branch scope) branch-level overrides.
  const overridesQuery = useQuery({
    queryKey: ["delivery", "method-overrides", tenantId ?? null, branchId ?? null],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_delivery_method_overrides")
        .select("method_id, is_enabled, branch_id")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const tenantOverrideMap = new Map<string, boolean>(
    (overridesQuery.data ?? []).filter((o: any) => o.branch_id === null).map((o: any) => [o.method_id, o.is_enabled]),
  );
  const branchOverrideMap = new Map<string, boolean>(
    (overridesQuery.data ?? []).filter((o: any) => o.branch_id === branchId).map((o: any) => [o.method_id, o.is_enabled]),
  );

  const create = async () => {
    if (!form.code || !form.label) return;
    const { error } = await supabase.from("delivery_methods").insert({
      code: form.code!, label: form.label!,
      description: form.description ?? null,
      is_express: form.is_express ?? false,
      is_active: form.is_active ?? true,
      sort_order: form.sort_order ?? 0,
      tenant_id: tenantId ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Method added"); setOpen(false); setForm({ code: "", label: "", is_express: false, is_active: true, sort_order: 0 }); onChanged();
  };

  // Toggle logic:
  // - Branch scope: write/delete a branch-scoped override row (never touches tenant or method).
  // - Tenant scope, platform method: write/delete tenant-scoped override.
  // - Tenant scope, tenant-owned method: flip is_active directly.
  const toggle = async (m: Method, enabled: boolean) => {
    const isPlatform = m.tenant_id === null;

    if (isBranchScope) {
      if (!tenantId || !branchId) return;
      // Determine the inherited default we'd fall back to if no branch row exists.
      const inherited = isPlatform
        ? (tenantOverrideMap.has(m.id) ? tenantOverrideMap.get(m.id)! : m.is_active)
        : (tenantOverrideMap.has(m.id) ? tenantOverrideMap.get(m.id)! : m.is_active);
      if (enabled === inherited) {
        // Matches inherited — delete the branch override row.
        const { error } = await supabase
          .from("tenant_delivery_method_overrides")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("branch_id", branchId)
          .eq("method_id", m.id);
        if (error) { toast.error(error.message); return; }
      } else {
        const { error } = await supabase
          .from("tenant_delivery_method_overrides")
          .upsert(
            { tenant_id: tenantId, branch_id: branchId, method_id: m.id, is_enabled: enabled },
            { onConflict: "tenant_id,branch_id,method_id" },
          );
        if (error) { toast.error(error.message); return; }
      }
      overridesQuery.refetch();
      onChanged();
      return;
    }

    // Tenant scope
    if (isPlatform) {
      if (!tenantId) return;
      if (enabled) {
        const { error } = await supabase
          .from("tenant_delivery_method_overrides")
          .delete()
          .eq("tenant_id", tenantId)
          .is("branch_id", null)
          .eq("method_id", m.id);
        if (error) { toast.error(error.message); return; }
      } else {
        const { error } = await supabase
          .from("tenant_delivery_method_overrides")
          .upsert(
            { tenant_id: tenantId, branch_id: null, method_id: m.id, is_enabled: false },
            { onConflict: "tenant_id,method_id" },
          );
        if (error) { toast.error(error.message); return; }
      }
      overridesQuery.refetch();
      onChanged();
      return;
    }
    const { error } = await supabase.from("delivery_methods").update({ is_active: enabled }).eq("id", m.id);
    if (error) toast.error(error.message); else onChanged();
  };
  const remove = async (m: Method) => {
    const { error } = await supabase.from("delivery_methods").delete().eq("id", m.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); onChanged(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Delivery methods</CardTitle>
          <CardDescription>Services your customers can pick (PostNet2Door, courier, etc.). Platform methods can be enabled or disabled for your tenant — disabled methods are hidden at checkout.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="size-4 mr-1" />Add method</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New delivery method</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Code</Label><Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><Label>Label</Label><Input value={form.label ?? ""} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
              <div><Label>Description</Label><Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="flex items-center justify-between"><Label>Express</Label><Switch checked={form.is_express ?? false} onCheckedChange={(v) => setForm({ ...form, is_express: v })} /></div>
              <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Label</TableHead><TableHead>Scope</TableHead><TableHead>Express</TableHead><TableHead>Enabled</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {methods.map((m) => {
              const isPlatform = m.tenant_id === null;
              const overrideEnabled = overrideMap.get(m.id);
              const effective = isPlatform
                ? (overrideEnabled ?? m.is_active)
                : m.is_active;
              return (
                <TableRow key={m.id}>
                  <TableCell><Badge variant="outline">{m.code}</Badge></TableCell>
                  <TableCell>{m.label}</TableCell>
                  <TableCell>
                    {isPlatform
                      ? <Badge variant="secondary">Platform{overrideEnabled === false ? " · disabled" : ""}</Badge>
                      : <Badge>Tenant</Badge>}
                  </TableCell>
                  <TableCell>{m.is_express ? "Yes" : "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={effective}
                      disabled={isPlatform && !tenantId}
                      onCheckedChange={(v) => toggle(m, v)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {!isPlatform && <Button variant="ghost" size="icon" onClick={() => remove(m)}><Trash2 className="size-4 text-destructive" /></Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
