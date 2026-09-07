import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePostLedgerEntry, type AccountTarget } from "@/hooks/useAccountLedger";

interface Props extends AccountTarget {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branchId?: string | null;
  currency?: string;
}

export function AccountAdjustmentDialog({
  open, onOpenChange, companyId, profileId, branchId = null, currency = "ZAR",
}: Props) {
  const post = usePostLedgerEntry({ companyId, profileId });
  const [kind, setKind] = useState("credit_note");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));

  const submit = async () => {
    await post.mutateAsync({
      action: "record_adjustment",
      entry_type: kind,
      amount: Number(amount),
      reference,
      note,
      entry_date: entryDate,
      branch_id: branchId,
      currency,
    });
    setAmount(""); setReference(""); setNote("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add adjustment</DialogTitle>
          <DialogDescription>
            Post a credit note, write-off or an opening balance carried in from your MIS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit_note">Credit note / write-off</SelectItem>
                <SelectItem value="opening_balance">Opening balance</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {kind === "credit_note"
                ? "Reduces what the customer owes."
                : "Adds the amount they already owed when you started using the system."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Amount ({currency})</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={post.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={post.isPending || !(Number(amount) > 0)}>
            {post.isPending ? "Saving…" : "Post adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
