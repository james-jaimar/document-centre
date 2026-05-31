import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useNavigate, useParams } from "react-router-dom";
import { useOrderDetail } from "@/hooks/useOrders";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Package,
  MessageSquare,
  Send,
  Truck,
  CreditCard,
  FileText,
  Download,
  Calendar,
  Receipt,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { sendMessage, reorderOrder } from "@/lib/orders/mutations";
import { OrderInvoicesList } from "@/components/orders/OrderInvoicesList";
import { CancelOrderDialog } from "@/components/orders/CancelOrderDialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PreviewLightbox from "@/components/order/PreviewLightbox";
import { inferPreviewTypeFromJob } from "@/lib/orders/inferPreviewType";
import PhotoPrintsAdminGallery from "@/components/orders/detail/PhotoPrintsAdminGallery";
import { useMarkOrderReadCustomer } from "@/hooks/useUnreadMessages";
import { useBranch } from "@/contexts/BranchContext";
import { useCustomerSavedOrders } from "@/hooks/useCustomerSavedOrders";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Repeat, Bookmark } from "lucide-react";


const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  in_production: "In Production",
  on_hold: "On Hold",
  proof_pending: "Proof Pending",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
  dispatched: "Dispatched",
};

const CUSTOMER_STATUS_COLOR: Record<string, string> = {
  awaiting_payment: "bg-amber-100 text-amber-800 border-amber-200",
  in_production: "bg-blue-100 text-blue-800 border-blue-200",
  on_hold: "bg-red-100 text-red-800 border-red-200",
  proof_pending: "bg-purple-100 text-purple-800 border-purple-200",
  ready: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-gray-100 text-gray-800 border-gray-200",
  dispatched: "bg-sky-100 text-sky-800 border-sky-200",
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  part_paid: "Part Paid",
  paid: "Paid",
  refunded: "Refunded",
  failed: "Payment Failed",
  requested: "Payment Requested",
};

const PAYMENT_COLOR: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700 border-red-200",
  part_paid: "bg-amber-100 text-amber-800 border-amber-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  refunded: "bg-gray-100 text-gray-700 border-gray-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  requested: "bg-amber-100 text-amber-800 border-amber-200",
};

const JOB_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  in_production: "In Production",
  on_hold: "On Hold",
  proof_pending: "Proof Pending",
  ready: "Ready for Collection",
  completed: "Completed",
  cancelled: "Cancelled",
};

import { formatPrice } from "@/lib/formatCurrency";

const fmt = (amount: number, currency = "ZAR") => formatPrice(Number(amount ?? 0), currency);

