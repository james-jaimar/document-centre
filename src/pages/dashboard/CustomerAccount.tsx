import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useEffect, useState } from "react";
// (navigate removed — order history tab gone)
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star, MapPin, Check, ChevronsUpDown } from "lucide-react";
import { useCustomerAddresses, type CustomerAddress } from "@/hooks/useCustomerAddresses";
import { CustomerAddressDialog } from "@/components/admin/CustomerAddressDialog";
import { useFavouriteBranch } from "@/hooks/useFavouriteBranch";
import { useBranch } from "@/contexts/BranchContext";

export default function CustomerAccount() {
  const { user } = useAuth();
  const { slug, tenantPath: _tenantPath } = useTenantSlug();
  void _tenantPath; void slug;
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
                    <FavouriteBranchCombobox
                      value={fav.data ?? null}
                      branches={liveBranches}
                      onSelect={(id) => fav.set.mutate(id)}
                    />
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


        <TabsContent value="security">
          <SecurityPanel
            user={user}
            pwd={pwd}
            setPwd={setPwd}
            pwdSaving={pwdSaving}
            handleChangePassword={handleChangePassword}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type BranchOption = {
  id: string;
  name: string;
  slug?: string;
  city?: string | null;
  province?: string | null;
};

function FavouriteBranchCombobox({
  value,
  branches,
  onSelect,
}: {
  value: string | null;
  branches: BranchOption[];
  onSelect: (branchId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? branches.find((b) => b.id === value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full max-w-sm justify-between"
        >
          <span className="truncate">
            {selected ? (
              <>
                {selected.name}
                {selected.city ? ` — ${selected.city}` : ""}
              </>
            ) : (
              <span className="text-muted-foreground">No preference</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command
          filter={(value, search) => {
            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search branches…" />
          <CommandList>
            <CommandEmpty>No branches found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="no-preference"
                onSelect={() => {
                  onSelect(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${value === null ? "opacity-100" : "opacity-0"}`}
                />
                <span className="text-muted-foreground">No preference</span>
              </CommandItem>
              {branches.map((b) => {
                const loc = [b.city, b.province].filter(Boolean).join(", ");
                const searchKey = `${b.name} ${loc} ${b.slug ?? ""}`.trim();
                return (
                  <CommandItem
                    key={b.id}
                    value={searchKey}
                    onSelect={() => {
                      onSelect(b.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${value === b.id ? "opacity-100" : "opacity-0"}`}
                    />
                    <div className="min-w-0">
                      <div className="truncate">{b.name}</div>
                      {loc && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{loc}</span>
                        </div>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const SOCIAL_PROVIDER_META: Record<string, { label: string; manageUrl?: string }> = {
  google: { label: "Google", manageUrl: "https://myaccount.google.com/security" },
  azure: { label: "Microsoft", manageUrl: "https://account.microsoft.com/security" },
  apple: { label: "Apple", manageUrl: "https://appleid.apple.com/" },
};

function SecurityPanel({
  user,
  pwd,
  setPwd,
  pwdSaving,
  handleChangePassword,
}: {
  user: any;
  pwd: { next: string; confirm: string };
  setPwd: (v: { next: string; confirm: string }) => void;
  pwdSaving: boolean;
  handleChangePassword: () => void;
}) {
  const identities: Array<{ provider: string }> = user?.identities ?? [];
  const hasPassword = identities.some((i) => i.provider === "email");
  const socials = identities
    .filter((i) => i.provider !== "email")
    .map((i) => ({ provider: i.provider, meta: SOCIAL_PROVIDER_META[i.provider] ?? { label: i.provider } }));
  const onlySocial = !hasPassword && socials.length > 0;
  const primarySocial = socials[0];

  return (
    <div className="space-y-4 max-w-md">
      {onlySocial && primarySocial ? (
        <Card className="p-4 md:p-6 space-y-3">
          <h3 className="font-semibold">Sign-in method</h3>
          <p className="text-sm text-muted-foreground">
            You sign in with <span className="font-medium text-foreground">{primarySocial.meta.label}</span>
            {user?.email ? <> as <span className="font-medium text-foreground">{user.email}</span></> : null}.
            Your password is managed by {primarySocial.meta.label}.
          </p>
          {primarySocial.provider === "google" && primarySocial.meta.manageUrl && (
            <div className="pt-2">
              <a
                href={primarySocial.meta.manageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
              >
                <GoogleGlyph className="h-4 w-4" />
                Manage your Google Account
              </a>
            </div>
          )}
          {primarySocial.provider !== "google" && primarySocial.meta.manageUrl && (
            <div className="pt-2">
              <Button asChild variant="outline">
                <a href={primarySocial.meta.manageUrl} target="_blank" rel="noopener noreferrer">
                  Manage your {primarySocial.meta.label} account
                </a>
              </Button>
            </div>
          )}
        </Card>

      ) : (
        <Card className="p-4 md:p-6 space-y-4">
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
          {socials.length > 0 && (
            <p className="text-xs text-muted-foreground pt-1 border-t">
              Linked sign-in methods: {socials.map((s) => s.meta.label).join(", ")}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
