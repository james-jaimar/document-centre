import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { useState } from "react";
import { requestPayment } from "@/lib/orders/mutations";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatCurrency";

interface Props {
  order: any;
  jobs: any[];
  payments: any[];
  addresses?: any[];
}

export function OrderPricingTab({ order, jobs, payments, addresses = [] }: Props) {
  // Use the order's stored currency for every price render so non-ZAR
  // orders display in their own currency / locale.
  const currency = (order?.currency as string | undefined) ?? "ZAR";
  const fmt = (amount: number) => formatPrice(Number(amount ?? 0), currency);
  const [requesting, setRequesting] = useState(false);

  const billing = addresses.find((a: any) => a.address_type === "billing");

  const fulfilmentLine = order.fulfillment_type === "collection"
    ? `Collection${order.branch?.name ? ` — ${order.branch.name}` : ""}`
    : order.fulfillment_type === "delivery"
    ? "Delivery"
    : null;

  const deliveryDescription = order.metadata?.delivery_description as string | undefined;

  const handleRequestPayment = async () => {
    setRequesting(true);
    try {
      await requestPayment(order.id);
      toast.success("Payment request sent to customer");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4 text-sm">
      {fulfilmentLine && (
        <div className="flex justify-between text-xs border-b pb-2">
          <span className="text-muted-foreground">Fulfilment</span>
          <span className="font-medium">{fulfilmentLine}</span>
        </div>
      )}
      {/* Job line items */}
      {jobs.length > 0 && (
        <div className="space-y-1">
          {jobs.map((job: any) => (
            <div key={job.id} className="flex justify-between text-xs">
              <span className="truncate max-w-[200px]">
                {job.job_number} {job.product_name}
              </span>
              <span className="font-medium">{fmt(job.net_price)}</span>
            </div>
          ))}
        </div>
      )}

      <Separator />

      {/* Subtotals */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Net Price</span>
          <span className="font-medium">{fmt(order.subtotal)}</span>
        </div>
        {(order.fulfillment_type === "delivery" || order.delivery_amount > 0) && (
          <div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery</span>
              <span>{fmt(order.delivery_amount || 0)}</span>
            </div>
            {deliveryDescription && (
              <p className="text-[11px] text-muted-foreground mt-0.5 ml-0.5">{deliveryDescription}</p>
            )}
          </div>
        )}
        {order.discount_amount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span className="text-green-600">-{fmt(order.discount_amount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">VAT (15%)</span>
          <span>{fmt(order.vat_amount)}</span>
        </div>
      </div>

      <Separator />

      <div className="flex justify-between text-sm font-semibold">
        <span>Total</span>
        <span>{fmt(order.total_amount)}</span>
      </div>

      {/* Payments */}
      {payments.length > 0 && (
        <div className="space-y-1 text-xs">
          {payments.map((p: any) => (
            <div key={p.id} className="flex justify-between">
              <span>Paid with {p.provider}</span>
              <span className="text-green-600 font-medium">{fmt(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center text-sm font-bold">
        <span>Amount Due</span>
        <span className={order.amount_due > 0 ? "text-destructive" : "text-green-600"}>
          {fmt(order.amount_due)}
        </span>
      </div>

      {/* Request Payment button */}
      {order.amount_due > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={handleRequestPayment}
          disabled={requesting}
        >
          <Send className="h-3.5 w-3.5 mr-2" />
          {requesting ? "Sending..." : "Request Payment"}
        </Button>
      )}

      {/* Billing Address */}
      {billing && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Billing Address</p>
            <div className="space-y-0.5 text-xs">
              {billing.company_name && <p className="font-medium">{billing.company_name}</p>}
              {billing.contact_name && <p>{billing.contact_name}</p>}
              {billing.line1 && <p>{billing.line1}</p>}
              {billing.line2 && <p>{billing.line2}</p>}
              {billing.suburb && <p>{billing.suburb}</p>}
              {billing.city && <p>{billing.city}</p>}
              {(billing.postal_code || billing.province) && (
                <p>{[billing.postal_code, billing.province].filter(Boolean).join(" ")}</p>
              )}
              {billing.country && <p>{billing.country}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
