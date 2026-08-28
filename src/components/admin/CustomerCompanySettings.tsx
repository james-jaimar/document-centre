import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { useCustomerCompanies } from "@/hooks/useCustomerCompanies";
import { CompanyFormDialog } from "@/components/customers/CompanyFormDialog";

const NO_COMPANY = "__nocompany__";

interface Props {
  customerProfileId: string;
  companyId?: string | null;
}

/** Attach a customer to a business account (company). */
export function CustomerCompanySettings({ customerProfileId, companyId }: Props) {
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();
  const { data: companies = [] } = useCustomerCompanies();
  const [value, setValue] = useState(companyId ?? NO_COMPANY);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => setValue(companyId ?? NO_COMPANY), [companyId]);

  const selected = companies.find((c) => c.id === value) ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId || !appId) throw new Error("Missing tenant context");
      const { error } = await supabase
        .from("tenant_memberships")
        .update({ company_id: value === NO_COMPANY ? null : value })
        .eq("tenant_id", tenantId)
        .eq("app_id", appId)
        .eq("profile_id", customerProfileId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-customer", tenantId, customerProfileId] });
      qc.invalidateQueries({ queryKey: ["tenant-customers", tenantId] });
      qc.invalidateQueries({ queryKey: ["customer-companies"] });
      toast.success("Company link saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save company link"),
  });

  const dirty = (value === NO_COMPANY ? null : value) !== (companyId ?? null);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Company
        </h3>
        {selected?.is_trade_customer && <Badge className="text-[11px]">Trade company</Badge>}
      </div>

      <div className="space-y-1">
        <Label>Business account</Label>
        <div className="flex gap-2">
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="No company (individual)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_COMPANY}>No company (individual)</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setFormOpen(true)}>New company</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Linked users inherit the company's trade status, account number and credit terms.
        </p>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <CompanyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(c) => setValue(c.id)}
      />
    </Card>
  );
}
