// Branch Reports page — sales summary, detailed orders, payments/cash-up
// and VAT views, with Excel / CSV export and a print-to-PDF view.
// Manager-only (gated in the sidebar and at the top of this page).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenantContext } from "@/hooks/useTenantContext";
import { isBranchManagerRole } from "@/lib/auth/branchPermissions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";

interface ReportPayload {
  meta: {
    branch: { id: string; name: string; slug: string };
    tenant: { id: string | null; name: string | null };
    from: string;
    to: string;
    generated_at: string;
    basis_note: string;
  };
  summary: {
    currency: string;
    cash: { gross: number; refunds: number; net: number; payments_count: number };
    accrual: {
      orders_count: number;
      subtotal: number;
      vat: number;
      delivery: number;
      discount: number;
      total: number;
      avg_order_value: number;
    };
  };
  by_day: Array<{ date: string; gross: number; refunds: number; net: number; payments: number }>;
  by_provider: Array<{ provider: string; count: number; gross: number; refunds: number; net: number }>;
  orders: Array<{
    id: string;
    order_number: string | null;
    submitted_at: string | null;
    created_at: string;
    status: string | null;
    payment_status: string | null;
    fulfillment_type: string | null;
    customer_name: string | null;
    customer_email: string | null;
    company_name: string | null;
    subtotal: number;
    vat_amount: number;
    delivery_amount: number;
    discount_amount: number;
    total_amount: number;
    amount_paid: number;
    amount_due: number;
    paid_in_period: number;
    refunded_in_period: number;
    net_in_period: number;
    currency: string;
    is_demo: boolean;
  }>;
  payments: Array<{
    id: string;
    order_id: string;
    order_number: string | null;
    customer_name: string | null;
    provider: string;
    provider_transaction_id: string | null;
    payment_reference: string | null;
    status: string;
    amount: number;
    currency: string;
    paid_at: string;
  }>;
}

// ─── Date helpers ────────────────────────────────────────────────────────
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfThisMonth() {
  const d = new Date();
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}
function today() {
  return ymd(new Date());
}
function addMonthsYmd(base: string, n: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m - 1) + n, d));
  return ymd(dt);
}
function firstOfMonth(offset = 0): string {
  const now = new Date();
  return ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)));
}
function lastOfMonth(offset = 0): string {
  const now = new Date();
  return ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0)));
}

// ─── Formatters ─────────────────────────────────────────────────────────
function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `${currency} ${(n ?? 0).toFixed(2)}`;
  }
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}
function fmtDateOnly(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

// ─── CSV helper ─────────────────────────────────────────────────────────
function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const out: string[] = [headers.join(",")];
  for (const row of rows) {
    out.push(headers.map((h) => escape(row[h])).join(","));
  }
  return out.join("\n");
}

