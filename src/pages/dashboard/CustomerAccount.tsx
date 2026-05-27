import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";

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

  const { data: addresses } = useQuery({
    queryKey: ["customer-addresses", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_addresses")
        .select("*, orders!inner(ordered_by_profile_id)")
        .eq("orders.ordered_by_profile_id", user!.id);
      const seen = new Set<string>();
      return (data ?? []).filter((a: any) => {
        const k = `${a.address_type}|${a.line1 ?? ""}|${a.postal_code ?? ""}|${a.city ?? ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    },
  });

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
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="addresses">
          <Card className="p-4 md:p-6">
            {(addresses ?? []).length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No saved addresses yet. Addresses will appear here after your first order.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(addresses ?? []).map((a: any) => (
                  <div key={a.id} className="rounded-lg border p-4 text-sm">
                    <div className="text-xs uppercase text-muted-foreground mb-1">
                      {a.address_type}
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
