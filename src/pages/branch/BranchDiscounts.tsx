import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tags, Plus, Pencil, Trash2, TicketPercent } from "lucide-react";
import { toast } from "sonner";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  useBranchDiscounts,
  useSaveBranchDiscount,
  useDeleteBranchDiscount,
  useToggleBranchDiscount,
  type BranchDiscount,
  type DiscountInput,
} from "@/hooks/useBranchDiscounts";

const KIND_LABEL: Record<BranchDiscount["kind"], string> = {
  coupon: "Coupon code",
  voucher: "Customer voucher",
  automatic: "Automatic special",
};

const VTYPE_LABEL: Record<BranchDiscount["value_type"], string> = {
  percentage: "% off",
  fixed: "Fixed amount off",
  free_delivery: "Free delivery",
  free_item: "Free item / add-on",
};

function emptyDraft(tenantId: string, branchId: string): DiscountInput {
  return {
    tenant_id: tenantId,
    branch_id: branchId,
    kind: "coupon",
    name: "",
    code: "",
    description: "",
    value_type: "percentage",
    value_amount: 10,
    currency_code: "ZAR",
    is_active: true,
    first_time_customer_only: false,
    max_redemptions: null,
    max_per_customer: null,
    min_order_subtotal: null,
    starts_at: null,
    ends_at: null,
  };
}

