import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Loader2, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionVerbose } from "@/lib/invokeEdgeFunctionVerbose";
import { useBranches } from "@/hooks/useBranches";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useCustomerCompanies } from "@/hooks/useCustomerCompanies";
import { CompanyFormDialog } from "@/components/customers/CompanyFormDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  appId: string;
  /** When set, the customer is created directly against this company and the picker is hidden. */
  lockedCompanyId?: string | null;
  lockedCompanyName?: string | null;
  onCreated?: (profileId: string) => void;
}

const NO_BRANCH = "__none__";
const NO_COMPANY = "__nocompany__";

export function AddCustomerDialog({
  open, onOpenChange, tenantId, appId, lockedCompanyId, lockedCompanyName, onCreated,
}: Props) {
  const qc = useQueryClient();
  const { data: branches = [] } = useBranches(tenantId);
  const { startImpersonation } = useImpersonation();
  const { data: companies = [] } = useCustomerCompanies();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [branchId, setBranchId] = useState<string>(NO_BRANCH);
  const [isTrade, setIsTrade] = useState(false);
  const [accountNo, setAccountNo] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [impersonateAfter, setImpersonateAfter] = useState(false);
  const [companyId, setCompanyId] = useState<string>(NO_COMPANY);
  const [companyFormOpen, setCompanyFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setEmail(""); setFirstName(""); setLastName(""); setPhone("");
    setBranchId(NO_BRANCH); setIsTrade(false); setAccountNo(""); setCompanyId(NO_COMPANY);
    setSendInvite(true); setImpersonateAfter(false);
  };

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      const targetBranch = branchId === NO_BRANCH ? null : branchId;
      const res = await invokeEdgeFunctionVerbose<{
        ok: boolean; profile_id: string; created: boolean; already_member?: boolean; warning?: string;
      }>("create-customer", {
        email: e,
        tenant_id: tenantId,
        branch_id: targetBranch,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        send_invite: sendInvite,
      });
      if (!res.ok || !res.data?.profile_id) {
        throw new Error(res.error || "Customer creation failed");
      }
      const payload = res.data;

      // Trade status / MIS reference / company link live on the membership row.
      const linkedCompany = lockedCompanyId ?? (companyId === NO_COMPANY ? null : companyId);
      if (isTrade || accountNo.trim() || linkedCompany) {
        const { error: mErr } = await (supabase as any)
          .from("tenant_memberships")
          .update({
            is_trade_customer: isTrade,
            mis_account_number: accountNo.trim() || null,
            company_id: linkedCompany,
          })
          .eq("tenant_id", tenantId)
          .eq("app_id", appId)
          .eq("profile_id", payload.profile_id)
          .eq("role", "customer");
        if (mErr) toast.error(`Customer saved, but trade settings failed: ${mErr.message}`);
      }

      if (payload.already_member) {
        toast.warning("This email is already a customer here", {
          description: "We updated the existing customer instead of creating a duplicate.",
        });
      }
      toast.success(
        payload.created ? "Customer created" : "Existing customer linked to this tenant",
        {
          description: sendInvite
            ? (payload.warning
                ? `Saved, but the welcome email failed: ${payload.warning}`
                : "A welcome email with a 'set your password' link has been sent.")
            : "No welcome email sent.",
        },
      );

      qc.invalidateQueries({ queryKey: ["tenant-customers"] });
      qc.invalidateQueries({ queryKey: ["branchCustomers"] });
      qc.invalidateQueries({ queryKey: ["customer-companies"] });
      onCreated?.(payload.profile_id);

      if (impersonateAfter) {
        try {
          await startImpersonation({
            target_profile_id: payload.profile_id,
            tenant_id: tenantId,
            branch_id: targetBranch,
            return_to: window.location.pathname + window.location.search,
            redirect_to: "/",
          });
        } catch (err: any) {
          toast.error(err?.message ?? "Could not log in as customer");
        }
      }

      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add customer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!submitting) { if (!v) reset(); onOpenChange(v); } }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Add customer
          </DialogTitle>
          <DialogDescription>
            Create a customer account for this tenant. You can set them up fully
            manually, or send them a "set your password" email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div>
            <Label htmlFor="ac-email">Email *</Label>
            <Input
              id="ac-email"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ac-first">First name</Label>
              <Input id="ac-first" value={firstName} onChange={(ev) => setFirstName(ev.target.value)} />
            </div>
            <div>
              <Label htmlFor="ac-last">Last name</Label>
              <Input id="ac-last" value={lastName} onChange={(ev) => setLastName(ev.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ac-phone">Phone</Label>
              <Input id="ac-phone" value={phone} onChange={(ev) => setPhone(ev.target.value)} />
            </div>
            <div>
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Tenant-wide" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BRANCH}>Tenant-wide (no branch)</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {lockedCompanyId ? (
            <div className="rounded-md border border-border p-3 text-sm">
              <span className="text-muted-foreground">Company: </span>
              <span className="font-medium">{lockedCompanyName ?? "Selected company"}</span>
            </div>
          ) : (
          <div>
            <Label>Company</Label>
            <div className="flex gap-2">
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="No company (individual)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COMPANY}>No company (individual)</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={() => setCompanyFormOpen(true)}>
                <Building2 className="h-4 w-4 mr-1" /> New
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Company trade status, account number and credit terms apply to every linked user.
            </p>
          </div>
          )}

          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Trade customer</p>
                <p className="text-xs text-muted-foreground">
                  Shows trade pack prices instead of consumer prices.
                </p>
              </div>
              <Switch checked={isTrade} onCheckedChange={setIsTrade} />
            </div>
            <div>
              <Label htmlFor="ac-acc">Account number (MIS)</Label>
              <Input
                id="ac-acc"
                placeholder="e.g. IMP0421"
                value={accountNo}
                onChange={(ev) => setAccountNo(ev.target.value)}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer pt-1">
            <Checkbox checked={sendInvite} onCheckedChange={(v) => setSendInvite(v === true)} />
            <span>Send welcome email now (secure link to set their password)</span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={impersonateAfter} onCheckedChange={(v) => setImpersonateAfter(v === true)} />
            <span>Log in as this customer after creating (to build an order on their behalf)</span>
          </label>
        </div>

        <CompanyFormDialog
          open={companyFormOpen}
          onOpenChange={setCompanyFormOpen}
          branchId={branchId === NO_BRANCH ? null : branchId}
          onSaved={(c) => setCompanyId(c.id)}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !email.trim()}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
