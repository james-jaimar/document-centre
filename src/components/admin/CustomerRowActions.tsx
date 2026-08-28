import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  KeyRound, MoreHorizontal, Pencil, Trash2, UserCheck, UserMinus, UserX, Lock,
} from "lucide-react";
import { useManageUser } from "@/hooks/useManageUser";
import { EditCustomerDialog } from "@/components/admin/EditCustomerDialog";

export interface CustomerRowActionsTarget {
  profile_id: string;
  membership_id?: string | null;
  email?: string | null;
  is_active?: boolean;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  phone?: string | null;
}

interface Props {
  customer: CustomerRowActionsTarget;
  tenantId?: string | null;
  appId?: string | null;
  /** Called after a destructive action that removes the customer from view. */
  onRemoved?: () => void;
  trigger?: React.ReactNode;
}

export function CustomerRowActions({ customer, tenantId, appId, onRemoved, trigger }: Props) {
  const qc = useQueryClient();
  const manage = useManageUser();
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tenant-customers"] });
    qc.invalidateQueries({ queryKey: ["tenant-customer"] });
    qc.invalidateQueries({ queryKey: ["branchCustomers"] });
    qc.invalidateQueries({ queryKey: ["customer-companies"] });
  };

  const run = (input: Parameters<typeof manage.mutate>[0], removed = false) =>
    manage.mutate(
      { tenant_id: tenantId ?? null, app_id: appId ?? null, ...input },
      {
        onSuccess: () => {
          refresh();
          if (removed) onRemoved?.();
        },
      },
    );


  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Edit details
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!customer.email} onClick={() => setResetOpen(true)}>
            <KeyRound className="h-4 w-4 mr-2" /> Send password email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setPassword(""); setPwOpen(true); }}>
            <Lock className="h-4 w-4 mr-2" /> Set password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {customer.is_active === false ? (
            <DropdownMenuItem
              onClick={() => run({ action: "enable_account", target_profile_id: customer.profile_id })}
            >
              <UserCheck className="h-4 w-4 mr-2" /> Enable account
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => run({ action: "disable_account", target_profile_id: customer.profile_id })}
            >
              <UserX className="h-4 w-4 mr-2" /> Disable account
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setRemoveOpen(true)}>
            <UserMinus className="h-4 w-4 mr-2" /> Remove from this tenant
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete customer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditCustomerDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profileId={customer.profile_id}
        initial={{
          first_name: customer.first_name,
          last_name: customer.last_name,
          display_name: customer.display_name,
          phone: customer.phone,
          email: customer.email,
        }}
      />

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send password email?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll email <strong>{customer.email}</strong> a link to set a new password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={manage.isPending}
              onClick={() => run({ action: "force_password_reset", target_profile_id: customer.profile_id })}
            >
              Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set customer password</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New password</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <p className="text-xs text-muted-foreground">
              Hand these credentials to the customer directly. They can change it later.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwOpen(false)}>Cancel</Button>
            <Button
              disabled={password.trim().length < 8 || manage.isPending}
              onClick={() =>
                manage.mutate(
                  {
                    action: "set_password",
                    target_profile_id: customer.profile_id,
                    new_password: password,
                    tenant_id: tenantId ?? null,
                    app_id: appId ?? null,
                  },

                  { onSuccess: () => { setPwOpen(false); refresh(); } },
                )
              }
            >
              {manage.isPending ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove customer from this tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              Their account and order history stay intact — they simply no longer appear
              in this tenant's customer list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                run({
                  action: "remove_membership",
                  target_profile_id: customer.profile_id,
                  membership_id: customer.membership_id ?? null,
                  tenant_id: tenantId ?? null,
                  app_id: appId ?? null,
                }, true)
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this customer permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the login account for <strong>{customer.email ?? "this customer"}</strong>.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                run({ action: "delete_account", target_profile_id: customer.profile_id }, true)
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