export default function BranchDiscounts() {
  const { tenantId, branchId } = useTenantContext();
  const { data: rows, isLoading } = useBranchDiscounts(branchId);
  const save = useSaveBranchDiscount();
  const del = useDeleteBranchDiscount();
  const toggle = useToggleBranchDiscount();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BranchDiscount | null>(null);
  const [draft, setDraft] = useState<DiscountInput | null>(null);

  const openNew = () => {
    if (!tenantId || !branchId) return;
    setEditing(null);
    setDraft(emptyDraft(tenantId, branchId));
    setDialogOpen(true);
  };
  const openEdit = (row: BranchDiscount) => {
    setEditing(row);
    setDraft({ ...row });
    setDialogOpen(true);
  };

  const grouped = useMemo(() => {
    const by: Record<string, BranchDiscount[]> = { coupon: [], voucher: [], automatic: [] };
    (rows ?? []).forEach((r) => by[r.kind].push(r));
    return by;
  }, [rows]);

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("Name is required");
    if ((draft.kind === "coupon" || draft.kind === "voucher") && !draft.code?.trim()) {
      return toast.error("Code is required for coupons and vouchers");
    }
    if (draft.value_type !== "free_delivery" && !(Number(draft.value_amount) > 0)) {
      return toast.error("Value must be greater than 0");
    }
    try {
      await save.mutateAsync({ ...draft, id: editing?.id });
      toast.success(editing ? "Discount updated" : "Discount created");
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save discount");
    }
  };

  const renderTable = (title: string, kind: BranchDiscount["kind"], items: BranchDiscount[]) => (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TicketPercent className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">{title}</h3>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {KIND_LABEL[kind].toLowerCase()}s yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {kind !== "automatic" && <TableHead>Code</TableHead>}
              <TableHead>Value</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Uses</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                {kind !== "automatic" && (
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.code}</code></TableCell>
                )}
                <TableCell className="text-sm">
                  {r.value_type === "percentage" && `${r.value_amount}% off`}
                  {r.value_type === "fixed" && `${r.currency_code} ${Number(r.value_amount).toFixed(2)} off`}
                  {r.value_type === "free_delivery" && "Free delivery"}
                  {r.value_type === "free_item" && `Item worth ${r.currency_code} ${Number(r.value_amount).toFixed(2)}`}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.starts_at ? new Date(r.starts_at).toLocaleDateString() : "—"} →{" "}
                  {r.ends_at ? new Date(r.ends_at).toLocaleDateString() : "no expiry"}
                </TableCell>
                <TableCell className="text-xs">
                  {r.max_redemptions ? `cap ${r.max_redemptions}` : "unlimited"}
                  {r.max_per_customer ? ` · ${r.max_per_customer}/cust` : ""}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(v) => toggle.mutate({ id: r.id, is_active: v, branch_id: r.branch_id })}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{r.name}”?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Any past redemptions will remain on order records, but the code will no
                            longer be usable.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => del.mutate({ id: r.id, branch_id: r.branch_id })}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Tags className="h-6 w-6" /> Discounts &amp; Vouchers
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Create promo codes for marketing campaigns, single-use vouchers for individual customers,
            or automatic specials that apply at checkout without a code.
          </p>
        </div>
        <Button onClick={openNew} disabled={!tenantId || !branchId}>
          <Plus className="h-4 w-4 mr-2" /> New discount
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" /><Skeleton className="h-32" />
        </div>
      ) : (
        <>
          {renderTable("Coupon codes", "coupon", grouped.coupon)}
          {renderTable("Customer vouchers", "voucher", grouped.voucher)}
          {renderTable("Automatic specials", "automatic", grouped.automatic)}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit discount" : "New discount"}</DialogTitle>
            <DialogDescription>
              Set up the rules that decide when this discount applies at checkout.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={draft.kind}
                    onValueChange={(v) => setDraft({ ...draft, kind: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coupon">Coupon code</SelectItem>
                      <SelectItem value="voucher">Customer voucher</SelectItem>
                      <SelectItem value="automatic">Automatic special</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Discount value</Label>
                  <Select
                    value={draft.value_type}
                    onValueChange={(v) => setDraft({ ...draft, value_type: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage off</SelectItem>
                      <SelectItem value="fixed">Fixed amount off</SelectItem>
                      <SelectItem value="free_delivery">Free delivery</SelectItem>
                      <SelectItem value="free_item">Free item (value based)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Internal name *</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Grand Opening 20% off"
                />
              </div>

              {(draft.kind === "coupon" || draft.kind === "voucher") && (
                <div className="space-y-1.5">
                  <Label>Code *</Label>
                  <Input
                    value={draft.code ?? ""}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. WELCOME20"
                    className="uppercase"
                  />
                </div>
              )}

              {draft.value_type !== "free_delivery" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{draft.value_type === "percentage" ? "Percent" : "Amount"} *</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draft.value_amount ?? 0}
                      onChange={(e) => setDraft({ ...draft, value_amount: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    <Input
                      value={draft.currency_code ?? "ZAR"}
                      onChange={(e) => setDraft({ ...draft, currency_code: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Description (shown internally)</Label>
                <Textarea
                  rows={2}
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Starts</Label>
                  <Input
                    type="datetime-local"
                    value={draft.starts_at ? draft.starts_at.slice(0, 16) : ""}
                    onChange={(e) => setDraft({ ...draft, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Ends</Label>
                  <Input
                    type="datetime-local"
                    value={draft.ends_at ? draft.ends_at.slice(0, 16) : ""}
                    onChange={(e) => setDraft({ ...draft, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Total uses</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="∞"
                    value={draft.max_redemptions ?? ""}
                    onChange={(e) => setDraft({ ...draft, max_redemptions: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Per customer</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="∞"
                    value={draft.max_per_customer ?? ""}
                    onChange={(e) => setDraft({ ...draft, max_per_customer: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Min subtotal</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="none"
                    value={draft.min_order_subtotal ?? ""}
                    onChange={(e) => setDraft({ ...draft, min_order_subtotal: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="space-y-0.5">
                  <Label>First-time customers only</Label>
                  <p className="text-xs text-muted-foreground">
                    Blocks anyone with a prior completed order at this branch.
                  </p>
                </div>
                <Switch
                  checked={!!draft.first_time_customer_only}
                  onCheckedChange={(v) => setDraft({ ...draft, first_time_customer_only: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={!!draft.is_active}
                  onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Create discount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
