import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useManageUser } from "@/hooks/useManageUser";
import { useTenantContext } from "@/hooks/useTenantContext";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string;
  initial: {
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
}

/**
 * Branch-portal version of EditCustomerDialog.
 * Goes through the `manage-user` edge function with branch_id so the
 * branch-staff authorisation path applies (instead of trying a direct
 * profiles.update, which RLS would block).
 */
export function BranchCustomerEditDialog({ open, onOpenChange, profileId, initial }: Props) {
  const { tenantId, appId, branchId } = useTenantContext();
  const manage = useManageUser();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (open) {
      setFirstName(initial.first_name ?? "");
      setLastName(initial.last_name ?? "");
      setDisplayName(initial.display_name ?? "");
      setPhone(initial.phone ?? "");
      setEmail(initial.email ?? "");
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!tenantId || !appId || !branchId) return;

    // 1. Update profile fields (name/phone)
    await manage.mutateAsync({
      action: "update_profile",
      target_profile_id: profileId,
      tenant_id: tenantId,
      app_id: appId,
      branch_id: branchId,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      display_name: displayName.trim() || null,
      phone: phone.trim() || null,
    });

    // 2. Update email separately if it changed
    const newEmail = email.trim().toLowerCase();
    const oldEmail = (initial.email ?? "").trim().toLowerCase();
    if (newEmail && newEmail !== oldEmail) {
      await manage.mutateAsync({
        action: "update_email",
        target_profile_id: profileId,
        tenant_id: tenantId,
        app_id: appId,
        branch_id: branchId,
        new_email: newEmail,
      });
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Last name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={manage.isPending}>
            {manage.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
