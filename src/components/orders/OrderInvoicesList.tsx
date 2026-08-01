import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Eye, FileText, Send, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { downloadInvoice, viewInvoice, sendInvoiceEmail, generateInvoice } from "@/lib/orders/mutations";
import { toast } from "sonner";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Invoice {
  id: string;
  invoice_number: string;
  kind: string;
  storage_bucket: string;
  storage_path: string;
  total_amount: number;
  currency: string;
  issued_at: string;
}

const KIND_LABEL: Record<string, string> = {
  proforma: "Proforma Invoice",
  invoice: "Tax Invoice",
  credit_note: "Credit Note",
  receipt: "Receipt",
};

export function OrderInvoicesList({ orderId, staff = false }: { orderId: string; staff?: boolean }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [payment, setPayment] = useState<{
    payment_status: string | null;
    amount_paid: number;
    total_amount: number;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: order }] = await Promise.all([
      supabase
        .from("order_invoices")
        .select("*")
        .eq("order_id", orderId)
        .order("issued_at", { ascending: false }),
      supabase
        .from("orders")
        .select("payment_status, amount_paid, total_amount")
        .eq("id", orderId)
        .maybeSingle(),
    ]);
    setInvoices((data || []) as Invoice[]);
    setPayment(
      order
        ? {
            payment_status: (order as any).payment_status ?? null,
            amount_paid: Number((order as any).amount_paid ?? 0),
            total_amount: Number((order as any).total_amount ?? 0),
          }
        : null
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orderId]);

  // Once a tax invoice exists, the proforma is superseded — keep it available
  // for audit, but tuck it away behind a toggle.
  const hasTaxInvoice = invoices.some((i) => i.kind === "invoice");
  const { primary, superseded } = useMemo(() => {
    if (!hasTaxInvoice) return { primary: invoices, superseded: [] as Invoice[] };
    return {
      primary: invoices.filter((i) => i.kind !== "proforma"),
      superseded: invoices.filter((i) => i.kind === "proforma"),
    };
  }, [invoices, hasTaxInvoice]);

  const paidBadge = (kind: string) => {
    if (kind !== "invoice" || !payment) return null;
    const paid = payment.amount_paid;
    const total = payment.total_amount;
    if (payment.payment_status === "paid" || (total > 0 && paid >= total - 0.01)) {
      return { label: "PAID", tone: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
    }
    if (paid > 0) {
      return { label: "PART PAID", tone: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
    }
    return null;
  };


  const handleDownload = async (inv: Invoice) => {
    setBusyId(inv.id);
    try {
      await downloadInvoice(inv.id, `${inv.invoice_number}.pdf`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleView = async (inv: Invoice) => {
    setBusyId(inv.id);
    try {
      await viewInvoice(inv.id, `${inv.invoice_number}.pdf`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleSend = async (inv: Invoice) => {
    setSendingId(inv.id);
    try {
      await sendInvoiceEmail(inv.id, orderId);
      toast.success(`${KIND_LABEL[inv.kind] || "Invoice"} sent to customer`);
      await load();
    } catch (e: any) {
      if (!e?.handled) toast.error(e.message);
    } finally {
      setSendingId(null);
    }
  };

  const handleIssueTaxInvoice = async () => {
    setIssuing(true);
    try {
      await generateInvoice({ order_id: orderId, kind: "invoice" });
      toast.success("Tax invoice issued");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not issue tax invoice");
    } finally {
      setIssuing(false);
    }
  };

  // Paid order that never got its tax invoice (e.g. legacy online payments).
  const needsTaxInvoice =
    staff && !loading && !hasTaxInvoice && payment?.payment_status === "paid" && invoices.length > 0;


  const renderRow = (inv: Invoice, muted = false) => {
    const badge = paidBadge(inv.kind);
    return (
      <div key={inv.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className={cn("text-xs font-medium truncate", muted && "text-muted-foreground")}>
              {inv.invoice_number}
            </p>
            {badge && (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-1.5 py-[1px] text-[10px] font-semibold tracking-wide",
                  badge.tone
                )}
              >
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {KIND_LABEL[inv.kind] || inv.kind} · {format(new Date(inv.issued_at), "dd MMM yyyy")}
            {muted ? " · superseded" : ""}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSend(inv)} disabled={sendingId === inv.id}>
                {sendingId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send to customer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleView(inv)} disabled={busyId === inv.id}>
                {busyId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{busyId === inv.id ? "Refreshing…" : "View PDF"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDownload(inv)} disabled={busyId === inv.id}>
                {busyId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{busyId === inv.id ? "Refreshing…" : "Download PDF"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-3 py-2 border-b">
        <h3 className="font-semibold text-xs flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Invoices & Receipts
        </h3>
      </div>
      <div className="divide-y">
        {loading ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Loading...</div>
        ) : invoices.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No invoices yet
          </div>
        ) : (
          <>
            {primary.map((inv) => renderRow(inv))}
            {superseded.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowSuperseded((v) => !v)}
                  className="w-full px-3 py-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSuperseded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {showSuperseded ? "Hide" : "Show"} earlier documents ({superseded.length})
                </button>
                {showSuperseded && (
                  <div className="divide-y border-t">
                    {superseded.map((inv) => renderRow(inv, true))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

