import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTenants, useUpdateTenant, useCreateTenant } from "@/hooks/useTenants";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantSubscriptions } from "@/hooks/useTenantSubscriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { TenantSubscriptionDialog } from "@/components/platform/TenantSubscriptionDialog";
import { PlatformTenantPaymentsDialog } from "@/components/platform/PlatformTenantPaymentsDialog";
import { toast } from "sonner";
import { Building2, Pencil, ArrowRight, ExternalLink, CreditCard, Plus, Globe } from "lucide-react";
import type { Tenant } from "@/hooks/useTenants";
import { buildAdminPath } from "@/lib/adminRouting";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

function useApps() {
  return useQuery({
    queryKey: ["apps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("apps").select("id, name, slug").order("name");
      if (error) throw error;
      return data;
    },
  });
}

interface CreateForm {
  name: string;
  slug: string;
  app_id: string;
  logo_url: string;
  country: string;
  default_currency: string;
  timezone: string;
  is_active: boolean;
}

const EMPTY_CREATE: CreateForm = {
  name: "",
  slug: "",
  app_id: "",
  logo_url: "",
  country: "ZA",
  default_currency: "ZAR",
  timezone: "Africa/Johannesburg",
  is_active: true,
};

const PlatformTenants = () => {
  const { data: tenants, isLoading } = useTenants();
  const { data: subscriptions } = useTenantSubscriptions();
  const { data: apps } = useApps();
  const updateTenant = useUpdateTenant();
  const createTenant = useCreateTenant();
  const { setOverrideTenantId } = useTenantContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [subTenant, setSubTenant] = useState<Tenant | null>(null);
  const [paymentsTenant, setPaymentsTenant] = useState<Tenant | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", logo_url: "" });
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);

  // Subscription lookup by tenant_id
  const subByTenant = (subscriptions ?? []).reduce<Record<string, typeof subscriptions extends (infer T)[] ? T : never>>((acc, s) => {
    acc[s.tenant_id] = s;
    return acc;
  }, {});

  // Handle checkout return toasts
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toast.success("Checkout completed — subscription will activate shortly");
      setSearchParams({}, { replace: true });
    } else if (checkout === "cancelled") {
      toast.info("Checkout was cancelled");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openEdit = (t: Tenant) => {
    setEditing(t);
    setForm({ name: t.name, slug: t.slug, logo_url: t.logo_url || "" });
  };

  const handleManage = (tenantId: string) => {
    setOverrideTenantId(tenantId);
    navigate(buildAdminPath("/admin", tenantId));
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      await updateTenant.mutateAsync({
        id: editing.id,
        name: form.name,
        slug: form.slug,
        logo_url: form.logo_url || null,
      });
      toast.success("Tenant updated");
      setEditing(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Auto-generate slug from name
  const handleCreateNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setCreateForm((f) => ({ ...f, name, slug }));
  };

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }
    if (!createForm.app_id) {
      toast.error("Please select an app");
      return;
    }
    try {
      await createTenant.mutateAsync({
        name: createForm.name.trim(),
        slug: createForm.slug.trim(),
        app_id: createForm.app_id,
        logo_url: createForm.logo_url || null,
        country: createForm.country,
        default_currency: createForm.default_currency,
        timezone: createForm.timezone,
        is_active: createForm.is_active,
      });
      toast.success("Tenant created");
      setCreating(false);
      setCreateForm(EMPTY_CREATE);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenant Management</h1>
          <p className="text-sm text-muted-foreground">Manage all tenants on the platform</p>
        </div>
        <Button onClick={() => { setCreateForm(EMPTY_CREATE); setCreating(true); }}>
          <Plus size={16} className="mr-1.5" />
          Create Tenant
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading tenants…</div>
      ) : !tenants?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No tenants found. Click "Create Tenant" to add one.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tenants.map((t) => (
            <Card key={t.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{t.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{t.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={t.is_active ? "default" : "secondary"}>
                      {t.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="outline" className="capitalize text-xs">
                      {subByTenant[t.id]?.plan_slug || t.plan_slug || "starter"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                  <ExternalLink size={12} />
                  <a
                    href={`/t/${t.slug}/dashboard`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary underline underline-offset-2"
                  >
                    /t/{t.slug}
                  </a>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Created {new Date(t.created_at).toLocaleDateString()}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setSubTenant(t)}>
                      <CreditCard size={14} className="mr-1" /> Subscription
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPaymentsTenant(t)}>
                      <Globe size={14} className="mr-1" /> Payments
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                      <Pencil size={14} className="mr-1" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleManage(t.id)}>
                      Manage <ArrowRight size={14} className="ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Tenant Dialog */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateTenant.isPending}>
              {updateTenant.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Tenant Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Tenant</DialogTitle>
            <DialogDescription>Add a new tenant to the platform. You can configure additional settings after creation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>App <span className="text-destructive">*</span></Label>
              <Select value={createForm.app_id} onValueChange={(v) => setCreateForm((f) => ({ ...f, app_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an app…" />
                </SelectTrigger>
                <SelectContent>
                  {(apps ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.slug})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tenant Name <span className="text-destructive">*</span></Label>
              <Input
                value={createForm.name}
                onChange={(e) => handleCreateNameChange(e.target.value)}
                placeholder="e.g. PostNet Sandton"
              />
            </div>
            <div>
              <Label>Slug <span className="text-destructive">*</span></Label>
              <Input
                value={createForm.slug}
                onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="e.g. postnet-sandton"
              />
              <p className="text-xs text-muted-foreground mt-1">Used in URLs: /t/{createForm.slug || "slug"} or {createForm.slug || "slug"}.document-centre.com</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Country</Label>
                <Select value={createForm.country} onValueChange={(v) => setCreateForm((f) => ({ ...f, country: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ZA">South Africa</SelectItem>
                    <SelectItem value="GB">United Kingdom</SelectItem>
                    <SelectItem value="US">United States</SelectItem>
                    <SelectItem value="AU">Australia</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={createForm.default_currency} onValueChange={(v) => setCreateForm((f) => ({ ...f, default_currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ZAR">ZAR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="AUD">AUD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Timezone</Label>
                <Select value={createForm.timezone} onValueChange={(v) => setCreateForm((f) => ({ ...f, timezone: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Africa/Johannesburg">Africa/Johannesburg</SelectItem>
                    <SelectItem value="Europe/London">Europe/London</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                    <SelectItem value="Australia/Sydney">Australia/Sydney</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input
                value={createForm.logo_url}
                onChange={(e) => setCreateForm((f) => ({ ...f, logo_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={createForm.is_active}
                onCheckedChange={(v) => setCreateForm((f) => ({ ...f, is_active: v }))}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createTenant.isPending}>
              {createTenant.isPending ? "Creating…" : "Create Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {subTenant && (
        <TenantSubscriptionDialog
          open={!!subTenant}
          onOpenChange={(open) => !open && setSubTenant(null)}
          tenant={subTenant}
          subscription={subByTenant[subTenant.id]}
        />
      )}

      {paymentsTenant && (
        <PlatformTenantPaymentsDialog
          open={!!paymentsTenant}
          onOpenChange={(open) => !open && setPaymentsTenant(null)}
          tenantId={paymentsTenant.id}
          tenantName={paymentsTenant.name}
        />
      )}
    </div>
  );
};

export default PlatformTenants;
