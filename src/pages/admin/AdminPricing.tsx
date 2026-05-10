import { useState } from "react";
import {
  usePricingRules,
  useCreatePricingRule,
  useUpdatePricingRule,
  useDeletePricingRule,
} from "@/hooks/usePricingRules";
import type { PricingRule } from "@/hooks/usePricingRules";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import PricingRuleForm from "@/components/admin/PricingRuleForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/formatCurrency";

const RULE_TYPE_LABELS: Record<string, string> = {
  per_page: "Per Page",
  per_document: "Per Document",
  per_unit: "Per Unit",
  surcharge: "Surcharge",
  setup_fee: "Setup Fee",
};

const AdminPricing = () => {
  // Master pricing rules editor (platform admin). Always tenant_id IS NULL.
  const { data: rules = [], isLoading } = usePricingRules(null, "ZAR", { masterOnly: true });
  const { data: families = [] } = useProductFamilies(null, { masterOnly: true });
  const createRule = useCreatePricingRule();
  const updateRule = useUpdatePricingRule();
  const deleteRule = useDeletePricingRule();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
        await createRule.mutateAsync(values);
        toast({ title: "Pricing rule created" });
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
      toast({ title: "Pricing rule deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeleteId(null);
  }

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

  // Extract plain families list from the hook (strip the join data)
  const plainFamilies = families.map(({ product_options, ...rest }) => rest);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pricing Rules</h1>
          <p className="text-sm text-muted-foreground">Configure pricing rules that apply to product families.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" /> New Pricing Rule
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No pricing rules yet. Create product families first, then add pricing rules.</p>
        </div>
      ) : (
        <div className="rounded-md border">
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
                  <TableCell className="text-muted-foreground">
                    {r.product_families?.name || "All"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{RULE_TYPE_LABELS[r.rule_type] || r.rule_type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">
                    {formatPrice(Number(r.price_value), r.currency_code || "ZAR")}
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
        </div>
      )}

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
            <AlertDialogTitle>Delete Pricing Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this pricing rule. This action cannot be undone.
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

export default AdminPricing;
