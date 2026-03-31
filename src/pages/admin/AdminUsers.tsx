import { useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantMembers, useUpdateTenantMember, useDeleteTenantMember, type TenantMemberRow } from "@/hooks/useTenantMembers";
import { useBranches } from "@/hooks/useBranches";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Pencil, Trash2, Shield, Users, UserPlus } from "lucide-react";
import { AddMemberDialog } from "@/components/admin/AddMemberDialog";

const MEMBERSHIP_ROLES = ["owner", "admin", "sales", "production", "accounts", "customer"];

const roleBadgeVariant = (role: string) => {
  switch (role) {
    case "owner": return "default";
    case "admin": return "default";
    case "customer": return "secondary";
    default: return "outline";
  }
};

const AdminUsers = () => {
  const { tenantId, appId } = useTenantContext();
  const { data: members, isLoading } = useTenantMembers(tenantId, appId);
  const { data: branches } = useBranches(tenantId);
  const updateMember = useUpdateTenantMember();
  const deleteMember = useDeleteTenantMember();

  const [editing, setEditing] = useState<TenantMemberRow | null>(null);
  const [editForm, setEditForm] = useState({ role: "", branch_id: "", is_active: true, can_view_all_orders: false });
  const [deleteTarget, setDeleteTarget] = useState<TenantMemberRow | null>(null);

  const openEdit = (m: TenantMemberRow) => {
    setEditing(m);
    setEditForm({
      role: m.role,
      branch_id: m.branch_id || "",
      is_active: m.is_active,
      can_view_all_orders: m.can_view_all_orders,
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      await updateMember.mutateAsync({
        id: editing.id,
        role: editForm.role,
        branch_id: editForm.branch_id || null,
        is_active: editForm.is_active,
        can_view_all_orders: editForm.can_view_all_orders,
      });
      toast.success("Member updated");
      setEditing(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMember.mutateAsync(deleteTarget.id);
      toast.success("Member removed");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const displayName = (m: TenantMemberRow) => {
    const p = m.profiles;
    if (!p) return "Unknown";
    if (p.first_name || p.last_name) return [p.first_name, p.last_name].filter(Boolean).join(" ");
    return p.display_name || p.email || "Unknown";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users & Roles</h1>
          <p className="text-sm text-muted-foreground">Manage team members and their permissions</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading members…</div>
      ) : !members?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users size={40} className="mx-auto mb-3 opacity-40" />
            No team members found.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const branchName = branches?.find((b) => b.id === m.branch_id)?.name;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{displayName(m)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.profiles?.email || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(m.role) as any}>
                          <Shield size={12} className="mr-1" />
                          {m.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{branchName || "All"}</TableCell>
                      <TableCell>
                        <Badge variant={m.is_active ? "default" : "secondary"}>
                          {m.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(m)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Member — {editing && displayName(editing)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEMBERSHIP_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Branch</Label>
              <Select value={editForm.branch_id} onValueChange={(v) => setEditForm({ ...editForm, branch_id: v })}>
                <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All branches</SelectItem>
                  {branches?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={editForm.is_active} onCheckedChange={(v) => setEditForm({ ...editForm, is_active: v })} />
              <Label>Active</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={editForm.can_view_all_orders} onCheckedChange={(v) => setEditForm({ ...editForm, can_view_all_orders: v })} />
              <Label>Can view all orders</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMember.isPending}>
              {updateMember.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{deleteTarget && displayName(deleteTarget)}" from this tenant? They will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUsers;