function download(filename: string, data: BlobPart, type = "text/plain") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Excel builder ──────────────────────────────────────────────────────
async function buildExcel(report: ReportPayload): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Document Centre";
  wb.created = new Date();
  const currency = report.summary.currency;
  const money = `"${currency}" #,##0.00;[Red]-"${currency}" #,##0.00`;

  // Summary sheet
  const s1 = wb.addWorksheet("Summary");
  s1.columns = [{ width: 32 }, { width: 22 }];
  s1.addRow(["Branch", report.meta.branch.name]);
  s1.addRow(["Tenant", report.meta.tenant.name ?? "—"]);
  s1.addRow(["Period", `${report.meta.from} → ${report.meta.to}`]);
  s1.addRow(["Generated", new Date(report.meta.generated_at).toLocaleString("en-ZA")]);
  s1.addRow([]);
  s1.addRow(["Cash basis (received in period)"]).font = { bold: true } as any;
  s1.addRow(["Gross received", report.summary.cash.gross]).getCell(2).numFmt = money;
  s1.addRow(["Refunds", report.summary.cash.refunds]).getCell(2).numFmt = money;
  s1.addRow(["Net cash", report.summary.cash.net]).getCell(2).numFmt = money;
  s1.addRow(["Payments count", report.summary.cash.payments_count]);
  s1.addRow([]);
  s1.addRow(["Accrual basis (orders submitted in period)"]).font = { bold: true } as any;
  s1.addRow(["Orders count", report.summary.accrual.orders_count]);
  s1.addRow(["Subtotal (excl VAT)", report.summary.accrual.subtotal]).getCell(2).numFmt = money;
  s1.addRow(["VAT", report.summary.accrual.vat]).getCell(2).numFmt = money;
  s1.addRow(["Delivery", report.summary.accrual.delivery]).getCell(2).numFmt = money;
  s1.addRow(["Discount", report.summary.accrual.discount]).getCell(2).numFmt = money;
  s1.addRow(["Total (incl VAT)", report.summary.accrual.total]).getCell(2).numFmt = money;
  s1.addRow(["Average order value", report.summary.accrual.avg_order_value]).getCell(2).numFmt = money;
  s1.addRow([]);
  s1.addRow(["Notes"]).font = { bold: true } as any;
  s1.addRow([report.meta.basis_note]);

  // By day
  const s2 = wb.addWorksheet("By Day (Cash)");
  s2.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Payments", key: "payments", width: 12 },
    { header: "Gross", key: "gross", width: 16, style: { numFmt: money } as any },
    { header: "Refunds", key: "refunds", width: 16, style: { numFmt: money } as any },
    { header: "Net", key: "net", width: 16, style: { numFmt: money } as any },
  ];
  s2.getRow(1).font = { bold: true };
  report.by_day.forEach((r) => s2.addRow(r));

  // By provider
  const s3 = wb.addWorksheet("By Provider");
  s3.columns = [
    { header: "Provider", key: "provider", width: 18 },
    { header: "Payments", key: "count", width: 12 },
    { header: "Gross", key: "gross", width: 16, style: { numFmt: money } as any },
    { header: "Refunds", key: "refunds", width: 16, style: { numFmt: money } as any },
    { header: "Net", key: "net", width: 16, style: { numFmt: money } as any },
  ];
  s3.getRow(1).font = { bold: true };
  report.by_provider.forEach((r) => s3.addRow(r));

  // Detailed orders
  const s4 = wb.addWorksheet("Orders");
  s4.columns = [
    { header: "Order #", key: "order_number", width: 14 },
    { header: "Submitted", key: "submitted_at", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Payment", key: "payment_status", width: 14 },
    { header: "Fulfilment", key: "fulfillment_type", width: 12 },
    { header: "Customer", key: "customer", width: 26 },
    { header: "Email", key: "email", width: 26 },
    { header: "Subtotal", key: "subtotal", width: 14, style: { numFmt: money } as any },
    { header: "VAT", key: "vat", width: 12, style: { numFmt: money } as any },
    { header: "Delivery", key: "delivery", width: 12, style: { numFmt: money } as any },
    { header: "Discount", key: "discount", width: 12, style: { numFmt: money } as any },
    { header: "Total", key: "total", width: 14, style: { numFmt: money } as any },
    { header: "Paid in period", key: "paid", width: 14, style: { numFmt: money } as any },
    { header: "Refunded in period", key: "refunded", width: 16, style: { numFmt: money } as any },
    { header: "Net in period", key: "net", width: 14, style: { numFmt: money } as any },
  ];
  s4.getRow(1).font = { bold: true };
  for (const o of report.orders) {
    s4.addRow({
      order_number: o.order_number ?? "",
      submitted_at: o.submitted_at ? new Date(o.submitted_at) : null,
      status: o.status ?? "",
      payment_status: o.payment_status ?? "",
      fulfillment_type: o.fulfillment_type ?? "",
      customer: o.customer_name ?? o.company_name ?? "",
      email: o.customer_email ?? "",
      subtotal: o.subtotal,
      vat: o.vat_amount,
      delivery: o.delivery_amount,
      discount: o.discount_amount,
      total: o.total_amount,
      paid: o.paid_in_period,
      refunded: o.refunded_in_period,
      net: o.net_in_period,
    });
  }

  // Payments / cash-up
  const s5 = wb.addWorksheet("Payments");
  s5.columns = [
    { header: "Paid at", key: "paid_at", width: 20 },
    { header: "Order #", key: "order_number", width: 14 },
    { header: "Customer", key: "customer", width: 26 },
    { header: "Provider", key: "provider", width: 14 },
    { header: "Reference", key: "reference", width: 26 },
    { header: "Status", key: "status", width: 12 },
    { header: "Amount", key: "amount", width: 14, style: { numFmt: money } as any },
  ];
  s5.getRow(1).font = { bold: true };
  for (const p of report.payments) {
    s5.addRow({
      paid_at: p.paid_at ? new Date(p.paid_at) : null,
      order_number: p.order_number ?? "",
      customer: p.customer_name ?? "",
      provider: p.provider,
      reference: p.provider_transaction_id ?? p.payment_reference ?? "",
      status: p.status,
      amount: p.amount,
    });
  }

  // VAT
  const s6 = wb.addWorksheet("VAT");
  s6.columns = [
    { header: "Order #", key: "order_number", width: 14 },
    { header: "Submitted", key: "submitted_at", width: 20 },
    { header: "Subtotal", key: "subtotal", width: 14, style: { numFmt: money } as any },
    { header: "VAT", key: "vat", width: 14, style: { numFmt: money } as any },
    { header: "Total", key: "total", width: 14, style: { numFmt: money } as any },
    { header: "VAT rate", key: "rate", width: 10 },
  ];
  s6.getRow(1).font = { bold: true };
  let vatSub = 0,
    vatVat = 0,
    vatTotal = 0;
  for (const o of report.orders) {
    if (o.status === "cancelled" || o.is_demo) continue;
    const rate = o.subtotal > 0 ? Math.round((o.vat_amount / o.subtotal) * 1000) / 10 : 0;
    vatSub += o.subtotal;
    vatVat += o.vat_amount;
    vatTotal += o.total_amount;
    s6.addRow({
      order_number: o.order_number ?? "",
      submitted_at: o.submitted_at ? new Date(o.submitted_at) : null,
      subtotal: o.subtotal,
      vat: o.vat_amount,
      total: o.total_amount,
      rate: `${rate.toFixed(1)}%`,
    });
  }
  s6.addRow([]);
  const totalsRow = s6.addRow({ order_number: "TOTAL", subtotal: vatSub, vat: vatVat, total: vatTotal });
  totalsRow.font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ─── Page ───────────────────────────────────────────────────────────────
export default function BranchReports() {
  const { tenantId, branchId, membershipRole } = useTenantContext();
  const canManage = isBranchManagerRole(membershipRole);

  const [from, setFrom] = useState<string>(startOfThisMonth());
  const [to, setTo] = useState<string>(today());

  const enabled = !!branchId && canManage;

  const { data, isFetching, refetch, error } = useQuery<ReportPayload>({
    queryKey: ["branch-financial-reports", branchId, from, to],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("branch-financial-reports", {
        body: { branch_id: branchId, from, to },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as ReportPayload;
    },
  });

  const filenameBase = useMemo(() => {
    const slug = data?.meta.branch.slug ?? "branch";
    return `${slug}_report_${from}_to_${to}`;
  }, [data, from, to]);

  if (!canManage) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Reports are only available to branch managers.
          </CardContent>
        </Card>
      </div>
    );
  }

  const setPreset = (kind: "this_month" | "last_month" | "last_30" | "ytd") => {
    if (kind === "this_month") {
      setFrom(startOfThisMonth());
      setTo(today());
    } else if (kind === "last_month") {
      setFrom(firstOfMonth(-1));
      setTo(lastOfMonth(-1));
    } else if (kind === "last_30") {
      setFrom(addMonthsYmd(today(), 0));
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 29);
      setFrom(ymd(d));
      setTo(today());
    } else if (kind === "ytd") {
      const now = new Date();
      setFrom(`${now.getUTCFullYear()}-01-01`);
      setTo(today());
    }
  };

  const handleExportExcel = async () => {
    if (!data) return;
    try {
      const blob = await buildExcel(data);
      download(`${filenameBase}.xlsx`, blob, blob.type);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not build Excel file");
    }
  };

  const handleExportCsv = (which: "orders" | "payments") => {
    if (!data) return;
    if (which === "orders") {
      const rows = data.orders.map((o) => ({
        order_number: o.order_number ?? "",
        submitted_at: o.submitted_at ?? "",
        status: o.status ?? "",
        payment_status: o.payment_status ?? "",
        fulfillment_type: o.fulfillment_type ?? "",
        customer: o.customer_name ?? o.company_name ?? "",
        email: o.customer_email ?? "",
        subtotal: o.subtotal,
        vat: o.vat_amount,
        delivery: o.delivery_amount,
        discount: o.discount_amount,
        total: o.total_amount,
        paid_in_period: o.paid_in_period,
        refunded_in_period: o.refunded_in_period,
        net_in_period: o.net_in_period,
        currency: o.currency,
      }));
      const csv = toCsv(rows, [
        "order_number","submitted_at","status","payment_status","fulfillment_type","customer","email",
        "subtotal","vat","delivery","discount","total","paid_in_period","refunded_in_period","net_in_period","currency",
      ]);
      download(`${filenameBase}_orders.csv`, csv, "text/csv");
    } else {
      const rows = data.payments.map((p) => ({
        paid_at: p.paid_at,
        order_number: p.order_number ?? "",
        customer: p.customer_name ?? "",
        provider: p.provider,
        reference: p.provider_transaction_id ?? p.payment_reference ?? "",
        status: p.status,
        amount: p.amount,
        currency: p.currency,
      }));
      const csv = toCsv(rows, [
        "paid_at","order_number","customer","provider","reference","status","amount","currency",
      ]);
      download(`${filenameBase}_payments.csv`, csv, "text/csv");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Sales, payments and VAT for {data?.meta.branch.name ?? "this branch"}.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="from" className="text-xs">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div>
            <Label htmlFor="to" className="text-xs">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setPreset("this_month")}>This month</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset("last_month")}>Last month</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset("last_30")}>Last 30 days</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset("ytd")}>Year to date</Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 no-print">
        <Button onClick={handleExportExcel} disabled={!data || isFetching}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel (all)
        </Button>
        <Button variant="outline" onClick={() => handleExportCsv("orders")} disabled={!data || isFetching}>
          <Download className="mr-2 h-4 w-4" /> Orders CSV
        </Button>
        <Button variant="outline" onClick={() => handleExportCsv("payments")} disabled={!data || isFetching}>
          <Download className="mr-2 h-4 w-4" /> Payments CSV
        </Button>
        <Button variant="outline" onClick={() => window.print()} disabled={!data || isFetching}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <SummaryCards data={data} loading={isFetching && !data} />

      <Tabs defaultValue="sales">
        <TabsList className="no-print">
          <TabsTrigger value="sales">Sales summary</TabsTrigger>
          <TabsTrigger value="orders">Detailed orders</TabsTrigger>
          <TabsTrigger value="payments">Payments / cash-up</TabsTrigger>
          <TabsTrigger value="vat">VAT</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4 space-y-4">
          <ByDayCard data={data} loading={isFetching && !data} />
          <ByProviderCard data={data} loading={isFetching && !data} />
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <OrdersCard data={data} loading={isFetching && !data} />
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <PaymentsCard data={data} loading={isFetching && !data} />
        </TabsContent>

        <TabsContent value="vat" className="mt-4">
          <VatCard data={data} loading={isFetching && !data} />
        </TabsContent>
      </Tabs>

      {data && (
        <p className="text-xs text-muted-foreground">{data.meta.basis_note}</p>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-cards ──────────────────────────────────────────────────────────
function SummaryCards({ data, loading }: { data?: ReportPayload; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }
  if (!data) return null;
  const c = data.summary.currency;
  const cells = [
    { label: "Net cash received", value: fmtMoney(data.summary.cash.net, c), sub: `${data.summary.cash.payments_count} payment(s)` },
    { label: "Gross received", value: fmtMoney(data.summary.cash.gross, c), sub: `Refunds ${fmtMoney(data.summary.cash.refunds, c)}` },
    { label: "Orders (submitted)", value: String(data.summary.accrual.orders_count), sub: `Avg ${fmtMoney(data.summary.accrual.avg_order_value, c)}` },
    { label: "VAT (accrual)", value: fmtMoney(data.summary.accrual.vat, c), sub: `Sales (incl VAT) ${fmtMoney(data.summary.accrual.total, c)}` },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      {cells.map((cell) => (
        <Card key={cell.label}>
          <CardHeader className="pb-1"><CardDescription>{cell.label}</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{cell.value}</div>
            <div className="text-xs text-muted-foreground">{cell.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ByDayCard({ data, loading }: { data?: ReportPayload; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cash receipts by day</CardTitle>
        <CardDescription>Based on payment receipt date.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-40 w-full" /> : !data || data.by_day.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No payments in this period.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Payments</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Refunds</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_day.map((r) => (
                <TableRow key={r.date}>
                  <TableCell>{fmtDateOnly(r.date)}</TableCell>
                  <TableCell className="text-right">{r.payments}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.gross, data.summary.currency)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.refunds, data.summary.currency)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(r.net, data.summary.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ByProviderCard({ data, loading }: { data?: ReportPayload; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">By payment provider</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-32 w-full" /> : !data || data.by_provider.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No payment activity.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Payments</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Refunds</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_provider.map((r) => (
                <TableRow key={r.provider}>
                  <TableCell className="capitalize">{r.provider}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.gross, data.summary.currency)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.refunds, data.summary.currency)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(r.net, data.summary.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function OrdersCard({ data, loading }: { data?: ReportPayload; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Orders submitted in period</CardTitle>
        <CardDescription>Accrual view. Cancelled and demo orders are flagged.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading ? <Skeleton className="h-40 w-full" /> : !data || data.orders.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No orders in this period.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.order_number ?? "—"}</TableCell>
                  <TableCell className="text-xs">{fmtDate(o.submitted_at ?? o.created_at)}</TableCell>
                  <TableCell>
                    <div className="truncate max-w-[200px]">{o.customer_name ?? o.company_name ?? "—"}</div>
                    {o.is_demo && <Badge variant="outline" className="mt-1">demo</Badge>}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{o.status ?? "—"}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{o.payment_status ?? "—"}</Badge></TableCell>
                  <TableCell className="text-right">{fmtMoney(o.subtotal, o.currency)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(o.vat_amount, o.currency)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(o.total_amount, o.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentsCard({ data, loading }: { data?: ReportPayload; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payments received (cash-up)</CardTitle>
        <CardDescription>Sorted by receipt time. Negative amounts are refunds.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading ? <Skeleton className="h-40 w-full" /> : !data || data.payments.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No payments in this period.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paid at</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payments
                .slice()
                .sort((a, b) => (a.paid_at < b.paid_at ? -1 : 1))
                .map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{fmtDate(p.paid_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{p.order_number ?? "—"}</TableCell>
                  <TableCell className="truncate max-w-[200px]">{p.customer_name ?? "—"}</TableCell>
                  <TableCell className="capitalize">{p.provider}</TableCell>
                  <TableCell className="font-mono text-xs truncate max-w-[200px]">{p.provider_transaction_id ?? p.payment_reference ?? "—"}</TableCell>
                  <TableCell><Badge variant={p.status === "refunded" ? "destructive" : "secondary"}>{p.status}</Badge></TableCell>
                  <TableCell className={`text-right font-medium ${p.amount < 0 ? "text-destructive" : ""}`}>{fmtMoney(p.amount, p.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function VatCard({ data, loading }: { data?: ReportPayload; loading: boolean }) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!data) return null;
  const billable = data.orders.filter((o) => o.status !== "cancelled" && !o.is_demo);
  const totals = billable.reduce(
    (acc, o) => {
      acc.subtotal += o.subtotal;
      acc.vat += o.vat_amount;
      acc.total += o.total_amount;
      return acc;
    },
    { subtotal: 0, vat: 0, total: 0 }
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">VAT report</CardTitle>
        <CardDescription>Per-order VAT for orders submitted in the period. Excludes cancelled and demo.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {billable.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No taxable orders in this period.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billable.map((o) => {
                const rate = o.subtotal > 0 ? (o.vat_amount / o.subtotal) * 100 : 0;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.order_number ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fmtDate(o.submitted_at ?? o.created_at)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(o.subtotal, o.currency)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(o.vat_amount, o.currency)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(o.total_amount, o.currency)}</TableCell>
                    <TableCell className="text-right">{rate.toFixed(1)}%</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-semibold bg-muted/50">
                <TableCell colSpan={2}>Totals</TableCell>
                <TableCell className="text-right">{fmtMoney(totals.subtotal, data.summary.currency)}</TableCell>
                <TableCell className="text-right">{fmtMoney(totals.vat, data.summary.currency)}</TableCell>
                <TableCell className="text-right">{fmtMoney(totals.total, data.summary.currency)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
