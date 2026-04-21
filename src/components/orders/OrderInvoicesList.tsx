import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Eye, FileText, Send, Loader2 } from "lucide-react";
import { downloadInvoice, viewInvoice, sendInvoiceEmail } from "@/lib/orders/mutations";
import { toast } from "sonner";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

export function OrderInvoicesList({ orderId }: { orderId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("order_invoices")
      .select("*")
      .eq("order_id", orderId)
      .order("issued_at", { ascending: false });
    setInvoices((data || []) as Invoice[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orderId]);

  const handleDownload = async (inv: Invoice) => {
    try {
      await downloadInvoice(inv.id, `${inv.invoice_number}.pdf`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleView = async (inv: Invoice) => {
    try {
      await viewInvoice(inv.id, `${inv.invoice_number}.pdf`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSend = async (inv: Invoice) => {
    setSendingId(inv.id);
    try {
      await sendInvoiceEmail(inv.id, orderId);
      toast.success(`${KIND_LABEL[inv.kind] || "Invoice"} sent to customer`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingId(null);
    }
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
          invoices.map((inv) => (
            <div key={inv.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{inv.invoice_number}</p>
                <p className="text-[11px] text-muted-foreground">
                  {KIND_LABEL[inv.kind] || inv.kind} · {format(new Date(inv.issued_at), "dd MMM yyyy")}
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
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleView(inv)}>
                      <Eye className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>View PDF</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDownload(inv)}>
                      <Download className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download PDF</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
