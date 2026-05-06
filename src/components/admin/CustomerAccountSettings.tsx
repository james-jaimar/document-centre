import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useCustomerCreditAccounts,
  useUpsertCreditAccount,
  useDeleteCreditAccount,
  type CreditAccount,
  type CreditAccountUpsert,
} from "@/hooks/useCustomerCreditAccounts";
import { useBranches, type Branch } from "@/hooks/useBranches";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Plus, Trash2, Pencil, Building2 } from "lucide-react";
import { formatPrice } from "@/lib/formatCurrency";

interface Props {
  customerProfileId: string;
  currencyCode?: string;
}

const EMPTY: CreditAccountUpsert = {
  branch_id: null,
  is_active: true,
  credit_limit: null,
  payment_terms_days: null,
  default_discount_pct: null,
  account_ref: null,
  notes: null,
};

export function CustomerAccountSettings({ customerProfileId, currencyCode = "ZAR" }: Props) {
  const { tenantId } = useTenantContext();
  const { data: accounts = [], isLoading } = useCustomerCreditAccounts(customerProfileId);
  const { data: branches = [] } = useBranches(tenantId);
  const upsert = useUpsertCreditAccount(customerProfileId);
  const remove = useDeleteCreditAccount(customerProfileId);

  const [editing, setEditing] = useState<(CreditAccountUpsert & { id?: string }) | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // branches that already have a credit account (so we don't offer them for new ones)
  const usedBranchIds = new Set(accounts.filter((a) => a.branch_id).map((a) => a.branch_id!));
  const hasDefault = accounts.some((a) => !a.branch_id);

  const availableBranches = branches.filter((b) => !usedBranchIds.has(b.id));

  function branchName(branchId: string | null) {
    if (!branchId) return "All branches (default)";
    return branches.find((b) => b.id === branchId)?.name ?? "Unknown branch";
  }

  function openNew() {
    setEditing({ ...EMPTY, branch_id: hasDefault ? (availableBranches[0]?.id ?? null) : null });
  }

  function openEdit(acct: CreditAccount) {
    setEditing({
      id: acct.id,
      branch_id: acct.branch_id,
      is_active: acct.is_active,
      credit_limit: acct.credit_limit,
      payment_terms_days: acct.payment_terms_days,
      default_discount_pct: acct.default_discount_pct,
      account_ref: acct.account_ref,
      notes: acct.notes,
    });
  }

  function handleSave() {
    if (!editing) return;
    upsert.mutate(editing, { onSuccess: () => setEditing(null) });
  }

  function handleDelete() {
    if (!deleteId) return;
    remove.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
  }

  if (isLoading) return <Card className="p-4"><p className="text-sm text-muted-foreground">Loading…</p></Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Credit accounts</h3>
        <Button size="sm" variant="outline" onClick={openNew} disabled={hasDefault && availableBranches.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {accounts.length === 0 && (
        <Card className="p-6 text-center border-dashed">
          <p className="text-sm text-muted-foreground">No credit accounts. Add one to enable ordering on account.</p>
        </Card>
      )}

      {accounts.map((acct) => (
        <Card key={acct.id} className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{branchName(acct.branch_id)}</span>
              <Badge variant={acct.is_active ? "default" : "secondary"} className="text-xs">
                {acct.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(acct)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setDeleteId(acct.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Credit limit</div>
              <div className="font-medium">
                {acct.credit_limit != null ? formatPrice(acct.credit_limit, currencyCode) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Payment terms</div>
              <div className="font-medium">{acct.payment_terms_days != null ? `${acct.payment_terms_days} days` : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Discount</div>
              <div className="font-medium">{acct.default_discount_pct != null ? `${acct.default_discount_pct}%` : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Account ref</div>
              <div className="font-medium">{acct.account_ref || "—"}</div>
            </div>
          </div>
          {acct.notes && <p className="text-xs text-muted-foreground">{acct.notes}</p>}
        </Card>
      ))}

      {/* ---- Edit / Create Dialog ---- */}
      {editing && (
        <Card className="p-4 space-y-4 border-primary/40">
          <h4 className="text-sm font-semibold">{editing.id ? "Edit" : "New"} credit account</h4>

          {!editing.id && (
            <div className="space-y-1">
              <Label>Branch</Label>
              <Select
                value={editing.branch_id ?? "__default__"}
                onValueChange={(v) => setEditing((e) => e && ({ ...e, branch_id: v === "__default__" ? null : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {!hasDefault && <SelectItem value="__default__">All branches (default)</SelectItem>}
                  {availableBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch
              checked={!!editing.is_active}
              onCheckedChange={(v) => setEditing((e) => e && ({ ...e, is_active: v }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Credit limit ({currencyCode})</Label>
              <Input
                type="number" min={0}
                value={editing.credit_limit ?? ""}
                onChange={(e) => setEditing((f) => f && ({ ...f, credit_limit: e.target.value === "" ? null : Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Payment terms (days)</Label>
              <Input
                type="number" min={0}
                value={editing.payment_terms_days ?? ""}
                onChange={(e) => setEditing((f) => f && ({ ...f, payment_terms_days: e.target.value === "" ? null : Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Default discount %</Label>
              <Input
                type="number" min={0} max={100}
                value={editing.default_discount_pct ?? ""}
                onChange={(e) => setEditing((f) => f && ({ ...f, default_discount_pct: e.target.value === "" ? null : Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Account ref</Label>
              <Input
                value={editing.account_ref ?? ""}
                placeholder="e.g. Pastel ACC-1234"
                onChange={(e) => setEditing((f) => f && ({ ...f, account_ref: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={editing.notes ?? ""}
                placeholder="Visible only to staff"
                onChange={(e) => setEditing((f) => f && ({ ...f, notes: e.target.value || null }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </Card>
      )}

      {/* ---- Delete Confirmation ---- */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove credit account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this credit facility. Existing orders are unaffected.
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
}
