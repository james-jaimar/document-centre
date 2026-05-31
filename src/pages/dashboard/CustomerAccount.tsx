import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ClipboardList, Plus, Pencil, Trash2, Star, MapPin } from "lucide-react";
import { useCustomerAddresses, type CustomerAddress } from "@/hooks/useCustomerAddresses";
import { CustomerAddressDialog } from "@/components/admin/CustomerAddressDialog";
import { useFavouriteBranch } from "@/hooks/useFavouriteBranch";
import { useBranch } from "@/contexts/BranchContext";

export default function CustomerAccount() {
  const { user } = useAuth();
  const { slug, tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    display_name: "",
    phone: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        display_name: profile.display_name ?? "",
        phone: profile.phone ?? "",
      });
    }
  }, [profile]);

  // Saved address book (CRUD-enabled)
  const addressBook = useCustomerAddresses(user?.id);
  const [addrDialogOpen, setAddrDialogOpen] = useState(false);
  const [editingAddr, setEditingAddr] = useState<CustomerAddress | null>(null);

  // Favourite branch
  const fav = useFavouriteBranch();
  const { branches: liveBranches } = useBranch();

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        display_name: form.display_name || null,
        phone: form.phone || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
    }
  };

  const [pwd, setPwd] = useState({ next: "", confirm: "" });
  const [pwdSaving, setPwdSaving] = useState(false);

  const handleChangePassword = async () => {
    if (pwd.next.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (pwd.next !== pwd.confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setPwdSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd.next });
    setPwdSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password changed");
      setPwd({ next: "", confirm: "" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile, addresses, and security.
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="w-full md:w-auto overflow-x-auto flex">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="orders">Order History</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>


        <TabsContent value="profile">
          <Card className="p-4 md:p-6 max-w-2xl">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="first">First name</Label>
                    <Input
                      id="first"
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="last">Last name</Label>
                    <Input
                      id="last"
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="display">Display name</Label>
                  <Input
                    id="display"
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={user?.email ?? ""} disabled />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveProfile} disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>

                {/* Favourite branch */}
                {liveBranches.length > 1 && (
                  <div className="pt-4 border-t space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5" /> Favourite branch
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      We'll preselect this branch whenever you visit the storefront.
                    </p>
                    <Select
                      value={fav.data ?? "none"}
                      onValueChange={(v) => fav.set.mutate(v === "none" ? null : v)}
                    >
                      <SelectTrigger className="max-w-sm">
                        <SelectValue placeholder="No preference" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No preference</SelectItem>
                        {liveBranches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}{b.city ? ` — ${b.city}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="addresses">
          <Card className="p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Saved addresses</h3>
                <p className="text-xs text-muted-foreground">
                  Use these at checkout for faster delivery.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => { setEditingAddr(null); setAddrDialogOpen(true); }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add address
              </Button>
            </div>
            {(addressBook.data ?? []).length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No saved addresses yet. Add one to speed up checkout.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(addressBook.data ?? []).map((a) => (
                  <div key={a.id} className="rounded-lg border p-4 text-sm relative group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs uppercase text-muted-foreground">
                          {a.label || a.address_type}
                        </span>
                        {a.is_default && (
                          <span className="text-[10px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingAddr(a); setAddrDialogOpen(true); }}
                          className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this address?")) addressBook.remove.mutate(a.id);
                          }}
                          className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {a.contact_name && <div className="font-medium">{a.contact_name}</div>}
                    {a.company_name && <div>{a.company_name}</div>}
                    {a.line1 && <div>{a.line1}</div>}
                    {a.line2 && <div>{a.line2}</div>}
                    <div>{[a.suburb, a.city, a.postal_code].filter(Boolean).join(", ")}</div>
                    {a.country && <div className="text-muted-foreground">{a.country}</div>}
                  </div>
                ))}
              </div>
            )}
            {user?.id && (
              <CustomerAddressDialog
                open={addrDialogOpen}
                onOpenChange={setAddrDialogOpen}
                customerProfileId={user.id}
                initial={editingAddr}
              />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card className="p-8 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-4">
              View all your past and current orders.
            </p>
            <Button onClick={() => navigate(tenantPath("orders"))}>Go to my orders</Button>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="p-4 md:p-6 max-w-md space-y-4">
            <h3 className="font-semibold">Change password</h3>
            <div>
              <Label htmlFor="pwd-new">New password</Label>
              <Input
                id="pwd-new"
                type="password"
                value={pwd.next}
                onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="pwd-confirm">Confirm password</Label>
              <Input
                id="pwd-confirm"
                type="password"
                value={pwd.confirm}
                onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleChangePassword} disabled={pwdSaving}>
                {pwdSaving ? "Updating…" : "Update password"}
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
