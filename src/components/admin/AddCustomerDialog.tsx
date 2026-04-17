import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, UserPlus, Mail } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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

export function AddCustomerDialog({ open, onOpenChange, tenantId, appId }: Props) {
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundProfile, setFoundProfile] = useState<FoundProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setEmail("");
    setFoundProfile(null);
    setNotFound(false);
    setSubmitting(false);
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
    if (data) setFoundProfile(data);
    else setNotFound(true);
  };

  const handleSubmit = async () => {
    const targetEmail = (foundProfile?.email ?? email).trim();
    if (!targetEmail) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-member", {
        body: {
          email: targetEmail,
          tenant_id: tenantId,
          app_id: appId,
          role: "customer",
          branch_id: null,
          can_view_all_orders: false,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.invited ? "Invitation sent" : "Customer added");
      queryClient.invalidateQueries({ queryKey: ["tenant-customers"] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add customer");
    } finally {
      setSubmitting(false);
    }
  };

  const profileName = foundProfile
    ? [foundProfile.first_name, foundProfile.last_name].filter(Boolean).join(" ") ||
      foundProfile.display_name ||
      foundProfile.email ||
      "Unknown"
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={18} /> Add Customer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Email address</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="customer@example.com"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFoundProfile(null); setNotFound(false); }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button variant="outline" size="icon" onClick={handleSearch} disabled={searching || !email.trim()}>
                <Search size={16} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Search by email. If they don't have an account, we'll send them an invite.
            </p>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || (!foundProfile && !notFound)}>
            {submitting
              ? "Saving…"
              : foundProfile
                ? "Add Customer"
                : notFound
                  ? "Send Invite"
                  : "Add Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
