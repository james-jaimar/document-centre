import { useMemo, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  useTenantMembers, useDeleteTenantMember, type TenantMemberRow,
} from "@/hooks/useTenantMembers";
import { useBranches } from "@/hooks/useBranches";
import { useUserOrderStats } from "@/hooks/useUserOrderStats";
import { useManageUser } from "@/hooks/useManageUser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users, UserPlus, Search, Loader2 } from "lucide-react";
import { AddMemberDialog } from "@/components/admin/AddMemberDialog";
import { EditMemberDialog } from "@/components/admin/EditMemberDialog";
import { MembersTable, displayName } from "@/components/admin/MembersTable";

const ROLE_FILTER_OPTIONS = ["all", "owner", "admin", "sales", "production", "accounts", "branch_manager", "store_operator"];

const ROLE_LABELS: Record<string, string> = {
  all: "All roles",
  owner: "Owner",
  admin: "Tenant Admin",
  sales: "Sales",
  production: "Production",
  accounts: "Accounts",
  branch_manager: "Branch Manager",
  store_operator: "Store Operator",
};

const AdminUsers = () => {
  const { tenantId, appId } = useTenantContext();
  const { data: members, isLoading } = useTenantMembers(tenantId, appId);
  const { data: branches } = useBranches(tenantId);
  const deleteMember = useDeleteTenantMember();
  const manageUser = useManageUser();

  const profileIds = useMemo(() => members?.map((m) => m.profile_id) ?? [], [members]);
  const { data: stats } = useUserOrderStats(tenantId, profileIds);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [editing, setEditing] = useState<TenantMemberRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TenantMemberRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    member: TenantMemberRow;
    type: "disable" | "enable" | "reset" | "invite";
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [setPasswordTarget, setSetPasswordTarget] = useState<TenantMemberRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);

  const filtered = useMemo(() => {
    if (!members) return [];
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (statusFilter === "active" && !m.is_active) return false;
      if (statusFilter === "disabled" && m.is_active) return false;
      if (!q) return true;
      const name = displayName(m).toLowerCase();
      const email = (m.profiles?.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, search, roleFilter, statusFilter]);

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await deleteMember.mutateAsync(removeTarget.id);
      toast.success("Member removed from tenant");
      setRemoveTarget(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { member, type } = confirmAction;
    try {
      const action =
        type === "disable" ? "disable_account" :
        type === "enable" ? "enable_account" :
        type === "reset" ? "force_password_reset" :
        "resend_invite";
      await manageUser.mutateAsync({
        action,
        target_profile_id: member.profile_id,
        tenant_id: member.tenant_id,
        app_id: member.app_id,
      });
      toast.success(
        type === "disable" ? "Account disabled" :
        type === "enable" ? "Account enabled" :
        type === "reset" ? "Password reset email sent" :
        "Invite resent"
      );
      setConfirmAction(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSetPassword = async () => {
    if (!setPasswordTarget || !newPassword) return;
    setSettingPassword(true);
    try {
      await manageUser.mutateAsync({
        action: "set_password",
        target_profile_id: setPasswordTarget.profile_id,
        tenant_id: setPasswordTarget.tenant_id,
        app_id: setPasswordTarget.app_id,
        new_password: newPassword,
      });
      toast.success("Password updated");
      setSetPasswordTarget(null);
      setNewPassword("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSettingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users & Roles</h1>
          <p className="text-sm text-muted-foreground">Manage team members, customers, and permissions</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus size={16} className="mr-2" /> Add Member
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLE_FILTER_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading members…</div>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users size={40} className="mx-auto mb-3 opacity-40" />
            {members?.length ? "No members match your filters." : "No team members found."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <MembersTable
              members={filtered}
              branches={branches}
              stats={stats}
              onEdit={setEditing}
              onResetPassword={(m) => setConfirmAction({ member: m, type: "reset" })}
              onResendInvite={(m) => setConfirmAction({ member: m, type: "invite" })}
              onToggleActive={(m) => setConfirmAction({ member: m, type: m.is_active ? "disable" : "enable" })}
              onRemove={setRemoveTarget}
            />
          </CardContent>
        </Card>
      )}

      <EditMemberDialog
        member={editing}
        branches={branches}
        onClose={() => setEditing(null)}
      />

      {/* Confirm action dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "disable" && "Disable account?"}
              {confirmAction?.type === "enable" && "Enable account?"}
              {confirmAction?.type === "reset" && "Send password reset?"}
              {confirmAction?.type === "invite" && "Resend invite email?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "disable" &&
                `${confirmAction && displayName(confirmAction.member)} will lose the ability to sign in until re-enabled.`}
              {confirmAction?.type === "enable" &&
                `${confirmAction && displayName(confirmAction.member)} will be able to sign in again.`}
              {confirmAction?.type === "reset" &&
                `A branded password reset email will be sent to ${confirmAction?.member.profiles?.email}.`}
              {confirmAction?.type === "invite" &&
                `A new sign-in link will be sent to ${confirmAction?.member.profiles?.email}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove from tenant */}
      <AlertDialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && displayName(removeTarget)} will lose access to this tenant.
              Their account is not deleted — they retain access to other tenants.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Member */}
      {tenantId && appId && (
        <AddMemberDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          tenantId={tenantId}
          appId={appId}
        />
      )}
    </div>
  );
};

export default AdminUsers;
