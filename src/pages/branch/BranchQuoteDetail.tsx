import { useNavigate, useParams } from "react-router-dom";
import { useBranchQuote, useBranchUpdateQuoteStatus } from "@/hooks/useBranchQuotes";
import { useSendQuoteEmail, useDownloadQuotePdf } from "@/hooks/useQuotes";
import { formatPrice } from "@/lib/formatCurrency";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Mail, XCircle, Loader2, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function BranchQuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: quote, isLoading } = useBranchQuote(id);
  const updateStatus = useBranchUpdateQuoteStatus();
  const sendEmail = useSendQuoteEmail();
  const downloadPdf = useDownloadQuotePdf();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!quote) return <div className="text-muted-foreground">Quote not found.</div>;

  const status = quote.quote_status as string;
  const items = (quote.quote_items as any[]) ?? [];
  const currency = quote.currency ?? "ZAR";

  const handle = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e: any) {
      toast.error(fail, { description: e?.message });
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/branch/quotes")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Quotes
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{quote.quote_number}</h1>
          <p className="text-muted-foreground">
            {quote.customer_name ?? quote.customer_email ?? "Customer"}
            {quote.customer_email && quote.customer_name ? ` · ${quote.customer_email}` : ""}
          </p>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <Badge variant="outline" className="capitalize">{status}</Badge>
            {quote.valid_until && (
              <span className="text-muted-foreground">
                Valid until {new Date(quote.valid_until).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => handle(() => downloadPdf.mutateAsync(quote.id), "PDF opened", "Failed to download PDF")}
            disabled={downloadPdf.isPending}
          >
            {downloadPdf.isPending
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Download className="h-4 w-4 mr-1" />}
            Download PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => handle(() => sendEmail.mutateAsync(quote.id), "Quote emailed to customer", "Failed to email quote")}
            disabled={sendEmail.isPending}
          >
            {sendEmail.isPending
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Mail className="h-4 w-4 mr-1" />}
            Email Quote
          </Button>
          {status === "active" && (
            <>
              <Button
                variant="outline"
                onClick={() => handle(
                  () => updateStatus.mutateAsync({ id: quote.id, status: "approved" }),
                  "Quote approved",
                  "Failed to approve",
                )}
                disabled={updateStatus.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!confirm("Mark this quote as declined?")) return;
                  handle(
                    () => updateStatus.mutateAsync({ id: quote.id, status: "declined" }),
                    "Quote declined",
                    "Failed to decline",
                  );
                }}
                disabled={updateStatus.isPending}
              >
                <XCircle className="h-4 w-4 mr-1" /> Decline
              </Button>
            </>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-center">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.id}>
              <TableCell>
                <div className="font-medium">{i.job_name ?? i.product_name}</div>
                <div className="text-xs text-muted-foreground">{i.product_name}</div>
              </TableCell>
              <TableCell className="text-center">{i.quantity}</TableCell>
              <TableCell className="text-right font-mono">
                {formatPrice(Number(i.unit_price), currency)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatPrice(Number(i.net_price), currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-end border-t pt-4">
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="text-2xl font-bold">{formatPrice(Number(quote.total_amount), currency)}</div>
        </div>
      </div>
    </div>
  );
}
