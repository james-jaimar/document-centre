import { useMemo, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  usePricingRules,
  useCreatePricingRule,
  useUpdatePricingRule,
  useDeletePricingRule,
  type PricingRule,
} from "@/hooks/usePricingRules";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import PricingRuleForm from "@/components/admin/PricingRuleForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/formatCurrency";

const RULE_TYPE_LABELS: Record<string, string> = {
  per_page: "Per Page",
  per_document: "Per Document",
  per_unit: "Per Unit",
  surcharge: "Surcharge",
  setup_fee: "Setup Fee",
};

function formatConditions(conditions: any): string {
  if (!conditions || typeof conditions !== "object") return "—";
  const parts: string[] = [];
  if (conditions.is_color === true) parts.push("Colour");
  if (conditions.is_color === false) parts.push("B&W");
  if (conditions.min_pages) parts.push(`≥${conditions.min_pages}pp`);
  if (conditions.max_pages) parts.push(`≤${conditions.max_pages}pp`);
  if (conditions.min_quantity) parts.push(`≥${conditions.min_quantity} qty`);
  if (conditions.max_quantity) parts.push(`≤${conditions.max_quantity} qty`);
  if (conditions.paper_stock?.length) parts.push(`Stock: ${conditions.paper_stock.join(", ")}`);
  return parts.length ? parts.join(" · ") : "No conditions";
}

const BranchPricing = () => {
  const { tenantId, branchId, appId } = useTenantContext();
  const { data: rules = [], isLoading } = usePricingRules(tenantId);
  const { data: families = [] } = useProductFamilies(tenantId);
  const createRule = useCreatePricingRule();
  const updateRule = useUpdatePricingRule();
  const deleteRule = useDeletePricingRule();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Split rules: tenant base (branch_id null) vs branch overrides (this branch).
  const inheritedRules = useMemo(
    () => rules.filter((r) => !r.branch_id),
    [rules]
  );
  const branchOverrides = useMemo(
    () => rules.filter((r) => r.branch_id === branchId),
    [rules, branchId]
  );

  const plainFamilies = families.map(({ product_options, ...rest }: any) => rest);

  if (!branchId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          You aren't assigned to a branch yet — pricing overrides aren't available.
        </CardContent>
      </Card>
    );
  }

  function handleCreate() {
    setEditingRule(null);
    setFormOpen(true);
  }

  function handleEdit(rule: PricingRule) {
    setEditingRule(rule);
    setFormOpen(true);
  }

  async function handleFormSubmit(values: any) {
    try {
      if (editingRule) {
        await updateRule.mutateAsync({ id: editingRule.id, ...values });
        toast({ title: "Branch override updated" });
      } else {
        await createRule.mutateAsync({
          ...values,
          tenant_id: tenantId!,
          branch_id: branchId!,
        });
        toast({ title: "Branch override created" });
      }
      setFormOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteRule.mutateAsync(deleteId);
      toast({ title: "Override deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeleteId(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Branch Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Override tenant-wide pricing for jobs fulfilled by your branch. Rules without an override fall back to the tenant base price.
        </p>
      </div>

      {/* Branch overrides */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Your branch overrides</CardTitle>
            <CardDescription>These prices apply only when this branch fulfils the order.</CardDescription>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Override
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-muted-foreground">Loading…</p>
          ) : branchOverrides.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No branch overrides yet. Click "New Override" to set a branch-specific price.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Product Family</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchOverrides.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.product_families?.name || "All"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{RULE_TYPE_LABELS[r.rule_type] || r.rule_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">{formatPrice(Number(r.price_value), (r as any).currency_code || "ZAR")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {formatConditions(r.conditions)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.is_active ? "default" : "secondary"}>
                        {r.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Inherited tenant pricing (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            Inherited tenant pricing
          </CardTitle>
          <CardDescription>Read-only. These are the tenant-wide rules you'll inherit unless you add an override.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {inheritedRules.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No tenant-wide rules configured yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Product Family</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inheritedRules.map((r) => (
                  <TableRow key={r.id} className="opacity-80">
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.product_families?.name || "All"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{RULE_TYPE_LABELS[r.rule_type] || r.rule_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">{formatPrice(Number(r.price_value), (r as any).currency_code || "ZAR")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {formatConditions(r.conditions)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.is_active ? "default" : "secondary"}>
                        {r.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PricingRuleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editingRule}
        families={plainFamilies}
        onSubmit={handleFormSubmit}
        isPending={createRule.isPending || updateRule.isPending}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete branch override?</AlertDialogTitle>
            <AlertDialogDescription>
              This branch will fall back to the tenant base price for this rule. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BranchPricing;
