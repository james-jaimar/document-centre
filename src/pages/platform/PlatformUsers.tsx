import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlatformUsers, type PlatformUserRow } from "@/hooks/usePlatformUsers";
import { useManageUser } from "@/hooks/useManageUser";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Search, MoreVertical, KeyRound, UserX, UserCheck, Trash2, ArrowRight, Users,
  ShieldOff, UserPlus, Pencil, Mail, X,
} from "lucide-react";
import { buildAdminPath } from "@/lib/adminRouting";
import { InvitePlatformAdminDialog } from "@/components/platform/InvitePlatformAdminDialog";
import { EditPlatformUserDialog } from "@/components/platform/EditPlatformUserDialog";

const displayName = (u: PlatformUserRow) => {
  if (u.first_name || u.last_name) return [u.first_name, u.last_name].filter(Boolean).join(" ");
  return u.display_name || u.email || "Unknown";
};

type ConfirmType = "disable" | "enable" | "reset" | "resend" | "delete" | "revoke" | "remove_membership";

interface ConfirmAction {
  user: PlatformUserRow;
  type: ConfirmType;
  membership_id?: string;
  membership_label?: string;
}

const PlatformUsers = () => {
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUserRow | null>(null);
  const { data: users, isLoading } = usePlatformUsers(search);
  const manageUser = useManageUser();
  const { setOverrideTenantId } = useTenantContext();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { user, type, membership_id } = confirmAction;
    try {
      if (type === "remove_membership") {
        if (!membership_id) return;
        await manageUser.mutateAsync({
          action: "remove_membership",
          target_profile_id: user.profile_id,
          membership_id,
        });
        toast.success("Tenant access removed");
      } else {
        const action =
          type === "disable" ? "disable_account" :
          type === "enable" ? "enable_account" :
          type === "reset" ? "force_password_reset" :
          type === "resend" ? "resend_invite" :
          type === "revoke" ? "revoke_platform_admin" :
          "delete_account";
        await manageUser.mutateAsync({
          action,
          target_profile_id: user.profile_id,
        });
        toast.success(
          type === "disable" ? "Account disabled" :
          type === "enable" ? "Account enabled" :
          type === "reset" ? "Password reset email sent" :
          type === "resend" ? "Invite resent" :
          type === "revoke" ? "Platform admin access revoked" :
          "Account deleted"
        );
      }
      setConfirmAction(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleImpersonateTenant = (tenantId: string) => {
    setOverrideTenantId(tenantId);
    navigate(buildAdminPath("/admin", tenantId));
  };

  const confirmTitle: Record<ConfirmType, string> = {
    disable: "Disable account?",
    enable: "Enable account?",
    reset: "Send password reset?",
    resend: "Resend invite email?",
    revoke: "Revoke platform admin access?",
    delete: "Delete account permanently?",
    remove_membership: "Remove tenant access?",
  };

  const confirmDescription = (a: ConfirmAction) => {
    const name = displayName(a.user);
    switch (a.type) {
      case "delete":
        return `${name} will be permanently removed from all tenants. This cannot be undone.`;
      case "revoke":
        return `${name} will lose access to the platform admin area. Their account and any tenant memberships remain intact.`;
      case "remove_membership":
        return `${name} will lose access to ${a.membership_label}. Their account and other tenant memberships remain intact.`;
      case "resend":
        return `Send a fresh sign-in email to ${a.user.email}.`;
      default:
        return `${name} (${a.user.email})`;
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Platform Users</h1>
            <p className="text-sm text-muted-foreground">
              Document Centre platform administrators. Tenant users are managed within each tenant.
            </p>
          </div>
          <Button onClick={() => setInviteOpen(true)} className="gap-2">
            <UserPlus size={14} />
            Invite Platform Admin
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading users…</div>
        ) : !users?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users size={40} className="mx-auto mb-3 opacity-40" />
              No platform admins found.
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
                    <TableHead>Tenant Access</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const isSelf = currentUser?.id === u.profile_id;
                    return (
                      <TableRow key={u.profile_id}>
                        <TableCell className="font-medium">
                          {displayName(u)}
                          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="default" className="bg-primary/15 text-primary hover:bg-primary/15 border-primary/30">
                            Platform Admin
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.memberships.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              u.memberships.map((m) => (
                                <span
                                  key={m.membership_id}
                                  className="group inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 pl-2 pr-1 py-0.5 text-xs hover:bg-muted hover:border-primary/40 transition-colors"
                                >
                                  <button
                                    onClick={() => handleImpersonateTenant(m.tenant_id)}
                                    className="inline-flex items-center gap-1"
                                    title={`Open ${m.tenant_name} as this tenant`}
                                  >
                                    <span className="font-medium">{m.tenant_name}</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="text-muted-foreground">{m.role}</span>
                                    <ArrowRight size={10} className="opacity-0 group-hover:opacity-100" />
                                  </button>
                                  <button
                                    onClick={() => setConfirmAction({
                                      user: u,
                                      type: "remove_membership",
                                      membership_id: m.membership_id,
                                      membership_label: `${m.tenant_name} (${m.role})`,
                                    })}
                                    className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    title={`Remove ${m.tenant_name} access`}
                                  >
                                    <X size={10} />
                                  </button>
                                </span>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.is_active ? "default" : "secondary"}>
                            {u.is_active ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(u.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-popover">
                              <DropdownMenuItem onClick={() => setEditingUser(u)}>
                                <Pencil size={14} className="mr-2" /> Edit user
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setConfirmAction({ user: u, type: "reset" })}>
                                <KeyRound size={14} className="mr-2" /> Force password reset
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setConfirmAction({ user: u, type: "resend" })}>
                                <Mail size={14} className="mr-2" /> Resend invite
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {u.is_active ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <DropdownMenuItem
                                        onClick={() => setConfirmAction({ user: u, type: "disable" })}
                                        disabled={isSelf}
                                      >
                                        <UserX size={14} className="mr-2" /> Disable account
                                      </DropdownMenuItem>
                                    </span>
                                  </TooltipTrigger>
                                  {isSelf && <TooltipContent>Cannot perform on your own account</TooltipContent>}
                                </Tooltip>
                              ) : (
                                <DropdownMenuItem onClick={() => setConfirmAction({ user: u, type: "enable" })}>
                                  <UserCheck size={14} className="mr-2" /> Enable account
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <DropdownMenuItem
                                      onClick={() => setConfirmAction({ user: u, type: "revoke" })}
                                      className="text-warning focus:text-warning"
                                      disabled={isSelf}
                                    >
                                      <ShieldOff size={14} className="mr-2" /> Revoke platform admin
                                    </DropdownMenuItem>
                                  </span>
                                </TooltipTrigger>
                                {isSelf && <TooltipContent>Cannot perform on your own account</TooltipContent>}
                              </Tooltip>
                              <DropdownMenuSeparator />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <DropdownMenuItem
                                      onClick={() => setConfirmAction({ user: u, type: "delete" })}
                                      className="text-destructive"
                                      disabled={isSelf}
                                    >
                                      <Trash2 size={14} className="mr-2" /> Delete account
                                    </DropdownMenuItem>
                                  </span>
                                </TooltipTrigger>
                                {isSelf && <TooltipContent>Cannot perform on your own account</TooltipContent>}
                              </Tooltip>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmAction && confirmTitle[confirmAction.type]}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction && confirmDescription(confirmAction)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirm}
                className={
                  confirmAction?.type === "delete"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : ""
                }
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <InvitePlatformAdminDialog open={inviteOpen} onOpenChange={setInviteOpen} />
        <EditPlatformUserDialog
          user={editingUser}
          open={!!editingUser}
          onOpenChange={(open) => !open && setEditingUser(null)}
        />
      </div>
    </TooltipProvider>
  );
};

export default PlatformUsers;
