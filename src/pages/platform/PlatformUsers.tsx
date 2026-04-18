import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlatformUsers, type PlatformUserRow } from "@/hooks/usePlatformUsers";
import { useManageUser } from "@/hooks/useManageUser";
import { useTenantContext } from "@/hooks/useTenantContext";
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
import { toast } from "sonner";
import { Search, MoreVertical, KeyRound, UserX, UserCheck, Trash2, ArrowRight, Users } from "lucide-react";
import { buildAdminPath } from "@/lib/adminRouting";

const displayName = (u: PlatformUserRow) => {
  if (u.first_name || u.last_name) return [u.first_name, u.last_name].filter(Boolean).join(" ");
  return u.display_name || u.email || "Unknown";
};

const PlatformUsers = () => {
  const [search, setSearch] = useState("");
  const { data: users, isLoading } = usePlatformUsers(search);
  const manageUser = useManageUser();
  const { setOverrideTenantId } = useTenantContext();
  const navigate = useNavigate();

  const [confirmAction, setConfirmAction] = useState<{
    user: PlatformUserRow;
    type: "disable" | "enable" | "reset" | "delete";
  } | null>(null);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { user, type } = confirmAction;
    try {
      const action =
        type === "disable" ? "disable_account" :
        type === "enable" ? "enable_account" :
        type === "reset" ? "force_password_reset" :
        "delete_account";
      await manageUser.mutateAsync({
        action,
        target_profile_id: user.profile_id,
      });
      toast.success(
        type === "disable" ? "Account disabled" :
        type === "enable" ? "Account enabled" :
        type === "reset" ? "Password reset email sent" :
        "Account deleted"
      );
      setConfirmAction(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleImpersonateTenant = (tenantId: string) => {
    setOverrideTenantId(tenantId);
    navigate(buildAdminPath("/admin", tenantId));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Users</h1>
        <p className="text-sm text-muted-foreground">
          Every user across every tenant. Platform admin operations only.
        </p>
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
            No users found.
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
                  <TableHead>Tenants & Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.profile_id}>
                    <TableCell className="font-medium">{displayName(u)}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.memberships.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No memberships</span>
                        ) : (
                          u.memberships.map((m) => (
                            <button
                              key={m.membership_id}
                              onClick={() => handleImpersonateTenant(m.tenant_id)}
                              className="group inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs hover:bg-muted hover:border-primary/40 transition-colors"
                              title={`Open ${m.tenant_name} as this tenant`}
                            >
                              <span className="font-medium">{m.tenant_name}</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">{m.role}</span>
                              <ArrowRight size={10} className="opacity-0 group-hover:opacity-100" />
                            </button>
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
                          <DropdownMenuItem onClick={() => setConfirmAction({ user: u, type: "reset" })}>
                            <KeyRound size={14} className="mr-2" /> Force password reset
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {u.is_active ? (
                            <DropdownMenuItem onClick={() => setConfirmAction({ user: u, type: "disable" })}>
                              <UserX size={14} className="mr-2" /> Disable account
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => setConfirmAction({ user: u, type: "enable" })}>
                              <UserCheck size={14} className="mr-2" /> Enable account
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setConfirmAction({ user: u, type: "delete" })}
                            className="text-destructive"
                          >
                            <Trash2 size={14} className="mr-2" /> Delete account
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "disable" && "Disable account?"}
              {confirmAction?.type === "enable" && "Enable account?"}
              {confirmAction?.type === "reset" && "Send password reset?"}
              {confirmAction?.type === "delete" && "Delete account permanently?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "delete"
                ? `${confirmAction && displayName(confirmAction.user)} will be permanently removed from all tenants. This cannot be undone.`
                : `${confirmAction && displayName(confirmAction.user)} (${confirmAction?.user.email})`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={confirmAction?.type === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PlatformUsers;
