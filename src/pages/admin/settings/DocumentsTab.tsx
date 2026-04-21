import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, FileText, Upload, Image } from "lucide-react";

function parseJsonArr(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
  }
  return [];
}

function ensureLength(arr: string[], len: number): string[] {
  const out = [...arr];
  while (out.length < len) out.push("");
  return out.slice(0, len);
}

export function DocumentsTab() {
  const { tenantId } = useTenantContext();
  const { settingsMap, isLoading } = useTenantSettingsMap("documents");
  const bulkUpsert = useBulkUpsertTenantSettings();

  // Header
  const [headerMode, setHeaderMode] = useState<"name" | "logo">("name");
  const [headerName, setHeaderName] = useState("");
  const [headerLogoUrl, setHeaderLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Invoice address
  const [invoiceAddress, setInvoiceAddress] = useState("");

  // Titles
  const [proformaTitle, setProformaTitle] = useState("");
  const [invoiceTitle, setInvoiceTitle] = useState("");

  // Footer
  const [legalFooter, setLegalFooter] = useState("");

  // Numbering
  const [proformaPrefix, setProformaPrefix] = useState("PRO");
  const [dnPrefix, setDnPrefix] = useState("DN");

  // Custom fields
  const [jobsheetFields, setJobsheetFields] = useState<string[]>(ensureLength([], 5));
  const [deliveryNoteFields, setDeliveryNoteFields] = useState<string[]>(ensureLength([], 5));
  const [invoiceFields, setInvoiceFields] = useState<string[]>(ensureLength([], 5));

  useEffect(() => {
    if (!isLoading && settingsMap) {
      setHeaderMode((settingsMap.header_mode as "name" | "logo") ?? "name");
      setHeaderName((settingsMap.header_name as string) ?? "");
      setHeaderLogoUrl((settingsMap.header_logo_url as string) ?? "");
      setInvoiceAddress((settingsMap.invoice_address as string) ?? "");
      setProformaTitle((settingsMap.proforma_title as string) ?? "");
      setInvoiceTitle((settingsMap.invoice_title as string) ?? "");
      setLegalFooter((settingsMap.legal_footer_text as string) ?? "");
      setProformaPrefix((settingsMap.proforma_prefix as string) ?? "PRO");
      setDnPrefix((settingsMap.delivery_note_prefix as string) ?? "DN");
      setJobsheetFields(ensureLength(parseJsonArr(settingsMap.jobsheet_custom_fields), 5));
      setDeliveryNoteFields(ensureLength(parseJsonArr(settingsMap.delivery_note_custom_fields), 5));
      setInvoiceFields(ensureLength(parseJsonArr(settingsMap.invoice_custom_fields), 5));
    }
  }, [isLoading, settingsMap]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `tenants/${tenantId}/document-logo.${ext}`;
      const { error } = await supabase.storage.from("assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("assets").getPublicUrl(path);
      setHeaderLogoUrl(urlData.publicUrl);
      toast.success("Logo uploaded");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const updateField = (arr: string[], idx: number, val: string, setter: (v: string[]) => void) => {
    const copy = [...arr];
    copy[idx] = val;
    setter(copy);
  };

  const handleSave = async () => {
    try {
      await bulkUpsert.mutateAsync([
        { category: "documents", setting_key: "header_mode", setting_value: headerMode, value_type: "string" },
        { category: "documents", setting_key: "header_name", setting_value: headerName, value_type: "string" },
        { category: "documents", setting_key: "header_logo_url", setting_value: headerLogoUrl, value_type: "string" },
        { category: "documents", setting_key: "invoice_address", setting_value: invoiceAddress, value_type: "string" },
        { category: "documents", setting_key: "proforma_title", setting_value: proformaTitle, value_type: "string" },
        { category: "documents", setting_key: "invoice_title", setting_value: invoiceTitle, value_type: "string" },
        { category: "documents", setting_key: "legal_footer_text", setting_value: legalFooter, value_type: "string" },
        { category: "documents", setting_key: "proforma_prefix", setting_value: proformaPrefix, value_type: "string" },
        { category: "documents", setting_key: "delivery_note_prefix", setting_value: dnPrefix, value_type: "string" },
        { category: "documents", setting_key: "jobsheet_custom_fields", setting_value: jobsheetFields, value_type: "json" },
        { category: "documents", setting_key: "delivery_note_custom_fields", setting_value: deliveryNoteFields, value_type: "json" },
        { category: "documents", setting_key: "invoice_custom_fields", setting_value: invoiceFields, value_type: "json" },
      ]);
      toast.success("Document settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  const CustomFieldsCard = ({ title, description, fields, setter }: { title: string; description: string; fields: string[]; setter: (v: string[]) => void }) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <Label className="w-16 text-xs text-muted-foreground shrink-0">Field {i + 1}</Label>
            <Input value={f} onChange={(e) => updateField(fields, i, e.target.value, setter)} placeholder="e.g. Date" className="h-8 text-sm" />
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Header Name or Logo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Image className="h-5 w-5" /> Header Name or Logo</CardTitle>
              <CardDescription>Choose how the header of your printable documents appears</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={headerMode} onValueChange={(v) => setHeaderMode(v as "name" | "logo")} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="name" id="hm-name" />
                  <Label htmlFor="hm-name">Name</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="logo" id="hm-logo" />
                  <Label htmlFor="hm-logo">Logo</Label>
                </div>
              </RadioGroup>

              {headerMode === "name" && (
                <div className="space-y-2 max-w-md">
                  <Label>Header Name</Label>
                  <Input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="Your Company Name" />
                </div>
              )}

              {headerMode === "logo" && (
                <div className="space-y-3">
                  {headerLogoUrl && (
                    <div className="border rounded-md p-4 bg-muted/30 max-w-xs">
                      <img src={headerLogoUrl} alt="Document logo" className="max-h-16 object-contain" />
                    </div>
                  )}
                  <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={handleLogoUpload} />
                  <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> {uploading ? "Uploading..." : "Upload Logo"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice Address */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Address</CardTitle>
              <CardDescription>Your company address displayed on invoices and proformas</CardDescription>
            </CardHeader>
            <CardContent className="max-w-lg">
              <Textarea value={invoiceAddress} onChange={(e) => setInvoiceAddress(e.target.value)} rows={4} placeholder={"Company Name\n123 Street Rd\nCity, Province\nPostal Code"} />
            </CardContent>
          </Card>

          {/* Document Titles */}
          <Card>
            <CardHeader>
              <CardTitle>Document Titles</CardTitle>
              <CardDescription>Override default headings on generated documents</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 max-w-lg">
              <div className="space-y-2">
                <Label>Proforma Invoice Title</Label>
                <Input value={proformaTitle} onChange={(e) => setProformaTitle(e.target.value)} placeholder="PROFORMA INVOICE" />
              </div>
              <div className="space-y-2">
                <Label>Invoice Title</Label>
                <Input value={invoiceTitle} onChange={(e) => setInvoiceTitle(e.target.value)} placeholder="TAX INVOICE" />
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <Card>
            <CardHeader>
              <CardTitle>Footer</CardTitle>
              <CardDescription>Text displayed at the bottom of invoices, proformas, and delivery notes (e.g. banking details, payment instructions)</CardDescription>
            </CardHeader>
            <CardContent className="max-w-lg">
              <Textarea value={legalFooter} onChange={(e) => setLegalFooter(e.target.value)} rows={6} placeholder="Banking details, payment instructions, legal notices..." />
            </CardContent>
          </Card>

          {/* Document Numbering */}
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
        </div>

        {/* Side column: custom fields */}
        <div className="space-y-6">
          <CustomFieldsCard
            title="Jobsheet / Ordersheet Custom Fields"
            description="Labels printed on jobsheets"
            fields={jobsheetFields}
            setter={setJobsheetFields}
          />
          <CustomFieldsCard
            title="Delivery Note Custom Fields"
            description="Labels printed on delivery notes"
            fields={deliveryNoteFields}
            setter={setDeliveryNoteFields}
          />
          <CustomFieldsCard
            title="Invoice Custom Fields"
            description="Labels printed on invoices"
            fields={invoiceFields}
            setter={setInvoiceFields}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={bulkUpsert.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save Changes
        </Button>
      </div>
    </div>
  );
}
