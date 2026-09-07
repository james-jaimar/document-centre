import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPrice } from "@/lib/formatCurrency";
import {
  useAccountOpenOrders, usePostLedgerEntry, type AccountTarget,
} from "@/hooks/useAccountLedger";

interface Props extends AccountTarget {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branchId?: string | null;
  currency?: string;
}

export function RecordAccountPaymentDialog({
  open, onOpenChange, companyId, profileId, branchId = null, currency = "ZAR",
}: Props) {
  const target = { companyId, profileId };
  const { data: openOrders = [] } = useAccountOpenOrders(target);
  const post = usePostLedgerEntry(target);

  const [mode, setMode] = useState("orders");
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));

  const pickedTotal = useMemo(
    () => openOrders
      .filter((o: any) => picked.includes(o.id))
      .reduce((s: number, o: any) => s + (Number(o.total_amount ?? 0) - Number(o.amount_paid ?? 0)), 0),
    [openOrders, picked],
  );

  const submit = async () => {
    await post.mutateAsync(
      mode === "orders"
        ? { action: "record_payment", order_ids: picked, reference, entry_date: entryDate, branch_id: branchId, currency }
        : { action: "record_payment", amount: Number(amount), reference, entry_date: entryDate, branch_id: branchId, currency },
    );
    setPicked([]); setAmount(""); setReference("");
    onOpenChange(false);
  };

  const disabled = post.isPending || (mode === "orders" ? picked.length === 0 : !(Number(amount) > 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Log money received against this account.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="orders">Against orders</TabsTrigger>
            <TabsTrigger value="lump">Lump payment</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-3 pt-3">
            {openOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unpaid orders on this account.</p>
            ) : (
              <div className="max-h-56 overflow-auto rounded-md border divide-y">
                {openOrders.map((o: any) => {
                  const due = Number(o.total_amount ?? 0) - Number(o.amount_paid ?? 0);
                  return (
                    <label key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={picked.includes(o.id)}
                        onCheckedChange={(c) =>
                          setPicked((p) => (c ? [...p, o.id] : p.filter((x) => x !== o.id)))}
                      />
                      <span className="flex-1">{o.order_number}</span>
                      <span className="text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString()}
                      </span>
                      <span className="font-medium">{formatPrice(due, o.currency ?? currency)}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-sm">
              Selected: <span className="font-semibold">{formatPrice(pickedTotal, currency)}</span>
            </p>
          </TabsContent>

          <TabsContent value="lump" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label>Amount ({currency})</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Clears the oldest unpaid orders first; anything left over sits on the account as credit.
            </p>
          </TabsContent>
        </Tabs>

        <div className="grid gap-3 sm:grid-cols-2 pt-2">
          <div className="space-y-2">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref / receipt no." />
          </div>
          <div className="space-y-2">
            <Label>Date received</Label>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={post.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={disabled}>
            {post.isPending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