const formatBytes = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const CustomerOrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { slug, tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const { tenantId } = useTenantContext();
  const { data, isLoading, error } = useOrderDetail(id);
  const queryClient = useQueryClient();

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [previewJob, setPreviewJob] = useState<any | null>(null);

  const order = data?.order;
  const jobs = data?.jobs ?? [];
  const addresses = data?.addresses ?? [];
  const timeline = data?.timeline ?? [];
  const messages = data?.messages ?? [];
  const payments = data?.payments ?? [];
  const documents = data?.documents ?? [];

  // Mark staff→customer messages as read whenever this order is opened.
  useMarkOrderReadCustomer(id);

  // Auto-resolve the branch from the order itself, so customers arriving
  // from an emailed order link don't get blocked by the branch picker.
  const { allBranches, activeBranch, selectBranch } = useBranch();
  useEffect(() => {
    const branchId = (order as any)?.branch_id;
    if (!branchId) return;
    if (activeBranch?.id === branchId) return;
    const match = allBranches.find((b) => b.id === branchId);
    if (match) selectBranch(match);
  }, [order, allBranches, activeBranch?.id, selectBranch]);





  const handleSendMessage = async () => {
    if (!messageText.trim() || !id) return;
    setSending(true);
    try {
      await sendMessage({
        order_id: id,
        message_body: messageText.trim(),
        sender_type: "customer",
        is_internal: false,
      });
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] });
      toast.success("Message sent");
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [reorderResult, setReorderResult] = useState<{ id: string; number: string; currency?: string } | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const savedOrders = useCustomerSavedOrders();

  const handleReorder = async () => {
    if (!id) return;
    setReordering(true);
    try {
      const res = await reorderOrder({ order_id: id });
      toast.success(`New order ${res.order_number} created`);
      setReorderResult({ id: res.order_id, number: res.order_number, currency: (res as any).currency ?? order?.currency });
    } catch (e: any) {
      toast.error("Failed to reorder", { description: e.message });
    } finally {
      setReordering(false);
    }
  };

  const handlePayNow = async () => {
    if (!order) return;
    try {
      const origin = window.location.origin;
      const returnUrl = `${origin}${tenantPath(`orders/${order.id}`)}`;
      const cancelUrl = `${origin}${tenantPath(`orders/${order.id}`)}?payment=cancelled`;
      const { data, error } = await import("@/integrations/supabase/client").then((m) =>
        m.supabase.functions.invoke("payments-create-session", {
          body: { order_id: order.id, provider: "stripe", return_url: returnUrl, cancel_url: cancelUrl },
        })
      );
      if (error) throw error;
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      toast.info("Pay by EFT — banking details have been emailed");
    } catch (e: any) {
      toast.info("Online payments not available", {
        description: "Please pay via EFT; your store will mark the order paid once received.",
      });
    }
  };

  const handleSaveTemplate = async () => {
    if (!order || !templateName.trim()) return;
    await savedOrders.create.mutateAsync({
      name: templateName.trim(),
      app_id: (order as any).app_id,
      branch_id: (order as any).branch_id ?? null,
      source_order_id: order.id,
      snapshot: { order_number: order.order_number, total_amount: order.total_amount },
    });
    setSaveTemplateOpen(false);
    setTemplateName("");
  };


  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Order not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(tenantPath("orders"))}>
          Back to Orders
        </Button>
      </div>
    );
  }

  if (tenantId && order.tenant_id && order.tenant_id !== tenantId) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">This order doesn't belong to this storefront</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(tenantPath("orders"))}>
          Back to Orders
        </Button>
      </div>
    );
  }

  const delivery = addresses.find((a: any) => a.address_type === "delivery");
  const billing = addresses.find((a: any) => a.address_type === "billing");
  const visibleDocs = documents.filter((d: any) => d.is_customer_visible);

  // Merge timeline + messages for feed
  const feed = [
    ...timeline.filter((t: any) => t.visibility !== "admin").map((t: any) => ({ ...t, _type: "timeline" as const })),
    ...messages.filter((m: any) => !m.is_internal).map((m: any) => ({ ...m, _type: "message" as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const branch = (order as any).branch;
  const isCollection = order.fulfillment_type === "collection" || (!delivery && !!branch);
  const fulfilmentMethod = isCollection ? "Collection" : delivery ? "Delivery" : billing ? "Collection" : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate(tenantPath("orders"))}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">
            Order {order.order_number || order.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Placed {format(new Date(order.submitted_at || order.created_at), "dd MMM yyyy 'at' HH:mm")}
          </p>
          {order.submitted_at && (() => {
            const purgeDate = new Date(order.submitted_at);
            purgeDate.setMonth(purgeDate.getMonth() + 12);
            return (
              <p className="text-xs text-muted-foreground/80 mt-0.5">
                Source files retained until {format(purgeDate, "dd MMM yyyy")}
              </p>
            );
          })()}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
              CUSTOMER_STATUS_COLOR[order.customer_status] || "bg-muted text-muted-foreground"
            )}
          >
            {CUSTOMER_STATUS_LABEL[order.customer_status] || order.customer_status}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
              PAYMENT_COLOR[order.payment_status] || "bg-muted text-muted-foreground"
            )}
          >
            {PAYMENT_LABEL[order.payment_status] || order.payment_status}
          </span>
        </div>
      </div>

      {/* Customer actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handleReorder} disabled={reordering}>
          <Repeat className="h-3.5 w-3.5 mr-1.5" />
          {reordering ? "Reordering…" : "Reorder"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSaveTemplateOpen(true)}>
          <Bookmark className="h-3.5 w-3.5 mr-1.5" />
          Save as template
        </Button>
        {["awaiting_payment", "proof_pending"].includes(order.customer_status) &&
          ["new_order", "under_review"].includes(order.admin_status) && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Cancel order
            </Button>
          )}
        {(order.po_number || order.cost_centre) && (
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {order.po_number && <span>PO: <strong className="text-foreground">{order.po_number}</strong></span>}
            {order.cost_centre && <span>Cost Centre: <strong className="text-foreground">{order.cost_centre}</strong></span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items with full spec */}
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Package className="h-4 w-4" /> Items
              </h2>
            </div>
            <div className="divide-y">
              {jobs.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No items in this order
                </div>
              ) : (
                jobs.map((job: any) => {
                  const config = (job.configuration as any) || {};
                  const summary = config.summary || {};
                  const sections = (config.sections as any[]) || [];
                  const jobDocs = visibleDocs.filter((d: any) => d.job_id === job.id);

                  // Collect summary chips (label/value pairs)
                  const summaryChips: { label: string; value: string }[] = [];
                  for (let i = 1; i <= 6; i++) {
                    const label = summary[`primary_spec_${i}_label`];
                    const value = summary[`primary_spec_${i}_value`];
                    if (label && value) summaryChips.push({ label, value });
                  }

                  return (
                    <div key={job.id} className="px-5 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <p className="font-medium text-foreground">{job.product_name}</p>
                          {job.job_name && (
                            <p className="text-sm text-muted-foreground">{job.job_name}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Qty: {job.quantity}
                            {job.unit_label ? ` ${job.unit_label}` : ""}
                          </p>
                          {(config.preview?.thumbnails ?? []).some((t: string) => !!t) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 h-7 text-xs"
                              onClick={() => setPreviewJob(job)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1.5" />
                              View Preview
                            </Button>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-foreground">{fmt(job.gross_price)}</p>
                          <Badge variant="outline" className="text-[10px] mt-1">
                            {JOB_STATUS_LABEL[job.customer_job_status] ||
                              job.customer_job_status?.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </div>

                      {/* Summary spec chips */}
                      {summaryChips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {summaryChips.map((chip, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[11px]"
                            >
                              <span className="text-muted-foreground">{chip.label}:</span>
                              <span className="font-medium text-foreground">{chip.value}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Detailed sections */}
                      {sections.length > 0 && (
                        <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                          {sections.map((sec: any, idx: number) => (
                            <div key={idx}>
                              <p className="text-xs font-semibold text-foreground mb-1.5">
                                {sec.title}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                {(sec.items || []).map((item: any, i: number) => (
                                  <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
                                    <span className="text-muted-foreground">{item.label}</span>
                                    <span className="text-foreground font-medium text-right">
                                      {item.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Photo Prints — visual tile grid (same component as admin) */}
                      {(config.photo_prints || job.product_category === "photo-prints") && (
                        <PhotoPrintsAdminGallery photoPrints={config.photo_prints} />
                      )}

                      {/* Files for this job — hidden for photo prints (gallery shows them visually) */}
                      {jobDocs.length > 0 && !config.photo_prints && job.product_category !== "photo-prints" && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5" /> Files
                          </p>
                          <ul className="space-y-1">
                            {jobDocs.map((doc: any) => (
                              <li
                                key={doc.id}
                                className="flex items-center justify-between rounded-md border bg-card px-2.5 py-1.5 text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate">{doc.file_name}</span>
                                  {doc.file_size_bytes && (
                                    <span className="text-muted-foreground">
                                      · {formatBytes(doc.file_size_bytes)}
                                    </span>
                                  )}
                                </div>
                                {(doc.storage_bucket && doc.storage_path) && (
                                  <button
                                    onClick={async () => {
                                      const { downloadDocument } = await import("@/lib/orders/mutations");
                                      try {
                                        await downloadDocument(doc.id, doc.file_name);
                                      } catch (e: any) {
                                        const { toast } = await import("sonner");
                                        toast.error(e.message);
                                      }
                                    }}
                                    className="text-primary hover:underline flex items-center gap-1"
                                  >
                                    <Download className="h-3 w-3" />
                                    Download
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Fulfilment */}
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Truck className="h-4 w-4" /> Fulfilment
              </h2>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                <div>
                  <span className="text-xs text-muted-foreground">Method</span>
                  <p className="font-medium">{fulfilmentMethod}</p>
                </div>
                {order.date_required && (
                  <div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Required by
                    </span>
                    <p className="font-medium">
                      {format(new Date(order.date_required), "dd MMM yyyy")}
                    </p>
                  </div>
                )}
                {order.turnaround_time_text && (
                  <div>
                    <span className="text-xs text-muted-foreground">Turnaround</span>
                    <p className="font-medium">{order.turnaround_time_text}</p>
                  </div>
                )}
              </div>

              {delivery && (
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs font-semibold text-foreground mb-1.5">Ship to</p>
                  <div className="text-xs space-y-0.5">
                    {delivery.contact_name && <p className="font-medium">{delivery.contact_name}</p>}
                    {delivery.company_name && <p>{delivery.company_name}</p>}
                    {delivery.line1 && <p>{delivery.line1}</p>}
                    {delivery.line2 && <p>{delivery.line2}</p>}
                    {(delivery.suburb || delivery.city) && (
                      <p>{[delivery.suburb, delivery.city].filter(Boolean).join(", ")}</p>
                    )}
                    {(delivery.postal_code || delivery.province) && (
                      <p>{[delivery.postal_code, delivery.province].filter(Boolean).join(" ")}</p>
                    )}
                    {delivery.phone && <p className="text-muted-foreground mt-1">{delivery.phone}</p>}
                    {delivery.instructions && (
                      <p className="text-muted-foreground italic mt-1">
                        Instructions: {delivery.instructions}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {isCollection && branch && (
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs font-semibold text-foreground mb-1.5">Collect from</p>
                  <div className="text-xs space-y-0.5">
                    <p className="font-medium">{branch.name}</p>
                    {branch.address && <p>{branch.address}</p>}
                    {branch.city && <p>{branch.city}</p>}
                    {(branch.postal_code || branch.province) && (
                      <p>{[branch.postal_code, branch.province].filter(Boolean).join(" ")}</p>
                    )}
                    {branch.phone && <p className="text-muted-foreground mt-1">{branch.phone}</p>}
                    {branch.email && <p className="text-muted-foreground">{branch.email}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Your store will contact you when this order is ready for collection.
                  </p>
                </div>
              )}

              {isCollection && !branch && (
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs font-semibold text-foreground mb-1.5">Collection from store</p>
                  <p className="text-xs text-muted-foreground">
                    Your store will contact you when this order is ready for collection.
                  </p>
                </div>
              )}

              {(order as any).tracking_number ? (
                <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs">
                  <p className="font-semibold text-sky-900 mb-1">Tracking</p>
                  <p className="text-sky-900">
                    {(order as any).tracking_carrier && (
                      <span className="font-medium">{(order as any).tracking_carrier} · </span>
                    )}
                    <span className="font-mono">{(order as any).tracking_number}</span>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {order.fulfilment_status === "ready"
                    ? "Ready for collection / dispatch"
                    : "Tracking will appear here once dispatched."}
                </p>
              )}
            </div>
          </div>

          {/* Payment Summary */}
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Payment Summary
              </h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{fmt(order.subtotal)}</span>
                </div>
                {order.delivery_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery</span>
                    <span>{fmt(order.delivery_amount)}</span>
                  </div>
                )}
                {order.discount_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="text-green-600">-{fmt(order.discount_amount)}</span>
                  </div>
                )}
                {Number(order.vat_amount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VAT</span>
                    <span>{fmt(order.vat_amount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span>
                  <span>{fmt(order.total_amount)}</span>
                </div>
                {payments.length > 0 &&
                  payments.map((p: any) => (
                    <div key={p.id} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Paid ({p.provider}){" "}
                        {p.paid_at && (
                          <span className="ml-1">{format(new Date(p.paid_at), "dd MMM")}</span>
                        )}
                      </span>
                      <span className="text-green-600">{fmt(p.amount)}</span>
                    </div>
                  ))}
                <div className="flex justify-between font-bold pt-1">
                  <span>Amount Due</span>
                  <span className={order.amount_due > 0 ? "text-destructive" : "text-green-600"}>
                    {fmt(order.amount_due)}
                  </span>
                </div>
              </div>

              {order.amount_due > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" onClick={handlePayNow} className="gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    Pay Now
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Invoices & Receipts */}
          <OrderInvoicesList orderId={order.id} />
        </div>

        {/* Sidebar: Messages & Timeline */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Messages
            </h3>

            <div className="space-y-2">
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Ask a question about your order..."
                className="w-full min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!messageText.trim() || sending}
                  onClick={handleSendMessage}
                  className="h-7 gap-1 text-xs"
                >
                  <Send className="h-3 w-3" />
                  {sending ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-0 max-h-[500px] overflow-y-auto">
              {feed.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No activity yet</p>
              ) : (
                feed.map((item) => (
                  <div key={item.id} className="border-l-2 border-border pl-3 pb-4 relative">
                    <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-border" />
                    {item._type === "message" ? (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">
                            {item.sender_type === "customer" ? "You" : "Support"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {getTimeAgo(item.created_at)}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "rounded-md px-3 py-2 text-xs",
                            item.sender_type === "customer"
                              ? "bg-primary/10 text-foreground border border-primary/20"
                              : "bg-amber-50 text-amber-900 border border-amber-200"
                          )}
                        >
                          {item.message_body}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            {item.description}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                            {getTimeAgo(item.created_at)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {previewJob && (() => {
        const snap = (previewJob.configuration?.preview ?? {}) as any;
        return (
          <PreviewLightbox
            thumbnailPaths={(snap.thumbnails ?? []) as string[]}
            productType={
              (snap.product_type as any) || inferPreviewTypeFromJob(previewJob)
            }
            effects={snap.effects}
            colorFlags={snap.colorFlags}
            bleedFlags={snap.bleedFlags}
            pageRoles={snap.pageRoles}
            sectionTypes={snap.sectionTypes}
            pageLabels={snap.pageLabels}
            pageColors={snap.pageColors}
            tabPositions={snap.tabPositions}
            displayPageNumbers={snap.displayPageNumbers}
            faceLabels={snap.faceLabels}
            bindingEdge={snap.bindingEdge}
            bindingArt={snap.bindingArt}
            pageAspectRatio={snap.pageAspectRatio ?? undefined}
            onClose={() => setPreviewJob(null)}
          />
        );
      })()}

      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orderId={order.id}
        orderNumber={order.order_number ?? order.id.slice(0, 8)}
        amountPaid={Number((order as any).amount_paid ?? 0)}
        currency={(order as any).currency ?? "ZAR"}
      />

      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save order as template</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Template name</Label>
            <Input
              id="tpl-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={`e.g. ${order.order_number ?? "Monthly reprint"}`}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              You'll be able to re-order this from the Templates tab in My Orders.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={!templateName.trim() || savedOrders.create.isPending}>
              {savedOrders.create.isPending ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerOrderDetail;
