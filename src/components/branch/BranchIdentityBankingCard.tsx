import { useEffect, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { useUpdateBranch } from "@/hooks/useBranches";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, IdCard, Landmark } from "lucide-react";

type Branch = Tables<"branches">;

interface BankingDetails {
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  branch_code?: string;
  swift_code?: string;
  eft_enabled?: boolean;
  payment_instructions?: string;
}

interface IdentityForm {
  trading_name: string;
  legal_name: string;
  vat_number: string;
  registration_number: string;
  email: string;
  billing_email: string;
  accounts_email: string;
  phone: string;
  website_url: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
}

interface Props {
  branch: Branch;
  /** Compact = no outer header text — shown inside a tab */
  compact?: boolean;
}

const emptyIdentity = (b: Branch): IdentityForm => ({
  trading_name: b.trading_name ?? "",
  legal_name: b.legal_name ?? "",
  vat_number: b.vat_number ?? "",
  registration_number: b.registration_number ?? "",
  email: b.email ?? "",
  billing_email: b.billing_email ?? "",
  accounts_email: b.accounts_email ?? "",
  phone: b.phone ?? "",
  website_url: b.website_url ?? "",
  address: b.address ?? "",
  city: b.city ?? "",
  province: b.province ?? "",
  postal_code: b.postal_code ?? "",
  country: b.country ?? "ZA",
});

const emptyBanking = (b: Branch): BankingDetails => {
  const v = (b.banking_details ?? {}) as BankingDetails;
  return {
    bank_name: v.bank_name ?? "",
    account_name: v.account_name ?? "",
    account_number: v.account_number ?? "",
    branch_code: v.branch_code ?? "",
    swift_code: v.swift_code ?? "",
    eft_enabled: v.eft_enabled ?? false,
    payment_instructions: v.payment_instructions ?? "",
  };
};

export default function BranchIdentityBankingCard({ branch }: Props) {
  const updateBranch = useUpdateBranch();

  const [identity, setIdentity] = useState<IdentityForm>(() => emptyIdentity(branch));
  const [banking, setBanking] = useState<BankingDetails>(() => emptyBanking(branch));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setIdentity(emptyIdentity(branch));
    setBanking(emptyBanking(branch));
    setDirty(false);
  }, [branch.id]);

  const setI = <K extends keyof IdentityForm>(k: K, v: IdentityForm[K]) => {
    setIdentity((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };
  const setB = <K extends keyof BankingDetails>(k: K, v: BankingDetails[K]) => {
    setBanking((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await updateBranch.mutateAsync({
        id: branch.id,
        trading_name: identity.trading_name || null,
        legal_name: identity.legal_name || null,
        vat_number: identity.vat_number || null,
        registration_number: identity.registration_number || null,
        email: identity.email || null,
        billing_email: identity.billing_email || null,
        accounts_email: identity.accounts_email || null,
        phone: identity.phone || null,
        website_url: identity.website_url || null,
        address: identity.address || null,
        city: identity.city || null,
        province: identity.province || null,
        postal_code: identity.postal_code || null,
        country: identity.country || "ZA",
        banking_details: banking as any,
      });
      toast.success("Branch identity & banking saved");
      setDirty(false);
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IdCard size={16} /> Branch Identity
          </CardTitle>
          <CardDescription>
            Shown on quotes, invoices and customer emails. Fields left blank fall back to the tenant default.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Trading name</Label>
            <Input value={identity.trading_name} onChange={(e) => setI("trading_name", e.target.value)} placeholder="e.g. PostNet Sandton" />
          </div>
          <div>
            <Label>Legal company name</Label>
            <Input value={identity.legal_name} onChange={(e) => setI("legal_name", e.target.value)} placeholder="e.g. Sandton Print Group (Pty) Ltd" />
          </div>
          <div>
            <Label>VAT number</Label>
            <Input value={identity.vat_number} onChange={(e) => setI("vat_number", e.target.value)} placeholder="4xxxxxxxxx" />
          </div>
          <div>
            <Label>Company registration #</Label>
            <Input value={identity.registration_number} onChange={(e) => setI("registration_number", e.target.value)} placeholder="20XX/XXXXXX/07" />
          </div>
          <div>
            <Label>Public email</Label>
            <Input value={identity.email} onChange={(e) => setI("email", e.target.value)} placeholder="hello@branch.co.za" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={identity.phone} onChange={(e) => setI("phone", e.target.value)} placeholder="+27 ..." />
          </div>
          <div>
            <Label>Billing email</Label>
            <Input value={identity.billing_email} onChange={(e) => setI("billing_email", e.target.value)} placeholder="billing@branch.co.za" />
          </div>
          <div>
            <Label>Accounts email</Label>
            <Input value={identity.accounts_email} onChange={(e) => setI("accounts_email", e.target.value)} placeholder="accounts@branch.co.za" />
          </div>
          <div className="md:col-span-2">
            <Label>Website</Label>
            <Input value={identity.website_url} onChange={(e) => setI("website_url", e.target.value)} placeholder="https://..." />
          </div>
          <div className="md:col-span-2">
            <Label>Street address</Label>
            <Input value={identity.address} onChange={(e) => setI("address", e.target.value)} />
          </div>
          <div>
            <Label>City</Label>
            <Input value={identity.city} onChange={(e) => setI("city", e.target.value)} />
          </div>
          <div>
            <Label>Province</Label>
            <Input value={identity.province} onChange={(e) => setI("province", e.target.value)} />
          </div>
          <div>
            <Label>Postal code</Label>
            <Input value={identity.postal_code} onChange={(e) => setI("postal_code", e.target.value)} />
          </div>
          <div>
            <Label>Country</Label>
            <Input value={identity.country} onChange={(e) => setI("country", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark size={16} /> Banking & EFT
          </CardTitle>
          <CardDescription>
            Used on quotes and invoices so customers can pay you directly via EFT.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="eft-enabled"
              checked={!!banking.eft_enabled}
              onCheckedChange={(v) => setB("eft_enabled", v)}
            />
            <Label htmlFor="eft-enabled">Show EFT details on quotes & invoices</Label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Bank name</Label>
              <Input value={banking.bank_name ?? ""} onChange={(e) => setB("bank_name", e.target.value)} placeholder="FNB / Standard Bank / ..." />
            </div>
            <div>
              <Label>Account name</Label>
              <Input value={banking.account_name ?? ""} onChange={(e) => setB("account_name", e.target.value)} />
            </div>
            <div>
              <Label>Account number</Label>
              <Input value={banking.account_number ?? ""} onChange={(e) => setB("account_number", e.target.value)} />
            </div>
            <div>
              <Label>Branch / universal code</Label>
              <Input value={banking.branch_code ?? ""} onChange={(e) => setB("branch_code", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>SWIFT (optional, for international)</Label>
              <Input value={banking.swift_code ?? ""} onChange={(e) => setB("swift_code", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Payment instructions</Label>
              <Textarea
                rows={3}
                value={banking.payment_instructions ?? ""}
                onChange={(e) => setB("payment_instructions", e.target.value)}
                placeholder="e.g. Use the quote number as the payment reference and email proof of payment to accounts@..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!dirty || updateBranch.isPending}>
          <Save size={14} className="mr-1.5" />
          {updateBranch.isPending ? "Saving…" : "Save Identity & Banking"}
        </Button>
      </div>
    </div>
  );
}
