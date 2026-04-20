import { Separator } from "@/components/ui/separator";

interface Props {
  order: any;
  jobs: any[];
  payments: any[];
}

const fmt = (amount: number, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);

export function OrderPricingTab({ order, jobs, payments }: Props) {
  const fulfilmentLine = order.fulfillment_type === "collection"
    ? `Collection${order.branch?.name ? ` — ${order.branch.name}` : ""}`
    : order.fulfillment_type === "delivery"
    ? "Delivery"
    : null;

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
          <div className="flex justify-between">
            <span className="text-muted-foreground">Delivery</span>
            <span>{fmt(order.delivery_amount || 0)}</span>
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

      <div className="flex justify-between text-sm font-bold">
        <span>Amount Due</span>
        <span className={order.amount_due > 0 ? "text-destructive" : "text-green-600"}>
          {fmt(order.amount_due)}
        </span>
      </div>

      {/* Billing address */}
      {/* (Billing will be rendered on the Delivery tab; included here per the reference) */}
    </div>
  );
}
