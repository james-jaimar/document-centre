import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTenants, useUpdateTenant } from "@/hooks/useTenants";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantSubscriptions } from "@/hooks/useTenantSubscriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TenantSubscriptionDialog } from "@/components/platform/TenantSubscriptionDialog";
import { toast } from "sonner";
import { Building2, Pencil, ArrowRight, ExternalLink, CreditCard } from "lucide-react";
import type { Tenant } from "@/hooks/useTenants";
import { buildAdminPath } from "@/lib/adminRouting";

const PlatformTenants = () => {
  const { data: tenants, isLoading } = useTenants();
  const { data: subscriptions } = useTenantSubscriptions();
  const updateTenant = useUpdateTenant();
  const { setOverrideTenantId } = useTenantContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [subTenant, setSubTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", logo_url: "" });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenant Management</h1>
          <p className="text-sm text-muted-foreground">Manage all tenants on the platform</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading tenants…</div>
      ) : !tenants?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No tenants found. Seed data may be needed.
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
    </div>
  );
};

export default PlatformTenants;
