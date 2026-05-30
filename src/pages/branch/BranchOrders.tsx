import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminOrders } from "@/hooks/useOrders";
import { useTenantContext } from "@/hooks/useTenantContext";
import { OrderStatusChips } from "@/components/orders/OrderStatusChips";
import { PaymentStatusChips } from "@/components/orders/PaymentStatusChips";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import {
  ADMIN_STATUS_CONFIG,
  PAYMENT_STATUS_CONFIG,
} from "@/lib/orders/status-maps";
import type { OrderAdminStatus, PaymentStatus, AdminOrderListFilters } from "@/lib/orders/types";
import { format } from "date-fns";
import { formatPrice } from "@/lib/formatCurrency";
import { useUnreadMessagesStaff } from "@/hooks/useUnreadMessages";


const ALL_ADMIN_STATUSES: OrderAdminStatus[] = [
  "new_order", "under_review", "approved", "in_production", "qa",
  "ready_for_dispatch", "completed", "on_hold", "cancelled",
];

const ALL_PAYMENT_STATUSES: PaymentStatus[] = [
  "unpaid", "part_paid", "paid", "refunded",
];

export default function BranchOrders() {
  const navigate = useNavigate();
  const { tenantId, branchId } = useTenantContext();
  const [search, setSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<OrderAdminStatus[]>([]);
  const [selectedPaymentStatuses, setSelectedPaymentStatuses] = useState<PaymentStatus[]>([]);
  const [page, setPage] = useState(1);

  const hasActiveFilters =
    !!search || selectedStatuses.length > 0 || selectedPaymentStatuses.length > 0;

  const filters: AdminOrderListFilters = useMemo(() => ({
    tenant_id: tenantId || undefined,
    branch_id: branchId || undefined,
    search: search || undefined,
    admin_status: selectedStatuses.length ? selectedStatuses : undefined,
    payment_status: selectedPaymentStatuses.length ? selectedPaymentStatuses : undefined,
    page,
    page_size: 25,
  }), [tenantId, branchId, search, selectedStatuses, selectedPaymentStatuses, page]);

  const { data, isLoading } = useAdminOrders(filters);
  const orders = data?.orders || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / (data?.pageSize || 25));
  // When no filters are active, the page total IS the branch total.
  const totalForBranch = hasActiveFilters ? null : total;
  const { data: unreadMap = {} } = useUnreadMessagesStaff(tenantId, branchId);


  const handleToggleStatus = (status: OrderAdminStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
    setPage(1);
  };

  const handleTogglePayment = (status: PaymentStatus) => {
    setSelectedPaymentStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedStatuses([]);
    setSelectedPaymentStatuses([]);
    setPage(1);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const formatCurrency = (amount: number, currency = "ZAR") =>
    formatPrice(Number(amount ?? 0), currency);

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "yyyy/MM/dd, h:mm:ss a");
    } catch {
      return dateStr;
    }
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Order Manager</h1>
          <p className="text-sm text-muted-foreground">Orders assigned to your branch</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 w-64"
          />
        </div>
      </div>

      <div className="space-y-2">
        <OrderStatusChips
          statuses={ALL_ADMIN_STATUSES}
          selected={selectedStatuses}
          onToggle={handleToggleStatus}
        />
        <PaymentStatusChips
          statuses={ALL_PAYMENT_STATUSES}
          selected={selectedPaymentStatuses}
          onToggle={handleTogglePayment}
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-[140px]">Job</TableHead>
              <TableHead>Storefront</TableHead>
              <TableHead>Company Name</TableHead>
              <TableHead>Date Ordered</TableHead>
              <TableHead>Ordered By</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Job Name</TableHead>
              <TableHead className="text-right">QTY</TableHead>
              <TableHead className="text-right">Gross Price</TableHead>
              <TableHead className="text-center">Paid</TableHead>
              <TableHead className="text-center">Ready</TableHead>
              <TableHead className="text-center">Msgs</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={13} className="h-32 text-center text-muted-foreground">
                  Loading orders...
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      {hasActiveFilters
                        ? "No orders match these filters."
                        : "No orders yet for this branch."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totalForBranch} total order{totalForBranch === 1 ? "" : "s"} for this branch.
                    </p>
                    {hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={clearFilters} className="mt-1">
                        Clear filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              orders.flatMap((order: any) => {
                const jobs = order.order_jobs || [];
                if (jobs.length === 0) {
                  return [
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/50 text-xs"
                      onClick={() => navigate(`/branch/orders/${order.id}`)}
                    >
                      <TableCell className="font-mono text-xs font-medium">
                        {order.order_number || "—"}
                      </TableCell>
                      <TableCell>{order.source_channel || "—"}</TableCell>
                      <TableCell>{order.company_name || order.customer_name || "—"}</TableCell>
                      <TableCell>
                        <div className="text-xs">{getTimeAgo(order.created_at)}</div>
                        <div className="text-[10px] text-muted-foreground">{formatDate(order.created_at)}</div>
                      </TableCell>
                      <TableCell>{order.customer_name || "—"}</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.total_amount)}</TableCell>
                      <TableCell className="text-center">
                        <PaymentIcon status={order.payment_status} />
                      </TableCell>
                      <TableCell className="text-center">—</TableCell>
                      <TableCell className="text-center">—</TableCell>
                      <TableCell>
                        <StatusBadge {...ADMIN_STATUS_CONFIG[order.admin_status as keyof typeof ADMIN_STATUS_CONFIG]} />
                      </TableCell>
                    </TableRow>,
                  ];
                }

                return jobs.map((job: any) => (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer hover:bg-muted/50 text-xs"
                    onClick={() => navigate(`/branch/orders/${order.id}`)}
                  >
                    <TableCell className="font-mono text-xs font-medium text-primary">
                      {job.job_number}
                    </TableCell>
                    <TableCell>{order.source_channel || "storefront"}</TableCell>
                    <TableCell className="max-w-[140px] truncate">{order.company_name || order.customer_name || "—"}</TableCell>
                    <TableCell>
                      <div className="text-xs">{getTimeAgo(order.created_at)}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDate(order.created_at)}</div>
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate">{order.customer_name || "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{job.product_name}</TableCell>
                    <TableCell className="max-w-[100px] truncate">{job.job_name || "—"}</TableCell>
                    <TableCell className="text-right">{Number(job.quantity).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(job.gross_price)}</TableCell>
                    <TableCell className="text-center">
                      <PaymentIcon status={order.payment_status} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ReadyIcon status={job.job_status} />
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const u = unreadMap[order.id] || 0;
                        return (
                          <span
                            className={
                              u > 0
                                ? "inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white min-w-[20px]"
                                : "inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground min-w-[20px]"
                            }
                          >
                            {u}
                          </span>
                        );
                      })()}
                    </TableCell>

                    <TableCell>
                      <StatusBadge {...ADMIN_STATUS_CONFIG[order.admin_status as keyof typeof ADMIN_STATUS_CONFIG]} />
                    </TableCell>
                  </TableRow>
                ));
              })
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {((page - 1) * (data?.pageSize || 25)) + 1}–{Math.min(page * (data?.pageSize || 25), total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentIcon({ status }: { status: string }) {
  if (status === "paid")
    return <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" aria-label="Paid" />;
  if (status === "part_paid")
    return <Clock className="h-4 w-4 text-amber-500 mx-auto" aria-label="Part paid" />;
  if (status === "failed")
    return <AlertTriangle className="h-4 w-4 text-red-500 mx-auto" aria-label="Failed" />;
  if (status === "refunded")
    return <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">REF</span>;
  return <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700">UNPAID</span>;
}

function ReadyIcon({ status }: { status: string }) {
  if (status === "ready" || status === "completed") return <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />;
  return <span className="text-muted-foreground text-[10px]">—</span>;
}
