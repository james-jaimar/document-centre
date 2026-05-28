import { useParams, useNavigate } from "react-router-dom";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranches, useUpdateBranch } from "@/hooks/useBranches";
import { useTenantMembers, useUpdateTenantMember } from "@/hooks/useTenantMembers";
import BranchProductToggles from "@/components/branch/BranchProductToggles";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Users, Settings2, Shield, UserPlus, CreditCard, IdCard, Truck } from "lucide-react";
import { buildAdminPath } from "@/lib/adminRouting";
import { AddMemberDialog } from "@/components/admin/AddMemberDialog";
import { PaymentGatewaysCard } from "@/components/payments/PaymentGatewaysCard";
import BranchIdentityBankingCard from "@/components/branch/BranchIdentityBankingCard";

const AdminBranchDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId, appId } = useTenantContext();
  const { data: branches } = useBranches(tenantId);
  const branch = branches?.find((b) => b.id === id);
  const updateBranch = useUpdateBranch();
  const { data: allMembers } = useTenantMembers(tenantId, appId);
  const updateMember = useUpdateTenantMember();

  const branchMembers = allMembers?.filter((m) => m.branch_id === id) || [];
  const unassignedMembers = allMembers?.filter((m) => !m.branch_id || m.branch_id !== id) || [];

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");

  // Editable form state
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "", code: "", address: "", city: "", province: "",
    postal_code: "", country: "ZA", email: "", phone: "", is_active: true,
  });

  const startEdit = () => {
    if (!branch) return;
    setForm({
      name: branch.name,
      code: branch.code || "",
      address: branch.address || "",
      city: branch.city || "",
      province: branch.province || "",
      postal_code: branch.postal_code || "",
      country: branch.country,
      email: branch.email || "",
      phone: branch.phone || "",
      is_active: branch.is_active,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!branch) return;
    try {
      await updateBranch.mutateAsync({
        id: branch.id,
        ...form,
        address: form.address || null,
        city: form.city || null,
        province: form.province || null,
        postal_code: form.postal_code || null,
        email: form.email || null,
        phone: form.phone || null,
        code: form.code || null,
      });
      toast.success("Branch updated");
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAssign = async () => {
    if (!selectedMemberId) return;
    try {
      await updateMember.mutateAsync({ id: selectedMemberId, branch_id: id! });
      toast.success("User assigned to branch");
      setAssignDialogOpen(false);
      setSelectedMemberId("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUnassign = async (memberId: string) => {
    try {
      await updateMember.mutateAsync({ id: memberId, branch_id: null });
      toast.success("User removed from branch");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const set = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const displayName = (m: any) => {
    const p = m.profiles;
    if (!p) return "Unknown";
    if (p.first_name || p.last_name) return [p.first_name, p.last_name].filter(Boolean).join(" ");
    return p.display_name || p.email || "Unknown";
  };

  if (!branch) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(buildAdminPath("/admin/branches", tenantId))}>
          <ArrowLeft size={16} className="mr-2" /> Back to Branches
        </Button>
        <p className="text-muted-foreground">Branch not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(buildAdminPath("/admin/branches", tenantId))}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{branch.name}</h1>
            {branch.code && <p className="text-sm text-muted-foreground">Code: {branch.code}</p>}
          </div>
        </div>
        <Badge variant={branch.is_active ? "default" : "secondary"} className="ml-auto">
          {branch.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" className="gap-1.5"><Building2 size={14} /> Details</TabsTrigger>
          <TabsTrigger value="identity" className="gap-1.5"><IdCard size={14} /> Identity & Banking</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users size={14} /> Users ({branchMembers.length})</TabsTrigger>
          <TabsTrigger value="capabilities" className="gap-1.5"><Settings2 size={14} /> Capabilities</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5"><CreditCard size={14} /> Payments</TabsTrigger>
          <TabsTrigger value="delivery" className="gap-1.5"><Truck size={14} /> Delivery</TabsTrigger>
        </TabsList>

        {/* ─── DETAILS TAB ─── */}
        <TabsContent value="details">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Branch Details</CardTitle>
              {!editing && <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>}
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label>Branch Name *</Label>
                    <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Code</Label>
                    <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. CPT-01" />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Address</Label>
                    <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
                  </div>
                  <div>
                    <Label>Province</Label>
                    <Input value={form.province} onChange={(e) => set("province", e.target.value)} />
                  </div>
                  <div>
                    <Label>Postal Code</Label>
                    <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
                    <Label>Active</Label>
                  </div>
                  <div className="md:col-span-2 flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={!form.name || updateBranch.isPending}>
                      {updateBranch.isPending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <dl className="grid gap-3 md:grid-cols-2 text-sm">
                  {[
                    ["Name", branch.name],
                    ["Code", branch.code || "—"],
                    ["Address", [branch.address, branch.city, branch.province, branch.postal_code].filter(Boolean).join(", ") || "—"],
                    ["Country", branch.country],
                    ["Phone", branch.phone || "—"],
                    ["Email", branch.email || "—"],
                  ].map(([label, val]) => (
                    <div key={label as string}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium text-foreground">{val}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── IDENTITY & BANKING TAB ─── */}
        <TabsContent value="identity">
          <BranchIdentityBankingCard branch={branch} />
        </TabsContent>


        {/* ─── USERS TAB ─── */}
        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Branch Staff</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setAssignDialogOpen(true)}>
                  <UserPlus size={14} className="mr-1.5" /> Assign Existing
                </Button>
                <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
                  <UserPlus size={14} className="mr-1.5" /> Invite New Staff
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {branchMembers.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No users assigned to this branch yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branchMembers.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{displayName(m)}</TableCell>
                        <TableCell className="text-muted-foreground">{m.profiles?.email || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline"><Shield size={12} className="mr-1" />{m.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.is_active ? "default" : "secondary"}>
                            {m.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleUnassign(m.id)}>
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── CAPABILITIES TAB ─── */}
        <TabsContent value="capabilities">
          {id && <BranchProductToggles branchId={id} />}
        </TabsContent>

        {/* ─── PAYMENTS TAB ─── */}
        <TabsContent value="payments">
          {id && tenantId && (
            <PaymentGatewaysCard scope="branch" scopeId={id} tenantId={tenantId} />
          )}
        </TabsContent>
      </Tabs>

      {/* Assign User Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign User to {branch.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select team member</Label>
              <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <SelectTrigger><SelectValue placeholder="Choose a member…" /></SelectTrigger>
                <SelectContent>
                  {unassignedMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {displayName(m)} — {m.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={!selectedMemberId || updateMember.isPending}>
              {updateMember.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite New Branch Staff */}
      {tenantId && appId && (
        <AddMemberDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
          tenantId={tenantId}
          appId={appId}
        />
      )}
    </div>
  );
};

export default AdminBranchDetail;
