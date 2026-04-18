import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useUpdateTenantMember, type TenantMemberRow } from "@/hooks/useTenantMembers";
import { useManageUser } from "@/hooks/useManageUser";

const MEMBERSHIP_ROLES = ["owner", "admin", "sales", "production", "accounts", "customer"];

interface Props {
  member: TenantMemberRow | null;
  branches: Array<{ id: string; name: string }> | undefined;
  onClose: () => void;
}

export function EditMemberDialog({ member, branches, onClose }: Props) {
  const updateMember = useUpdateTenantMember();
  const manageUser = useManageUser();
  const [form, setForm] = useState({
    role: member?.role ?? "",
    branch_id: member?.branch_id ?? "",
    is_active: member?.is_active ?? true,
    can_view_all_orders: member?.can_view_all_orders ?? false,
  });
  const [emailForm, setEmailForm] = useState(member?.profiles?.email ?? "");

  // Reset form when member changes
  if (member && form.role !== member.role && form.role === "") {
    setForm({
      role: member.role,
      branch_id: member.branch_id ?? "",
      is_active: member.is_active,
      can_view_all_orders: member.can_view_all_orders,
    });
    setEmailForm(member.profiles?.email ?? "");
  }

  const handleSave = async () => {
    if (!member) return;
    try {
      await updateMember.mutateAsync({
        id: member.id,
        role: form.role,
        branch_id: form.branch_id || null,
        is_active: form.is_active,
        can_view_all_orders: form.can_view_all_orders,
      });

      const cleanEmail = emailForm.trim().toLowerCase();
      if (cleanEmail && cleanEmail !== (member.profiles?.email ?? "").toLowerCase()) {
        await manageUser.mutateAsync({
          action: "update_email",
          target_profile_id: member.profile_id,
          tenant_id: member.tenant_id,
          app_id: member.app_id,
          new_email: cleanEmail,
        });
      }

      toast.success("Member updated");
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const displayName = member?.profiles
    ? [member.profiles.first_name, member.profiles.last_name].filter(Boolean).join(" ")
      || member.profiles.display_name
      || member.profiles.email
      || "Unknown"
    : "";

  return (
    <Dialog open={!!member} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Member — {displayName}</DialogTitle>
          <DialogDescription>Update role, branch, status, and contact email.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={emailForm}
              onChange={(e) => setEmailForm(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
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
            <Select
              value={form.branch_id || "__all__"}
              onValueChange={(v) => setForm({ ...form, branch_id: v === "__all__" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All branches</SelectItem>
                {branches?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <Label>Active membership</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.can_view_all_orders}
              onCheckedChange={(v) => setForm({ ...form, can_view_all_orders: v })}
            />
            <Label>Can view all orders</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMember.isPending || manageUser.isPending}>
            {updateMember.isPending || manageUser.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
