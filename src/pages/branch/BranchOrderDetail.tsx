import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useOrderDetail } from "@/hooks/useOrders";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle2, Receipt, Undo2 } from "lucide-react";
import { OrderSummaryTab } from "@/components/orders/detail/OrderSummaryTab";
import { OrderPricingTab } from "@/components/orders/detail/OrderPricingTab";
import { OrderDeliveryTab } from "@/components/orders/detail/OrderDeliveryTab";
import { OrderedByTab } from "@/components/orders/detail/OrderedByTab";
import { JobDetailPanel } from "@/components/orders/detail/JobDetailPanel";
import { TimelinePanel } from "@/components/orders/detail/TimelinePanel";
import { RecordPaymentDialog } from "@/components/orders/RecordPaymentDialog";
import { RefundDialog } from "@/components/orders/RefundDialog";
import { OrderInvoicesList } from "@/components/orders/OrderInvoicesList";
import { recordPaymentEvent } from "@/lib/orders/mutations";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PAYMENT_STATUS_CONFIG } from "@/lib/orders/status-maps";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Branch order detail — same engine as AdminOrderDetail but scoped:
 * the branch user can only reach this page via /branch/orders, and the
 * useOrderDetail hook already enforces RLS (orders.select policy includes
 * a branch-staff clause), so unauthorised access surfaces as "not found".
 */
export default function BranchOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { branchId } = useTenantContext();
  const { data, isLoading, error } = useOrderDetail(id);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const queryClient = useQueryClient();

  // Auto-select first job once data is loaded.
  useEffect(() => {
    if (!selectedJobId && data?.jobs?.[0]) {
      setSelectedJobId(data.jobs[0].id);
    }
  }, [data?.jobs, selectedJobId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !data?.order) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate("/branch/orders")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Order not found, or it isn't assigned to your branch.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { order, jobs, addresses, timeline, messages, payments, documents, orderedByProfile } = data;

  // Defensive: if RLS somehow lets a foreign order through, refuse to render it.
  if (branchId && order.branch_id && order.branch_id !== branchId) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate("/branch/orders")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            This order belongs to another branch.
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedJob = selectedJobId
    ? jobs.find((j: any) => j.id === selectedJobId)
    : jobs[0] || null;

  const handleMarkAsPaid = async () => {
    if (!order || order.amount_due <= 0) return;
    if (!window.confirm(`Mark order ${order.order_number} as fully paid (${order.currency} ${Number(order.amount_due).toFixed(2)})?`)) return;
    setMarkingPaid(true);
    try {
      await recordPaymentEvent({
        order_id: order.id,
        provider: "manual",
        status: "paid",
        amount: Number(order.amount_due),
        currency: order.currency,
        payment_reference: "Marked paid by branch",
      });
      toast.success("Order marked as paid");
      queryClient.invalidateQueries({ queryKey: ["order-detail", order.id] });
      queryClient.invalidateQueries({ queryKey: ["branch-orders"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to mark as paid");
    } finally {
      setMarkingPaid(false);
    }
  };

  const paymentConfig = PAYMENT_STATUS_CONFIG[order.payment_status as keyof typeof PAYMENT_STATUS_CONFIG];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/branch/orders")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{order.order_number || order.id.slice(0, 8)}</span>
            {paymentConfig && <StatusBadge {...paymentConfig} />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {Number(order.amount_paid) > 0 && (
            <Button size="sm" variant="outline" onClick={() => setRefundDialogOpen(true)}>
              <Undo2 className="mr-2 h-4 w-4" /> Refund
            </Button>
          )}
          {order.amount_due > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => setPaymentDialogOpen(true)}>
                <Receipt className="mr-2 h-4 w-4" /> Record Payment
              </Button>
              <Button size="sm" onClick={handleMarkAsPaid} disabled={markingPaid}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {markingPaid ? "Marking..." : "Mark as Paid"}
              </Button>
            </>
          )}
        </div>
      </div>

      <RecordPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        orderId={order.id}
        amountDue={Number(order.amount_due)}
        currency={order.currency}
      />
      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        orderId={order.id}
        amountPaid={Number(order.amount_paid)}
        currency={order.currency}
      />

      {/* 3-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_360px] gap-4">
        {/* LEFT */}
        <div className="space-y-4">
          <div className="text-sm font-medium text-primary">Order Details</div>
          <Tabs defaultValue="summary" className="w-full">
            <TabsList className="w-full grid grid-cols-4 h-8">
              <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
              <TabsTrigger value="pricing" className="text-xs">Pricing</TabsTrigger>
              <TabsTrigger value="delivery" className="text-xs">Delivery</TabsTrigger>
              <TabsTrigger value="ordered_by" className="text-xs">Ordered by</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-3">
              <OrderSummaryTab
                order={order}
                jobs={jobs}
                selectedJobId={selectedJobId}
                onSelectJob={setSelectedJobId}
              />
            </TabsContent>

            <TabsContent value="pricing" className="mt-3 space-y-3">
              <OrderPricingTab order={order} jobs={jobs} payments={payments} addresses={addresses} />
              <OrderInvoicesList orderId={order.id} />
            </TabsContent>

            <TabsContent value="delivery" className="mt-3">
              <OrderDeliveryTab addresses={addresses} order={order} />
            </TabsContent>

            <TabsContent value="ordered_by" className="mt-3">
              <OrderedByTab order={order} orderedByProfile={orderedByProfile} />
            </TabsContent>
          </Tabs>
        </div>

        {/* CENTER */}
        <div>
          <div className="text-sm font-medium text-primary mb-4">Job Details</div>
          {selectedJob ? (
            <JobDetailPanel job={selectedJob} documents={documents} />
          ) : (
            <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
              No jobs in this order
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div>
          <TimelinePanel
            orderId={order.id}
            timeline={timeline}
            messages={messages}
            appId={order.app_id}
            tenantId={order.tenant_id}
          />
        </div>
      </div>
    </div>
  );
}
