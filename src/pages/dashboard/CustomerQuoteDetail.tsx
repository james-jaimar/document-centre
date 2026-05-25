import { useNavigate, useParams } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useQuote, useDeclineQuote, useReactivateQuote, useDownloadQuotePdf, useSendQuoteEmail } from "@/hooks/useQuotes";
import { formatPrice } from "@/lib/formatCurrency";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ShoppingCart, XCircle, ArrowLeft, Loader2, Download, Mail } from "lucide-react";
import { toast } from "sonner";

export default function CustomerQuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const { data: quote, isLoading } = useQuote(id);
  const decline = useDeclineQuote();
  const reactivate = useReactivateQuote();
  const downloadPdf = useDownloadQuotePdf();
  const sendEmail = useSendQuoteEmail();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!quote) return <div className="text-muted-foreground">Quote not found.</div>;

  const status = quote.quote_status as string;
  const isActive = status === "active" || status === "approved";
  const items = (quote.quote_items as any[]) ?? [];
  const currency = quote.currency ?? "ZAR";

  const handleAddToCart = async () => {
    try {
      await reactivate.mutateAsync(quote.id);
      toast.success("Quote items added to your cart");
      navigate(tenantPath("cart"));
    } catch (e: any) {
      toast.error("Couldn't reactivate quote", { description: e.message });
    }
  };

  const handleDecline = async () => {
    if (!confirm("Decline this quote? It will be marked as declined.")) return;
    try {
      await decline.mutateAsync(quote.id);
      toast.success("Quote declined");
    } catch (e: any) {
      toast.error("Failed", { description: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(tenantPath("quotes"))}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Quotes
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {quote.quote_number}
          </h1>
          <p className="text-muted-foreground">{quote.name ?? "Saved quote"}</p>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <Badge variant="outline" className="capitalize">{status}</Badge>
            {quote.valid_until && (
              <span className="text-muted-foreground">
                Valid until {new Date(quote.valid_until).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => downloadPdf.mutate(quote.id, {
              onError: (e: any) => toast.error("Couldn't download PDF", { description: e.message }),
            })}
            disabled={downloadPdf.isPending}
          >
            {downloadPdf.isPending
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Download className="h-4 w-4 mr-1" />}
            Download PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => sendEmail.mutate(quote.id, {
              onSuccess: () => toast.success(quote.customer_email ? `Quote emailed to ${quote.customer_email}` : "Quote emailed"),
              onError: (e: any) => toast.error("Couldn't email quote", { description: e.message }),
            })}
            disabled={sendEmail.isPending}
          >
            {sendEmail.isPending
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Mail className="h-4 w-4 mr-1" />}
            Email me a copy
          </Button>
          {isActive && (
            <>
              <Button variant="outline" onClick={handleDecline} disabled={decline.isPending}>
                <XCircle className="h-4 w-4 mr-1" /> Decline
              </Button>
              <Button onClick={handleAddToCart} disabled={reactivate.isPending}>
                {reactivate.isPending
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <ShoppingCart className="h-4 w-4 mr-1" />}
                Add to Cart
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
                <div className="font-medium text-foreground">{i.job_name ?? i.product_name}</div>
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
          <div className="text-2xl font-bold">
            {formatPrice(Number(quote.total_amount), currency)}
          </div>
        </div>
      </div>
    </div>
  );
}
