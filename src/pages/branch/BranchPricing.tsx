import { useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  usePricingRules,
  useCreatePricingRule,
  useUpdatePricingRule,
  useDeletePricingRule,
  type PricingRule,
} from "@/hooks/usePricingRules";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import { useResyncBranchPricing } from "@/hooks/useRateCard";
import PricingRuleForm from "@/components/admin/PricingRuleForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
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
  const { tenantId, branchId } = useTenantContext();
  const { data: rules = [], isLoading } = usePricingRules(tenantId, "ZAR", { branchId });
  const { data: families = [] } = useProductFamilies(tenantId);
  const createRule = useCreatePricingRule();
  const updateRule = useUpdatePricingRule();
  const deleteRule = useDeletePricingRule();
  const resync = useResyncBranchPricing();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [resyncOpen, setResyncOpen] = useState(false);

  const plainFamilies = families.map(({ product_options, ...rest }: any) => rest);

  if (!branchId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          You aren't assigned to a branch yet — branch pricing isn't available.
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
        toast({ title: "Pricing rule updated" });
      } else {
        await createRule.mutateAsync({
          ...values,
          tenant_id: tenantId!,
          branch_id: branchId!,
        });
        toast({ title: "Pricing rule added" });
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
      toast({ title: "Rule deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeleteId(null);
  }

  async function handleResync() {
    try {
      await resync.mutateAsync(branchId!);
      toast({ title: "Re-synced from tenant pricing" });
    } catch (e: any) {
      toast({ title: "Re-sync failed", description: e.message, variant: "destructive" });
    }
    setResyncOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Branch Pricing</h1>
          <p className="text-sm text-muted-foreground">
            Your branch's own copy of the pricing rules. Edit any row to set your branch-specific price.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setResyncOpen(true)} disabled={resync.isPending}>
            <RefreshCw className="h-4 w-4 mr-2" /> Re-sync from tenant
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Rule
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-muted-foreground">Loading…</p>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No pricing rules for this branch yet. Click <strong>Re-sync from tenant</strong> to
              pull a full copy of the tenant's pricing.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
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
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.sort_order}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.product_families?.name || "All"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{RULE_TYPE_LABELS[r.rule_type] || r.rule_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatPrice(Number(r.price_value), (r as any).currency_code || "ZAR")}
                    </TableCell>
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
            <AlertDialogTitle>Delete pricing rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This rule will be removed from your branch's pricebook. You can pull it back with
              "Re-sync from tenant".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resyncOpen} onOpenChange={setResyncOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-sync from tenant pricing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>delete all of this branch's pricing rules</strong> and replace
              them with a fresh copy of the tenant's pricing. Any branch-specific prices you've
              set will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResync}>Re-sync</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BranchPricing;
