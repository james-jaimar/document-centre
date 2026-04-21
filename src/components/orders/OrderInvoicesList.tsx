import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Eye, FileText } from "lucide-react";
import { downloadInvoice, viewInvoice, generateInvoice } from "@/lib/orders/mutations";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

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

export function OrderInvoicesList({
  orderId,
  canIssue = false,
}: {
  orderId: string;
  canIssue?: boolean;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const qc = useQueryClient();

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

  const handleIssue = async (kind: "invoice" | "proforma") => {
    setIssuing(true);
    try {
      await generateInvoice({ order_id: orderId, kind });
      toast.success("Invoice generated");
      setTimeout(() => { load(); qc.invalidateQueries({ queryKey: ["order-detail", orderId] }); }, 1500);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" /> Invoices & Receipts
        </h3>
        {canIssue && (
          <Button size="sm" variant="outline" onClick={() => handleIssue("invoice")} disabled={issuing}>
            {issuing ? "Generating..." : "Generate Invoice"}
          </Button>
        )}
      </div>
      <div className="divide-y">
        {loading ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">Loading...</div>
        ) : invoices.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No invoices yet
            {canIssue && (
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => handleIssue("proforma")} disabled={issuing}>
                  Generate Proforma
                </Button>
              </div>
            )}
          </div>
        ) : (
          invoices.map((inv) => (
            <div key={inv.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{inv.invoice_number}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABEL[inv.kind] || inv.kind} · {format(new Date(inv.issued_at), "dd MMM yyyy")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => handleView(inv)} title="View PDF">
                  <Eye className="h-3.5 w-3.5 mr-1" /> View
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDownload(inv)} title="Download PDF">
                  <Download className="h-3.5 w-3.5 mr-1" /> PDF
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
