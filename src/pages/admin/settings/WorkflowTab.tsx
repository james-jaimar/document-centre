import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { useUpdateTenant } from "@/hooks/useTenants";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Workflow } from "lucide-react";

const WORKFLOW_TEMPLATES = [
  { value: "prepaid_no_proof", label: "Prepaid — No Proof", desc: "Payment required before production. No proof step." },
  { value: "prepaid_with_proof", label: "Prepaid — With Proof", desc: "Payment required, then proof approval before production." },
  { value: "account_no_proof", label: "Account — No Proof", desc: "Invoice/account customer. Production starts on submit." },
  { value: "account_with_proof", label: "Account — With Proof", desc: "Account customer with proof approval before production." },
];

const TOGGLES = [
  { key: "requires_payment_before_production", label: "Requires payment before production" },
  { key: "requires_proof_approval", label: "Requires proof approval" },
  { key: "allows_partial_dispatch", label: "Allows partial dispatch" },
  { key: "auto_accept_orders", label: "Auto-accept orders" },
  { key: "allows_reorder", label: "Allows reorder from history" },
  { key: "requires_admin_review", label: "Requires admin review" },
];

export function WorkflowTab() {
  const { tenantId } = useTenantContext();
  const { settingsMap, isLoading } = useTenantSettingsMap("workflow");
  const bulkUpsert = useBulkUpsertTenantSettings();
  const updateTenant = useUpdateTenant();

  const [template, setTemplate] = useState("prepaid_no_proof");
  const [paymentMode, setPaymentMode] = useState("prepaid");
  const [proofMode, setProofMode] = useState("optional");
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isLoading && settingsMap) {
      const t: Record<string, boolean> = {};
      TOGGLES.forEach(({ key }) => { t[key] = settingsMap[key] === true; });
      setToggles(t);
    }
  }, [isLoading, settingsMap]);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase.from("tenants").select("workflow_template, payment_mode, proof_mode").eq("id", tenantId).maybeSingle();
      if (data) {
        setTemplate((data as any).workflow_template ?? "prepaid_no_proof");
        setPaymentMode((data as any).payment_mode ?? "prepaid");
        setProofMode((data as any).proof_mode ?? "optional");
      }
    })();
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    try {
      await updateTenant.mutateAsync({
        id: tenantId,
        workflow_template: template,
        payment_mode: paymentMode,
        proof_mode: proofMode,
      } as any);
      await bulkUpsert.mutateAsync(
        TOGGLES.map(({ key }) => ({
          category: "workflow",
          setting_key: key,
          setting_value: toggles[key] ?? false,
          value_type: "boolean",
        }))
      );
      toast.success("Workflow settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Workflow className="h-5 w-5" /> Workflow Template</CardTitle>
          <CardDescription>Choose a preset that determines how orders flow through the system</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {WORKFLOW_TEMPLATES.map((wf) => (
            <button
              key={wf.value}
              onClick={() => setTemplate(wf.value)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                template === wf.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className="font-medium text-foreground">{wf.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{wf.desc}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment & Proof Mode</CardTitle>
          <CardDescription>Core modes stored on the tenant record for engine use</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 max-w-lg">
          <div className="space-y-2">
            <Label>Payment Mode</Label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prepaid">Prepaid</SelectItem>
                <SelectItem value="account">Account</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Proof Mode</Label>
            <Select value={proofMode} onValueChange={setProofMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Always Required</SelectItem>
                <SelectItem value="optional">Optional</SelectItem>
                <SelectItem value="never">Never</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflow Toggles</CardTitle>
          <CardDescription>Fine-grained overrides for order processing behaviour</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {TOGGLES.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label className="cursor-pointer">{label}</Label>
              <Switch
                checked={toggles[key] ?? false}
                onCheckedChange={(v) => setToggles((prev) => ({ ...prev, [key]: v }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateTenant.isPending || bulkUpsert.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save Changes
        </Button>
      </div>
    </div>
  );
}
