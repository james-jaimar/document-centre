import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { downloadInvoice } from "@/lib/orders/mutations";
import { Link } from "react-router-dom";
import { buildAdminPath } from "@/lib/adminRouting";
import { FileText, Download, ExternalLink, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

const KIND_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "proforma", label: "Proforma" },
  { value: "invoice", label: "Invoice" },
  { value: "credit_note", label: "Credit Note" },
  { value: "receipt", label: "Receipt" },
];

const KIND_COLORS: Record<string, string> = {
  proforma: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  invoice: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  credit_note: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  receipt: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
};

export default function AdminDocuments() {
  const { tenantId } = useTenantContext();
  const [kindFilter, setKindFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["admin-documents", tenantId, kindFilter],
    queryFn: async () => {
      let query = supabase
        .from("order_invoices")
        .select("*, orders!inner(order_number, customer_name, customer_email)")
        .order("created_at", { ascending: false });

      if (tenantId) query = query.eq("tenant_id", tenantId);
      if (kindFilter !== "all") query = query.eq("kind", kindFilter);

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const filtered = search
    ? invoices.filter((inv: any) => {
        const s = search.toLowerCase();
        return (
          inv.invoice_number?.toLowerCase().includes(s) ||
          inv.orders?.order_number?.toLowerCase().includes(s) ||
          inv.orders?.customer_name?.toLowerCase().includes(s)
        );
      })
    : invoices;

  const handleDownload = async (inv: any) => {
    try {
      await downloadInvoice(inv.storage_bucket, inv.storage_path, `${inv.invoice_number}.pdf`);
    } catch (err: any) {
      toast.error("Download failed", { description: err.message });
    }
  };

  const stats = {
    total: invoices.length,
    proforma: invoices.filter((i: any) => i.kind === "proforma").length,
    invoice: invoices.filter((i: any) => i.kind === "invoice").length,
    credit_note: invoices.filter((i: any) => i.kind === "credit_note").length,
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Invoices, proformas, and credit notes generated across all orders.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total },
          { label: "Proformas", value: stats.proforma },
          { label: "Invoices", value: stats.invoice },
          { label: "Credit Notes", value: stats.credit_note },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search invoice #, order #, or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading documents…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <FileText size={40} className="opacity-40" />
          <p>No documents found.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv: any) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={KIND_COLORS[inv.kind] ?? ""}>
                      {inv.kind?.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={buildAdminPath(`/admin/orders/${inv.order_id}`, tenantId)}
                      className="text-primary hover:underline"
                    >
                      {inv.orders?.order_number ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {inv.orders?.customer_name || inv.orders?.customer_email || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inv.currency} {Number(inv.total_amount).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.issued_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(inv)}
                        title="Download PDF"
                      >
                        <Download size={16} />
                      </Button>
                      <Button size="sm" variant="ghost" asChild title="View Order">
                        <Link to={buildAdminPath(`/admin/orders/${inv.order_id}`, tenantId)}>
                          <ExternalLink size={16} />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
