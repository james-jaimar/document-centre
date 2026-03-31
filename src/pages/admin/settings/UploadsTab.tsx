import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useUpdateTenant } from "@/hooks/useTenants";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Upload } from "lucide-react";

export function UploadsTab() {
  const { tenantId } = useTenantContext();
  const { settingsMap, isLoading } = useTenantSettingsMap("uploads");
  const bulkUpsert = useBulkUpsertTenantSettings();
  const updateTenant = useUpdateTenant();

  const [allowedTypes, setAllowedTypes] = useState("pdf,ai,eps,jpg,png,tiff");
  const [maxSize, setMaxSize] = useState("100");
  const [requireUpload, setRequireUpload] = useState(true);
  const [proofMode, setProofMode] = useState("optional");

  useEffect(() => {
    if (!isLoading && settingsMap) {
      const types = settingsMap.allowed_file_types;
      setAllowedTypes(Array.isArray(types) ? types.join(",") : "pdf,ai,eps,jpg,png,tiff");
      setMaxSize(String(settingsMap.max_file_size_mb ?? 100));
      setRequireUpload(settingsMap.require_customer_upload !== false);
    }
  }, [isLoading, settingsMap]);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase.from("tenants").select("proof_mode").eq("id", tenantId).maybeSingle();
      if (data) setProofMode((data as any).proof_mode ?? "optional");
    })();
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    try {
      await bulkUpsert.mutateAsync([
        { category: "uploads", setting_key: "allowed_file_types", setting_value: allowedTypes.split(",").map((s) => s.trim()), value_type: "json" },
        { category: "uploads", setting_key: "max_file_size_mb", setting_value: parseInt(maxSize), value_type: "number" },
        { category: "uploads", setting_key: "require_customer_upload", setting_value: requireUpload, value_type: "boolean" },
      ]);
      await updateTenant.mutateAsync({ id: tenantId, proof_mode: proofMode } as any);
      toast.success("Upload & proof settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> File Upload Rules</CardTitle>
          <CardDescription>Control what customers can upload</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <div className="space-y-2">
            <Label>Allowed File Types (comma-separated)</Label>
            <Input value={allowedTypes} onChange={(e) => setAllowedTypes(e.target.value)} className="font-mono" placeholder="pdf,ai,eps,jpg,png" />
          </div>
          <div className="space-y-2">
            <Label>Max File Size (MB)</Label>
            <Input type="number" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={requireUpload} onCheckedChange={setRequireUpload} />
            <Label>Customer file upload required</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proof Mode</CardTitle>
          <CardDescription>When proofs are required for this tenant's orders</CardDescription>
        </CardHeader>
        <CardContent className="max-w-sm">
          <Select value={proofMode} onValueChange={setProofMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Always Required</SelectItem>
              <SelectItem value="optional">Optional (per product)</SelectItem>
              <SelectItem value="never">Never</SelectItem>
            </SelectContent>
          </Select>
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
