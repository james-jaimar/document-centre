import { useParams, useNavigate } from "react-router-dom";
import { useOrderDetail } from "@/hooks/useOrders";
import { useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { OrderSummaryTab } from "@/components/orders/detail/OrderSummaryTab";
import { OrderPricingTab } from "@/components/orders/detail/OrderPricingTab";
import { OrderDeliveryTab } from "@/components/orders/detail/OrderDeliveryTab";
import { OrderedByTab } from "@/components/orders/detail/OrderedByTab";
import { JobDetailPanel } from "@/components/orders/detail/JobDetailPanel";
import { TimelinePanel } from "@/components/orders/detail/TimelinePanel";
import { buildAdminPath } from "@/lib/adminRouting";

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useTenantContext();
  const { data, isLoading, error } = useOrderDetail(id);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

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
        <Button variant="outline" onClick={() => navigate(buildAdminPath("/admin/orders", tenantId))}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Order Manager
        </Button>
        <p className="text-destructive">Order not found</p>
      </div>
    );
  }

  const { order, jobs, addresses, timeline, messages, payments, documents } = data;
  const selectedJob = selectedJobId
    ? jobs.find((j: any) => j.id === selectedJobId)
    : jobs[0] || null;

  // Auto-select first job
  if (!selectedJobId && jobs.length > 0 && jobs[0]) {
    setSelectedJobId(jobs[0].id);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Button variant="outline" size="sm" onClick={() => navigate(buildAdminPath("/admin/orders", tenantId))}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Order Manager
      </Button>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_360px] gap-4">
        {/* LEFT: Order details + job list */}
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

            <TabsContent value="pricing" className="mt-3">
              <OrderPricingTab order={order} jobs={jobs} payments={payments} />
            </TabsContent>

            <TabsContent value="delivery" className="mt-3">
              <OrderDeliveryTab addresses={addresses} />
            </TabsContent>

            <TabsContent value="ordered_by" className="mt-3">
              <OrderedByTab order={order} />
            </TabsContent>
          </Tabs>
        </div>

        {/* CENTER: Job detail */}
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

        {/* RIGHT: Timeline + messaging */}
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
