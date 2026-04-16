import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranches } from "@/hooks/useBranches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, UserPlus, AlertCircle, Mail } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const MEMBERSHIP_ROLES = ["owner", "admin", "sales", "production", "accounts", "customer"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  appId: string;
}

interface FoundProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

export function AddMemberDialog({ open, onOpenChange, tenantId, appId }: Props) {
  const { data: branches } = useBranches(tenantId);
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundProfile, setFoundProfile] = useState<FoundProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [role, setRole] = useState("customer");
  const [branchId, setBranchId] = useState("");
  const [canViewAllOrders, setCanViewAllOrders] = useState(false);

  const reset = () => {
    setEmail("");
    setFoundProfile(null);
    setNotFound(false);
    setRole("customer");
    setBranchId("");
    setCanViewAllOrders(false);
    setInviting(false);
  };

  const handleSearch = async () => {
    if (!email.trim()) return;
    setSearching(true);
    setFoundProfile(null);
    setNotFound(false);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, email, first_name, last_name")
      .ilike("email", email.trim())
      .limit(1)
      .maybeSingle();

    setSearching(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data) {
      setFoundProfile(data);
    } else {
      setNotFound(true);
    }
  };

  const handleAddExisting = async () => {
    if (!foundProfile) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-member", {
        body: {
          email: foundProfile.email,
          tenant_id: tenantId,
          app_id: appId,
          role,
          branch_id: branchId || null,
          can_view_all_orders: canViewAllOrders,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Member added");
      queryClient.invalidateQueries({ queryKey: ["tenant-members"] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add member");
    } finally {
      setInviting(false);
    }
  };

  const handleInviteNew = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-member", {
        body: {
          email: email.trim(),
          tenant_id: tenantId,
          app_id: appId,
          role,
          branch_id: branchId || null,
          can_view_all_orders: canViewAllOrders,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.invited ? "Invitation sent" : "Member added");
      queryClient.invalidateQueries({ queryKey: ["tenant-members"] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const profileName = foundProfile
    ? [foundProfile.first_name, foundProfile.last_name].filter(Boolean).join(" ") ||
      foundProfile.display_name ||
      foundProfile.email ||
      "Unknown"
    : "";

  const showRoleControls = foundProfile || notFound;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={18} /> Add Team Member
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Email lookup */}
          <div>
            <Label>Email address</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="user@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFoundProfile(null); setNotFound(false); }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button variant="outline" size="icon" onClick={handleSearch} disabled={searching || !email.trim()}>
                <Search size={16} />
              </Button>
            </div>
          </div>

          {notFound && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-md p-3">
              <Mail size={16} className="shrink-0 text-primary" />
              <span>
                No account found. An invitation email will be sent to <strong>{email.trim()}</strong>.
              </span>
            </div>
          )}

          {foundProfile && (
            <div className="bg-muted rounded-md p-3 text-sm">
              <p className="font-medium text-foreground">{profileName}</p>
              <p className="text-muted-foreground">{foundProfile.email}</p>
            </div>
          )}

          {showRoleControls && (
            <>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
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
                <Select value={branchId || "__all__"} onValueChange={(v) => setBranchId(v === "__all__" ? "" : v)}>
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
                <Switch checked={canViewAllOrders} onCheckedChange={setCanViewAllOrders} />
                <Label>Can view all orders</Label>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          {foundProfile ? (
            <Button onClick={handleAddExisting} disabled={inviting}>
              {inviting ? "Adding…" : "Add Member"}
            </Button>
          ) : notFound ? (
            <Button onClick={handleInviteNew} disabled={inviting}>
              {inviting ? "Sending…" : "Invite & Add Member"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
