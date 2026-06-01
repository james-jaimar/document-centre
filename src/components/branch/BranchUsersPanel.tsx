import { useMemo, useState } from "react";
import {
  useTenantMembers, useDeleteTenantMember, type TenantMemberRow,
} from "@/hooks/useTenantMembers";
import { useBranches } from "@/hooks/useBranches";
import { useManageUser } from "@/hooks/useManageUser";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { UserPlus, MoreVertical, Trash2, KeyRound, Lock, Mail, UserX, UserCheck, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { displayName } from "@/components/admin/MembersTable";

interface Props {
  tenantId: string;
  appId: string;
  branchId: string;
}

export function BranchUsersPanel({ tenantId, appId, branchId }: Props) {
  const { data: members, isLoading } = useTenantMembers(tenantId, appId);
  const { data: branches } = useBranches(tenantId);
  const branch = branches?.find((b) => b.id === branchId);
  const deleteMember = useDeleteTenantMember();
  const manageUser = useManageUser();
  const qc = useQueryClient();

  // Filter to branch staff only
  const filtered = useMemo(
    () => (members ?? []).filter(
      (m) => m.branch_id === branchId && (m.role === "branch_manager" || m.role === "store_operator")
    ),
    [members, branchId]
  );

  const [removeTarget, setRemoveTarget] = useState<TenantMemberRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ member: TenantMemberRow; type: "disable" | "enable" | "reset" | "invite" } | null>(null);
  const [setPasswordTarget, setSetPasswordTarget] = useState<TenantMemberRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [inviting, setInviting] = useState(false);

  const resetInvite = () => { setFirst(""); setLast(""); setEmail(""); setPhone(""); setSendEmail(true); };

  const submitInvite = async () => {
    if (!first.trim() || !last.trim() || !email.trim()) {
      toast.error("First name, last name, and email are required");
      return;
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-member", {
        body: {
          email: email.trim(),
          first_name: first.trim(),
          last_name: last.trim(),
          phone: phone.trim() || null,
          tenant_id: tenantId,
          app_id: appId,
          role: "store_operator",
          branch_id: branchId,
          send_email: sendEmail,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(sendEmail ? "Invitation sent" : "Operator added");
      qc.invalidateQueries({ queryKey: ["tenant-members"] });
      resetInvite();
      setInviteOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add operator");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await deleteMember.mutateAsync(removeTarget.id);
      toast.success("Removed from branch");
      setRemoveTarget(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { member, type } = confirmAction;
    try {
      const action =
        type === "disable" ? "disable_account" :
        type === "enable" ? "enable_account" :
        type === "invite" ? "resend_invite" :
        "force_password_reset";
      await manageUser.mutateAsync({
        action, target_profile_id: member.profile_id, tenant_id: member.tenant_id, app_id: member.app_id,
      });
      toast.success(
        type === "disable" ? "Account disabled" :
        type === "enable" ? "Account enabled" :
        type === "invite" ? "Invite resent" :
        "Reset email sent"
      );
      setConfirmAction(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSetPassword = async () => {
    if (!setPasswordTarget || newPassword.length < 6) return;
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
    } catch (e: any) { toast.error(e.message); }
    finally { setSettingPassword(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Branch Staff</CardTitle>
          <CardDescription>
            Manage the people who work at {branch?.name || "this branch"}. Store operators handle day-to-day orders and production.
          </CardDescription>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Invite store operator
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            No branch staff yet. Invite your first store operator above.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{displayName(m)}</TableCell>
                  <TableCell className="text-muted-foreground">{m.profiles?.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={m.role === "branch_manager" ? "default" : "secondary"}>
                      {m.role === "branch_manager" ? "Branch Manager" : "Store Operator"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.is_active ? "default" : "secondary"}>{m.is_active ? "Active" : "Disabled"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical size={14} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 bg-popover">
                        <DropdownMenuItem onClick={() => setConfirmAction({ member: m, type: "reset" })}>
                          <KeyRound size={14} className="mr-2" /> Send password reset
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSetPasswordTarget(m); setNewPassword(""); }}>
                          <Lock size={14} className="mr-2" /> Set password manually
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {m.is_active ? (
                          <DropdownMenuItem onClick={() => setConfirmAction({ member: m, type: "disable" })}>
                            <UserX size={14} className="mr-2" /> Disable account
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setConfirmAction({ member: m, type: "enable" })}>
                            <UserCheck size={14} className="mr-2" /> Enable account
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {m.role !== "branch_manager" && (
                          <DropdownMenuItem onClick={() => setRemoveTarget(m)} className="text-destructive">
                            <Trash2 size={14} className="mr-2" /> Remove from branch
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { if (!o) resetInvite(); setInviteOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus size={18} /> Invite store operator</DialogTitle>
            <DialogDescription>
              They'll be scoped to this branch only and can handle the day-to-day order workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First name *</Label>
                <Input value={first} onChange={(e) => setFirst(e.target.value)} />
              </div>
              <div>
                <Label>Last name *</Label>
                <Input value={last} onChange={(e) => setLast(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
            </div>
            <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
              <Switch checked={sendEmail} onCheckedChange={setSendEmail} className="mt-0.5" />
              <div className="space-y-0.5">
                <Label className="cursor-pointer">Send welcome email</Label>
                <p className="text-xs text-muted-foreground">Off lets you add them silently and share credentials manually.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetInvite(); setInviteOpen(false); }}>Cancel</Button>
            <Button onClick={submitInvite} disabled={inviting}>
              {inviting && <Loader2 size={14} className="mr-2 animate-spin" />}
              {sendEmail ? "Send invitation" : "Add operator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm action */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "disable" && "Disable account?"}
              {confirmAction?.type === "enable" && "Enable account?"}
              {confirmAction?.type === "reset" && "Send password reset?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "disable" && `${confirmAction && displayName(confirmAction.member)} will lose access until re-enabled.`}
              {confirmAction?.type === "enable" && `${confirmAction && displayName(confirmAction.member)} will be able to sign in again.`}
              {confirmAction?.type === "reset" && `A reset email will be sent to ${confirmAction?.member.profiles?.email}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove */}
      <AlertDialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from branch?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && displayName(removeTarget)} will lose access to this branch. Their account is not deleted.
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

      {/* Set password */}
      <Dialog open={!!setPasswordTarget} onOpenChange={(o) => { if (!o) { setSetPasswordTarget(null); setNewPassword(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set password manually</DialogTitle>
            <DialogDescription>
              Assign a new password for <strong>{setPasswordTarget && displayName(setPasswordTarget)}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-1.5">
            <Label>New password</Label>
            <Input type="text" placeholder="At least 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
            {newPassword.length > 0 && newPassword.length < 6 && (
              <p className="text-xs text-destructive">Password must be at least 6 characters.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSetPasswordTarget(null); setNewPassword(""); }}>Cancel</Button>
            <Button onClick={handleSetPassword} disabled={settingPassword || newPassword.length < 6}>
              {settingPassword ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Setting…</> : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
