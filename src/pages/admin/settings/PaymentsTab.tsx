import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PaymentGatewaysCard } from "@/components/payments/PaymentGatewaysCard";
import { toast } from "sonner";
import { Save, Banknote, CreditCard } from "lucide-react";

export function PaymentsTab() {
  const { tenantId } = useTenantContext();
  const { settingsMap, isLoading } = useTenantSettingsMap("payments");
  const bulkUpsert = useBulkUpsertTenantSettings();

  const [eftEnabled, setEftEnabled] = useState(true);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [swift, setSwift] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");

  useEffect(() => {
    if (!isLoading && settingsMap) {
      setEftEnabled(settingsMap.eft_enabled !== false);
      setBankName((settingsMap.bank_name as string) ?? "");
      setAccountName((settingsMap.account_name as string) ?? "");
      setAccountNumber((settingsMap.account_number as string) ?? "");
      setBranchCode((settingsMap.branch_code as string) ?? "");
      setSwift((settingsMap.swift_code as string) ?? "");
      setPaymentInstructions((settingsMap.payment_instructions as string) ?? "");
    }
  }, [isLoading, settingsMap]);

  const handleSave = async () => {
    try {
      await bulkUpsert.mutateAsync([
        { category: "payments", setting_key: "eft_enabled", setting_value: eftEnabled, value_type: "boolean" },
        { category: "payments", setting_key: "bank_name", setting_value: bankName, value_type: "string" },
        { category: "payments", setting_key: "account_name", setting_value: accountName, value_type: "string" },
        { category: "payments", setting_key: "account_number", setting_value: accountNumber, value_type: "string" },
        { category: "payments", setting_key: "branch_code", setting_value: branchCode, value_type: "string" },
        { category: "payments", setting_key: "swift_code", setting_value: swift, value_type: "string" },
        { category: "payments", setting_key: "payment_instructions", setting_value: paymentInstructions, value_type: "string" },
      ]);
      toast.success("Payment settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      {tenantId && <PaymentGatewaysCard scope="tenant" scopeId={tenantId} />}
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Payment Methods</CardTitle>
          <CardDescription>Choose which payment methods are offered to your customers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">EFT / Bank transfer</Label>
              <p className="text-xs text-muted-foreground mt-1">Customers receive bank details on the invoice and order email</p>
            </div>
            <Switch checked={eftEnabled} onCheckedChange={setEftEnabled} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5" /> Banking Details</CardTitle>
          <CardDescription>These appear on invoices and the "Order received" email</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Bank Name</Label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. FNB, Standard Bank" />
          </div>
          <div className="space-y-2">
            <Label>Account Name</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Account Number</Label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Branch Code</Label>
            <Input value={branchCode} onChange={(e) => setBranchCode(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>SWIFT / BIC (optional)</Label>
            <Input value={swift} onChange={(e) => setSwift(e.target.value)} className="font-mono" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Instructions</CardTitle>
          <CardDescription>Free-text instructions shown to customers (e.g. "Use order number as reference")</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={paymentInstructions}
            onChange={(e) => setPaymentInstructions(e.target.value)}
            rows={4}
            placeholder="Please use your order number as the EFT reference. Email proof of payment to accounts@example.com."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={bulkUpsert.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save Changes
        </Button>
      </div>
    </div>
  );
}
