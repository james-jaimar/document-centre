import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useCustomerCompanies } from "@/hooks/useCustomerCompanies";
import { toast } from "sonner";

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

const NONE = "__none__";

export function EditCustomerDialog({ open, onOpenChange, profileId, initial }: Props) {
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();
  const { data: companies = [] } = useCustomerCompanies();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [companyId, setCompanyId] = useState<string>(NONE);
  const [jobTitle, setJobTitle] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isTrade, setIsTrade] = useState(false);
  const [accountNo, setAccountNo] = useState("");

  const membershipQuery = useQuery({
    queryKey: ["customer-membership", tenantId, appId, profileId],
    enabled: open && !!tenantId && !!appId && !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("id, company_id, job_title, is_primary_contact, is_trade_customer, mis_account_number")
        .eq("tenant_id", tenantId!)
        .eq("app_id", appId!)
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
  });
  const membership = membershipQuery.data;

  useEffect(() => {
    if (open) {
      setFirstName(initial.first_name ?? "");
      setLastName(initial.last_name ?? "");
      setDisplayName(initial.display_name ?? "");
      setPhone(initial.phone ?? "");
      setEmail(initial.email ?? "");
    }
  }, [open, initial]);

  useEffect(() => {
    if (open && membership) {
      setCompanyId(membership.company_id ?? NONE);
      setJobTitle(membership.job_title ?? "");
      setIsPrimary(!!membership.is_primary_contact);
      setIsTrade(!!membership.is_trade_customer);
      setAccountNo(membership.mis_account_number ?? "");
    }
  }, [open, membership]);

  const company = companies.find((c) => c.id === companyId) ?? null;

  const save = useMutation({
    mutationFn: async () => {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          display_name: displayName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
        })
        .eq("id", profileId);
      if (pErr) throw pErr;

      if (membership?.id) {
        const nextCompanyId = companyId === NONE ? null : companyId;
        const primary = nextCompanyId ? isPrimary : false;
        if (primary && nextCompanyId) {
          const { error: clearErr } = await supabase
            .from("tenant_memberships")
            .update({ is_primary_contact: false })
            .eq("company_id", nextCompanyId);
          if (clearErr) throw clearErr;
        }
        const { error: mErr } = await supabase
          .from("tenant_memberships")
          .update({
            company_id: nextCompanyId,
            job_title: jobTitle.trim() || null,
            is_primary_contact: primary,
            is_trade_customer: isTrade,
            mis_account_number: accountNo.trim() || null,
          } as any)
          .eq("id", membership.id);
        if (mErr) throw mErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-customers"] });
      qc.invalidateQueries({ queryKey: ["tenant-customer"] });
      qc.invalidateQueries({ queryKey: ["branchCustomers"] });
      qc.invalidateQueries({ queryKey: ["customer-companies"] });
      qc.invalidateQueries({ queryKey: ["customer-membership"] });
      qc.invalidateQueries({ queryKey: ["customer-pricing-tier"] });
      toast.success("Customer updated");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update customer"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!save.isPending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>
            Personal details, company link and account settings for this user.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[64vh] px-6">
          <div className="space-y-6 pb-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Personal</h3>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Company</h3>
              <div className="space-y-1">
                <Label>Business account</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No company (individual)</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {companyId !== NONE && (
                <>
                  <div className="space-y-1">
                    <Label>Job title</Label>
                    <Input
                      value={jobTitle}
                      placeholder="e.g. Marketing manager"
                      onChange={(e) => setJobTitle(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center justify-between gap-4 text-sm">
                    <span>
                      <span className="font-medium">Primary contact</span>
                      <span className="block text-xs text-muted-foreground">
                        Main contact person for this company.
                      </span>
                    </span>
                    <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
                  </label>
                </>
              )}
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Account</h3>
              {company?.is_trade_customer && (
                <p className="text-xs text-muted-foreground">
                  {company.name} is a trade account — this user already sees trade pricing
                  {company.mis_account_number ? ` under account ${company.mis_account_number}` : ""}.
                </p>
              )}
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium">Trade customer</span>
                  <span className="block text-xs text-muted-foreground">
                    Shows trade pricing instead of consumer pricing when signed in.
                  </span>
                </span>
                <Switch checked={isTrade} onCheckedChange={setIsTrade} />
              </label>
              <div className="space-y-1">
                <Label>MIS account number</Label>
                <Input
                  value={accountNo}
                  placeholder="e.g. IMP-01234"
                  onChange={(e) => setAccountNo(e.target.value)}
                />
              </div>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
