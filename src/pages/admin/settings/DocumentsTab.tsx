import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { toast } from "sonner";
import { Save, FileText } from "lucide-react";

export function DocumentsTab() {
  const { settingsMap, isLoading } = useTenantSettingsMap("documents");
  const bulkUpsert = useBulkUpsertTenantSettings();

  const [proformaPrefix, setProformaPrefix] = useState("PRO");
  const [dnPrefix, setDnPrefix] = useState("DN");
  const [legalFooter, setLegalFooter] = useState("");

  useEffect(() => {
    if (!isLoading && settingsMap) {
      setProformaPrefix((settingsMap.proforma_prefix as string) ?? "PRO");
      setDnPrefix((settingsMap.delivery_note_prefix as string) ?? "DN");
      setLegalFooter((settingsMap.legal_footer_text as string) ?? "");
    }
  }, [isLoading, settingsMap]);

  const handleSave = async () => {
    try {
      await bulkUpsert.mutateAsync([
        { category: "documents", setting_key: "proforma_prefix", setting_value: proformaPrefix, value_type: "string" },
        { category: "documents", setting_key: "delivery_note_prefix", setting_value: dnPrefix, value_type: "string" },
        { category: "documents", setting_key: "legal_footer_text", setting_value: legalFooter, value_type: "string" },
      ]);
      toast.success("Document settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Document Numbering</CardTitle>
          <CardDescription>Prefixes for proformas, delivery notes, and other generated documents</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 max-w-lg">
          <div className="space-y-2">
            <Label>Proforma Prefix</Label>
            <Input value={proformaPrefix} onChange={(e) => setProformaPrefix(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Delivery Note Prefix</Label>
            <Input value={dnPrefix} onChange={(e) => setDnPrefix(e.target.value)} className="font-mono" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Legal Footer</CardTitle>
          <CardDescription>Text displayed at the bottom of invoices and delivery notes</CardDescription>
        </CardHeader>
        <CardContent className="max-w-lg">
          <Textarea value={legalFooter} onChange={(e) => setLegalFooter(e.target.value)} rows={3} placeholder="e.g. Thank you for your business. Terms apply." />
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
