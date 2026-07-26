import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Hash, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  tenantId: string;
  branchId: string;
}

const INHERIT = "__inherit__";
const FORMAT_PRESETS = [
  { value: INHERIT, label: "Inherit from tenant" },
  { value: "{prefix}-{yyyy}-{seq}", label: "PREFIX-YYYY-00001" },
  { value: "{prefix}-{seq}", label: "PREFIX-00001" },
  { value: "{prefix}-{yyyymm}-{seq}", label: "PREFIX-YYYYMM-00001" },
  { value: "{prefix}-{seq}-{suffix}", label: "PREFIX-00001-SUFFIX" },
];

interface FormState {
  prefix: string; // empty = inherit
  suffix: string; // always optional
  format: string; // empty = inherit
  next_number: string; // empty = keep current sequence
}

/**
 * Per-branch override for invoice numbering (prefix, suffix, format, starting
 * number). Empty prefix/format = inherit tenant default. Next-number applies
 * only when the branch has not yet issued its first invoice.
 */
export function BranchInvoiceNumberingCard({ tenantId, branchId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>({
    prefix: "",
    suffix: "",
    format: INHERIT,
    next_number: "",
  });
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["branch_invoice_numbering", tenantId, branchId],
    queryFn: async () => {
      const [tenantRes, branchRes] = await Promise.all([
        supabase
          .from("tenant_settings")
          .select("setting_key, setting_value")
          .eq("tenant_id", tenantId)
          .eq("category", "financial"),
        supabase
          .from("branch_settings" as any)
          .select("setting_key, setting_value")
          .eq("branch_id", branchId)
          .eq("category", "financial"),
      ]);
      const toMap = (rows: any[] | null | undefined) => {
        const m: Record<string, unknown> = {};
        for (const r of rows ?? []) m[r.setting_key] = r.setting_value;
        return m;
      };
      return {
        tenant: toMap(tenantRes.data as any),
        branch: toMap(branchRes.data as any),
      };
    },
    enabled: !!tenantId && !!branchId,
  });

  useEffect(() => {
    if (!data) return;
    const b = data.branch;
    setForm({
      prefix: (b.invoice_prefix as string) ?? "",
      suffix: (b.invoice_suffix as string) ?? "",
      format: (b.invoice_number_format as string) || INHERIT,
      next_number:
        b.invoice_next_number !== undefined && b.invoice_next_number !== null
          ? String(b.invoice_next_number)
          : "",
    });
  }, [data]);

  const tenant = data?.tenant ?? {};
  const tenantPrefix = (tenant.invoice_prefix as string) ?? "INV";
  const tenantSuffix = (tenant.invoice_suffix as string) ?? "";
  const tenantFormat =
    (tenant.invoice_number_format as string) || "{prefix}-{yyyy}-{seq}";

  const preview = useMemo(() => {
    const prefix = form.prefix || tenantPrefix;
    const suffix = form.suffix || tenantSuffix;
    const format = form.format && form.format !== INHERIT ? form.format : tenantFormat;
    const seq = form.next_number ? String(form.next_number).padStart(5, "0") : "00001";
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const yyyymm = `${yyyy}${String(now.getMonth() + 1).padStart(2, "0")}`;
    return format
      .replace("{prefix}", prefix)
      .replace("{suffix}", suffix)
      .replace("{yyyy}", yyyy)
      .replace("{yyyymm}", yyyymm)
      .replace("{seq}", seq)
      .replace(/-{2,}/g, "-")
      .replace(/(^-|-$)/g, "");
  }, [form, tenantPrefix, tenantSuffix, tenantFormat]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const upserts: Array<{ setting_key: string; setting_value: any; value_type: string }> = [];
      const deletes: string[] = [];

      if (form.prefix.trim() === "") deletes.push("invoice_prefix");
      else upserts.push({ setting_key: "invoice_prefix", setting_value: form.prefix.trim(), value_type: "string" });

      if (form.suffix.trim() === "") deletes.push("invoice_suffix");
      else upserts.push({ setting_key: "invoice_suffix", setting_value: form.suffix.trim(), value_type: "string" });

      if (form.format === "") deletes.push("invoice_number_format");
      else upserts.push({ setting_key: "invoice_number_format", setting_value: form.format, value_type: "string" });

      if (form.next_number.trim() === "") deletes.push("invoice_next_number");
      else {
        const n = parseInt(form.next_number, 10);
        if (!Number.isFinite(n) || n < 1) {
          throw new Error("Next invoice number must be a positive whole number");
        }
        upserts.push({ setting_key: "invoice_next_number", setting_value: n, value_type: "number" });
      }

      if (deletes.length) {
        const { error } = await supabase
          .from("branch_settings" as any)
          .delete()
          .eq("branch_id", branchId)
          .eq("category", "financial")
          .in("setting_key", deletes);
        if (error) throw error;
      }
      if (upserts.length) {
        const rows = upserts.map((u) => ({
          tenant_id: tenantId,
          branch_id: branchId,
          category: "financial",
          ...u,
        }));
        const { error } = await supabase
          .from("branch_settings" as any)
          .upsert(rows as any, { onConflict: "branch_id,category,setting_key" });
        if (error) throw error;
      }
      toast.success("Invoice numbering saved");
      qc.invalidateQueries({ queryKey: ["branch_invoice_numbering", tenantId, branchId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash size={16} /> Invoice Numbering
        </CardTitle>
        <CardDescription>
          Control the invoice number format for this branch. Leave a field blank
          to inherit the tenant default (currently{" "}
          <code className="text-xs">{tenantFormat.replace("{prefix}", tenantPrefix)}</code>).
          The starting number only applies until this branch issues its first
          invoice — after that, the counter increments automatically and can't
          be lowered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label>Prefix</Label>
                <Input
                  value={form.prefix}
                  onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))}
                  placeholder={`Inherit (${tenantPrefix})`}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Suffix (optional)</Label>
                <Input
                  value={form.suffix}
                  onChange={(e) => setForm((f) => ({ ...f, suffix: e.target.value }))}
                  placeholder={tenantSuffix ? `Inherit (${tenantSuffix})` : "e.g. branch code"}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Number format</Label>
                <Select
                  value={form.format}
                  onValueChange={(v) => setForm((f) => ({ ...f, format: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_PRESETS.map((p) => (
                      <SelectItem key={p.value || "inherit"} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Starting number</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.next_number}
                  onChange={(e) => setForm((f) => ({ ...f, next_number: e.target.value }))}
                  placeholder="e.g. 1001"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label>Preview</Label>
                <div className="h-10 flex items-center rounded-md border bg-muted/30 px-3 font-mono text-sm">
                  {preview}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Save size={14} className="mr-1.5" /> {saving ? "Saving…" : "Save invoice numbering"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
