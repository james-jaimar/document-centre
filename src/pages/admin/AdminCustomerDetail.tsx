import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Mail, Phone, Trash2, MessageSquare, Pencil, UserX, UserCheck,
  KeyRound, MoreHorizontal, Plus, MapPin, AtSign,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  useTenantCustomer, useCustomerNotes,
  useToggleCustomerMembership, useRemoveCustomerFromTenant,
} from "@/hooks/useTenantCustomers";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useManageUser } from "@/hooks/useManageUser";
import { useCustomerAddresses, type CustomerAddress } from "@/hooks/useCustomerAddresses";
import { buildAdminPath } from "@/lib/adminRouting";
import { EditCustomerDialog } from "@/components/admin/EditCustomerDialog";
import { CustomerAddressDialog } from "@/components/admin/CustomerAddressDialog";
import { CustomerAccountSettings } from "@/components/admin/CustomerAccountSettings";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { resolveDisplayName } from "@/lib/displayName";
import { formatPrice } from "@/lib/formatCurrency";

export default function AdminCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId, appId } = useTenantContext();
  const { data, isLoading } = useTenantCustomer(id);
  const notes = useCustomerNotes(id);
  const toggleMembership = useToggleCustomerMembership(id);
  const removeMembership = useRemoveCustomerFromTenant(id);
  const manageUser = useManageUser();
  const addresses = useCustomerAddresses(id);

  const [noteBody, setNoteBody] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [confirmDeleteAddress, setConfirmDeleteAddress] = useState<string | null>(null);

  const accountSettings = useMemo(
    () => ((data?.membership as any)?.metadata ?? {}) as any,
    [data?.membership]
  );

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { profile, membership, orders, history } = data;
  const persistentAddresses = addresses.data ?? [];

  const name = resolveDisplayName(profile, "Customer");

  const lifetimeValue = orders.reduce((sum, o: any) => sum + Number(o.total_amount ?? 0), 0);
  const aov = orders.length > 0 ? lifetimeValue / orders.length : 0;

  const openAddAddress = () => {
    setEditingAddress(null);
    setAddressDialogOpen(true);
  };
  const openEditAddress = (a: CustomerAddress) => {
    setEditingAddress(a);
    setAddressDialogOpen(true);
  };

  const handlePasswordReset = () => {
    if (!id) return;
    manageUser.mutate(
      {
        action: "force_password_reset",
        target_profile_id: id,
        tenant_id: tenantId ?? null,
        app_id: appId ?? null,
      },
      {
        onSettled: () => setResetOpen(false),
      }
    );
  };

  const handleUpdateEmail = () => {
    if (!id || !newEmail.trim()) return;
    manageUser.mutate(
      {
        action: "update_email",
        target_profile_id: id,
        tenant_id: tenantId ?? null,
        app_id: appId ?? null,
        new_email: newEmail.trim(),
      },
      { onSuccess: () => { setEmailOpen(false); setNewEmail(""); } }
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to={buildAdminPath("/admin/customers", tenantId)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All customers
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{name}</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {profile?.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {profile.email}
              </span>
            )}
            {profile?.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {profile.phone}
              </span>
            )}
            {membership && (
              <Badge variant={membership.is_active ? "default" : "secondary"}>
                {membership.is_active ? "Active" : "Inactive"}
              </Badge>
            )}
            {accountSettings.is_account_customer && (
              <Badge variant="outline">Account customer</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setResetOpen(true)} disabled={!profile?.email}>
            <KeyRound className="h-4 w-4 mr-1" /> Send reset link
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setNewEmail(profile?.email ?? ""); setEmailOpen(true); }}>
                <AtSign className="h-4 w-4 mr-2" /> Change email
              </DropdownMenuItem>
              {membership && (
                <DropdownMenuItem
                  onClick={() => toggleMembership.mutate(!membership.is_active)}
                  disabled={toggleMembership.isPending}
                >
                  {membership.is_active ? (
                    <><UserX className="h-4 w-4 mr-2" /> Deactivate</>
                  ) : (
                    <><UserCheck className="h-4 w-4 mr-2" /> Activate</>
                  )}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => setRemoveOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Remove from tenant
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {profile && (
        <EditCustomerDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          profileId={profile.id}
          initial={{
            first_name: profile.first_name,
            last_name: profile.last_name,
            display_name: profile.display_name,
            phone: profile.phone,
            email: profile.email,
          }}
        />
      )}

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove customer from tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes their membership in this tenant. Their account, profile and order history are preserved. They can be re-added later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                removeMembership.mutate(undefined, {
                  onSuccess: () => navigate(buildAdminPath("/admin/customers", tenantId)),
                })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send password reset link?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll email <strong>{profile?.email}</strong> a branded password reset link from your storefront.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePasswordReset} disabled={manageUser.isPending}>
              {manageUser.isPending ? "Sending…" : "Send reset link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change customer email</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New email</Label>
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Updates the auth account and profile. The customer will use this email to sign in.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateEmail} disabled={!newEmail.trim() || manageUser.isPending}>
              {manageUser.isPending ? "Saving…" : "Update email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Lifetime value</div>
          <div className="text-2xl font-semibold">{formatPrice(lifetimeValue, (data as any)?.preferred_currency ?? "ZAR")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Orders</div>
          <div className="text-2xl font-semibold">{orders.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Avg order value</div>
          <div className="text-2xl font-semibold">{formatPrice(aov, (data as any)?.preferred_currency ?? "ZAR")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Last order</div>
          <div className="text-2xl font-semibold">
            {orders[0]
              ? formatDistanceToNow(new Date((orders[0] as any).created_at), { addSuffix: true })
              : "—"}
          </div>
        </Card>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card>
            {orders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No orders yet.</div>
            ) : (
              <div className="divide-y">
                {orders.map((o: any) => (
                  <Link
                    key={o.id}
                    to={buildAdminPath(`/admin/orders/${o.id}`, tenantId)}
                    className="flex items-center justify-between p-4 hover:bg-muted/40"
                  >
                    <div>
                      <div className="font-medium">{o.order_number ?? o.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(o.created_at), "PP")} · {o.customer_status}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatPrice(Number(o.total_amount ?? 0), (o.currency as string | undefined) ?? "ZAR")}</div>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {o.payment_status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="addresses">
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Saved addresses</h3>
                <p className="text-xs text-muted-foreground">
                  Persistent addresses available at checkout.
                </p>
              </div>
              <Button size="sm" onClick={openAddAddress}>
                <Plus className="h-4 w-4 mr-1" /> Add address
              </Button>
            </div>

            {persistentAddresses.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                <MapPin className="mx-auto h-6 w-6 opacity-40 mb-2" />
                No saved addresses yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {persistentAddresses.map((a) => (
                  <div key={a.id} className="rounded-lg border p-4 space-y-1">
                    <div className="flex items-start justify-between">
                      <div className="text-xs uppercase text-muted-foreground">
                        {a.label || a.address_type}
                        {a.is_default && <Badge variant="secondary" className="ml-2 text-[10px]">Default</Badge>}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditAddress(a)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setConfirmDeleteAddress(a.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {a.contact_name && <div className="font-medium text-sm">{a.contact_name}</div>}
                    {a.company_name && <div className="text-sm">{a.company_name}</div>}
                    {a.line1 && <div className="text-sm">{a.line1}</div>}
                    {a.line2 && <div className="text-sm">{a.line2}</div>}
                    <div className="text-sm">
                      {[a.suburb, a.city, a.postal_code].filter(Boolean).join(", ")}
                    </div>
                    {a.country && <div className="text-xs text-muted-foreground">{a.country}</div>}
                    {a.phone && <div className="text-xs text-muted-foreground">{a.phone}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {id && (
            <CustomerAddressDialog
              open={addressDialogOpen}
              onOpenChange={(v) => { setAddressDialogOpen(v); if (!v) setEditingAddress(null); }}
              customerProfileId={id}
              initial={editingAddress}
            />
          )}

          <AlertDialog
            open={!!confirmDeleteAddress}
            onOpenChange={(v) => !v && setConfirmDeleteAddress(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this address?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. Past orders that referenced it are unaffected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (confirmDeleteAddress) {
                      addresses.remove.mutate(confirmDeleteAddress, {
                        onSuccess: () => setConfirmDeleteAddress(null),
                      });
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="account">
          {id && (
            <CustomerAccountSettings
              customerProfileId={id}
              initial={accountSettings}
            />
          )}
          <Card className="p-4 mt-4">
            <h3 className="text-sm font-semibold mb-3">Membership</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Account created</div>
                <div className="font-medium">
                  {profile?.created_at ? format(new Date(profile.created_at), "PP") : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Member since</div>
                <div className="font-medium">
                  {membership?.created_at
                    ? formatDistanceToNow(new Date(membership.created_at), { addSuffix: true })
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Role</div>
                <div className="font-medium">{membership?.role ?? "—"}</div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            {history.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No activity yet.</div>
            ) : (
              <div className="divide-y">
                {history.map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between p-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">{h.entity_type}</span>{" "}
                      <span className="font-medium">
                        {h.from_status ? `${h.from_status} → ${h.to_status}` : h.to_status}
                      </span>
                      {h.reason && (
                        <div className="text-xs text-muted-foreground">{h.reason}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card className="p-4 space-y-4">
            <div className="space-y-2">
              <Textarea
                placeholder="Add an internal note about this customer…"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={3}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!noteBody.trim() || notes.addNote.isPending}
                  onClick={() =>
                    notes.addNote.mutate(noteBody.trim(), {
                      onSuccess: () => setNoteBody(""),
                    })
                  }
                >
                  Add note
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {(notes.data ?? []).length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-6">
                  <MessageSquare className="mx-auto h-6 w-6 opacity-40 mb-2" />
                  No notes yet.
                </div>
              ) : (
                (notes.data ?? []).map((n: any) => (
                  <div key={n.id} className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => notes.deleteNote.mutate(n.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
