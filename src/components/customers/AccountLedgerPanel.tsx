import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, Plus, Receipt } from "lucide-react";
import { formatPrice } from "@/lib/formatCurrency";
import { downloadBlob } from "@/lib/downloadFile";
import { useAccountLedger, useAccountBalance, type LedgerEntry } from "@/hooks/useAccountLedger";
import { RecordAccountPaymentDialog } from "@/components/customers/RecordAccountPaymentDialog";
import { AccountAdjustmentDialog } from "@/components/customers/AccountAdjustmentDialog";

interface Props {
  companyId?: string | null;
  profileId?: string | null;
  branchId?: string | null;
  creditLimit?: number | null;
  paymentTermsDays?: number | null;
  currency?: string;
  orderPath?: (orderId: string) => string;
  /** Read-only view for the customer's own account page. */
  readOnly?: boolean;
}

const TYPE_LABEL: Record<LedgerEntry["entry_type"], string> = {
  charge: "Order",
  payment: "Payment",
  credit_note: "Credit note",
  opening_balance: "Opening balance",
};

export function AccountLedgerPanel({
  companyId, profileId, branchId = null, creditLimit, paymentTermsDays,
  currency = "ZAR", orderPath, readOnly = false,
}: Props) {
  const target = { companyId, profileId };
  const { data: entries = [], isLoading } = useAccountLedger(target);
  const { data: balance } = useAccountBalance(target);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);

  const rows = useMemo(() => {
    let running = 0;
    return entries
      .map((e) => {
        running += Number(e.amount);
        return { ...e, running };
      })
      .filter((e) => (!from || e.entry_date >= from) && (!to || e.entry_date <= to));
  }, [entries, from, to]);

  const limit = Number(creditLimit ?? 0);
  const bal = Number(balance?.balance ?? 0);
  const available = limit > 0 ? limit - bal : null;

  const exportCsv = () => {
    const header = ["Date", "Type", "Reference", "Note", "Due", "Amount", "Balance"];
    const lines = rows.map((r) => [
      r.entry_date,
      TYPE_LABEL[r.entry_type],
      r.reference ?? "",
      (r.note ?? "").replace(/"/g, "'"),
      r.due_date ?? "",
      Number(r.amount).toFixed(2),
      Number(r.running).toFixed(2),
    ]);
    const csv = [header, ...lines]
      .map((l) => l.map((c) => `"${c}"`).join(","))
      .join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), "account-statement.csv");
  };

  return (
    <div className="space-y-4">
      <Card className="p-6 grid gap-6 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Credit limit</div>
          <div className="text-lg font-semibold">{formatPrice(limit, currency)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Balance owing</div>
          <div className="text-lg font-semibold">{formatPrice(bal, currency)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Available credit</div>
          <div className="text-lg font-semibold">
            {available == null ? "—" : formatPrice(available, currency)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Overdue</div>
          <div className={`text-lg font-semibold ${Number(balance?.overdue ?? 0) > 0 ? "text-destructive" : ""}`}>
            {formatPrice(Number(balance?.overdue ?? 0), currency)}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-4 text-sm">
          {[
            ["Current", balance?.bucket_current],
            ["30 days", balance?.bucket_30],
            ["60 days", balance?.bucket_60],
            ["90+ days", balance?.bucket_90],
          ].map(([label, v]) => (
            <div key={label as string}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{label as string}</div>
              <div className="font-medium">{formatPrice(Number(v ?? 0), currency)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> Statement (CSV)
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Receipt className="h-4 w-4 mr-1" /> Print / PDF
            </Button>
            {!readOnly && (
              <>
                <Button size="sm" variant="outline" onClick={() => setAdjOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Adjustment
                </Button>
                <Button size="sm" onClick={() => setPayOpen(true)}>Record payment</Button>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Detail</th>
                <th className="py-2 pr-3">Due</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No entries yet.</td></tr>
              )}
              {rows.map((r) => {
                const overdue = r.entry_type === "charge" && r.due_date && r.due_date < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{r.entry_date}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={r.entry_type === "charge" ? "secondary" : "outline"}>
                        {TYPE_LABEL[r.entry_type]}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">
                      {r.order_id && orderPath ? (
                        <Link to={orderPath(r.order_id)} className="underline underline-offset-2">
                          {r.reference || "Order"}
                        </Link>
                      ) : (
                        <span>{r.reference || r.note || "—"}</span>
                      )}
                      {r.reference && r.note && (
                        <span className="text-muted-foreground"> · {r.note}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.due_date ? (
                        <span className={overdue ? "text-destructive" : ""}>{r.due_date}</span>
                      ) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatPrice(Number(r.amount), currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatPrice(Number(r.running), currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {paymentTermsDays != null && (
          <p className="text-xs text-muted-foreground">
            Invoices on this account fall due {paymentTermsDays} days after the order date.
          </p>
        )}
      </Card>

      {!readOnly && (
        <>
          <RecordAccountPaymentDialog
            open={payOpen}
            onOpenChange={setPayOpen}
            companyId={companyId}
            profileId={profileId}
            branchId={branchId}
            currency={currency}
          />
          <AccountAdjustmentDialog
            open={adjOpen}
            onOpenChange={setAdjOpen}
            companyId={companyId}
            profileId={profileId}
            branchId={branchId}
            currency={currency}
          />
        </>
      )}
    </div>
  );
}
