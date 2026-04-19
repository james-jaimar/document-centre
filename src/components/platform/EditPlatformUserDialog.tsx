import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useManageUser } from "@/hooks/useManageUser";
import { toast } from "sonner";
import type { PlatformUserRow } from "@/hooks/usePlatformUsers";

interface Props {
  user: PlatformUserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPlatformUserDialog({ user, open, onOpenChange }: Props) {
  const manageUser = useManageUser();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name ?? "");
      setLastName(user.last_name ?? "");
      setDisplayName(user.display_name ?? "");
      setEmail(user.email ?? "");
      setOriginalEmail(user.email ?? "");
    }
  }, [user]);

  if (!user) return null;

  const handleSave = async () => {
    try {
      // Update profile fields if any changed
      const profileChanged =
        firstName !== (user.first_name ?? "") ||
        lastName !== (user.last_name ?? "") ||
        displayName !== (user.display_name ?? "");

      if (profileChanged) {
        await manageUser.mutateAsync({
          action: "update_profile",
          target_profile_id: user.profile_id,
          first_name: firstName || null,
          last_name: lastName || null,
          display_name: displayName || null,
        });
      }

      // Update email separately if changed
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail && cleanEmail !== originalEmail.toLowerCase()) {
        await manageUser.mutateAsync({
          action: "update_email",
          target_profile_id: user.profile_id,
          new_email: cleanEmail,
        });
      }

      if (!profileChanged && cleanEmail === originalEmail.toLowerCase()) {
        toast.info("No changes to save");
        return;
      }

      toast.success("User updated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update user");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update name and email. Changing the email immediately updates the sign-in address.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={manageUser.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={manageUser.isPending}>
            {manageUser.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
