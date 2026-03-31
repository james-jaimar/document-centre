import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { toast } from "sonner";
import { Save, Receipt } from "lucide-react";

export function FinancialTab() {
  const { settingsMap, isLoading } = useTenantSettingsMap("financial");
  const bulkUpsert = useBulkUpsertTenantSettings();

  const [taxLabel, setTaxLabel] = useState("VAT");
  const [taxRate, setTaxRate] = useState("15");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [invoiceNextNumber, setInvoiceNextNumber] = useState("1001");

  useEffect(() => {
    if (!isLoading && settingsMap) {
      setTaxLabel((settingsMap.tax_label as string) ?? "VAT");
      setTaxRate(String(settingsMap.tax_rate ?? 15));
      setTaxInclusive(settingsMap.tax_inclusive === true);
      setInvoicePrefix((settingsMap.invoice_prefix as string) ?? "INV");
      setInvoiceNextNumber(String(settingsMap.invoice_next_number ?? 1001));
    }
  }, [isLoading, settingsMap]);

  const handleSave = async () => {
    try {
      await bulkUpsert.mutateAsync([
        { category: "financial", setting_key: "tax_label", setting_value: taxLabel, value_type: "string" },
        { category: "financial", setting_key: "tax_rate", setting_value: parseFloat(taxRate), value_type: "number" },
        { category: "financial", setting_key: "tax_inclusive", setting_value: taxInclusive, value_type: "boolean" },
        { category: "financial", setting_key: "invoice_prefix", setting_value: invoicePrefix, value_type: "string" },
        { category: "financial", setting_key: "invoice_next_number", setting_value: parseInt(invoiceNextNumber), value_type: "number" },
      ]);
      toast.success("Financial settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Tax Configuration</CardTitle>
          <CardDescription>How tax is calculated and displayed on orders and invoices</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Tax Label</Label>
            <Input value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} placeholder="e.g. VAT, GST" />
          </div>
          <div className="space-y-2">
            <Label>Tax Rate (%)</Label>
            <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={taxInclusive} onCheckedChange={setTaxInclusive} />
            <Label>Tax-inclusive pricing</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Numbering</CardTitle>
          <CardDescription>Prefix and next number for invoice generation</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 max-w-lg">
          <div className="space-y-2">
            <Label>Invoice Prefix</Label>
            <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Next Invoice Number</Label>
            <Input type="number" value={invoiceNextNumber} onChange={(e) => setInvoiceNextNumber(e.target.value)} className="font-mono" />
          </div>
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
