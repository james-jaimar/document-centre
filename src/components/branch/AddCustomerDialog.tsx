import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, UserPlus } from "lucide-react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useQueryClient } from "@tanstack/react-query";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { toast } from "@/hooks/use-toast";
import { invokeEdgeFunctionVerbose } from "@/lib/invokeEdgeFunctionVerbose";
import { useBranch } from "@/contexts/BranchContext";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AddCustomerDialog({ open, onOpenChange }: Props) {
  const { tenantId, branchId } = useTenantContext();
  const { branches } = useBranch();
  const qc = useQueryClient();
  const { startImpersonation } = useImpersonation();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [impersonateAfter, setImpersonateAfter] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentBranch = branches.find((b) => b.id === branchId);
  const branchSlug = currentBranch ? (currentBranch.url_slug || currentBranch.slug) : null;

  const reset = () => {
    setEmail(""); setFirstName(""); setLastName(""); setPhone("");
    setSendInvite(true); setImpersonateAfter(false);
  };

  const submit = async () => {
    if (!tenantId) return;
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await invokeEdgeFunctionVerbose<{
        ok: boolean; profile_id: string; created: boolean; warning?: string;
      }>("create-customer", {
        email: e,
        tenant_id: tenantId,
        branch_id: branchId ?? null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        send_invite: sendInvite,
      });
      if (!res.ok || !res.data?.profile_id) {
        throw new Error(res.error || "Customer creation failed");
      }
      const payload = res.data;

      toast({
        title: payload.created ? "Customer added" : "Existing customer linked to your branch",
        description: sendInvite
          ? (payload.warning ? `Saved, but invite email failed: ${payload.warning}` : "Welcome email sent.")
          : "No invite email sent.",
      });

      qc.invalidateQueries({ queryKey: ["branchCustomers"] });

      if (impersonateAfter) {
        const path = branchSlug ? `/${branchSlug}` : "/";
        try {
          await startImpersonation({
            target_profile_id: payload.profile_id,
            tenant_id: tenantId,
            branch_id: branchId ?? null,
            return_to: window.location.pathname + window.location.search,
            redirect_to: path,
          });
        } catch (e: any) {
          toast({ title: "Could not log in as customer", description: e?.message, variant: "destructive" });
        }
      }
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Failed to add customer", description: err?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Add customer
          </DialogTitle>
          <DialogDescription>
            Create a customer account at your branch. They'll receive a "set your password"
            email if you choose to send the invite.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="cu-email">Email *</Label>
            <Input id="cu-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cu-first">First name</Label>
              <Input id="cu-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cu-last">Last name</Label>
              <Input id="cu-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="cu-phone">Phone</Label>
            <Input id="cu-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer pt-2">
            <Checkbox checked={sendInvite}
              onCheckedChange={(v) => setSendInvite(v === true)} />
            <span>Send "set your password" email now</span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={impersonateAfter}
              onCheckedChange={(v) => setImpersonateAfter(v === true)} />
            <span>Log in as this customer after creating (to build an order on their behalf)</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !email}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
