import { Link } from "react-router-dom";
import { useAdminQuotes } from "@/hooks/useAdminQuotes";
import { formatPrice } from "@/lib/formatCurrency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  approved: "default",
  expired: "outline",
  declined: "destructive",
  converted: "secondary",
  void: "outline",
};

export default function AdminQuotes() {
  const { data, isLoading } = useAdminQuotes();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quotes</h1>
          <p className="text-muted-foreground">Saved quotations for customers across this tenant</p>
        </div>
        <Button asChild>
          <Link to="/admin/quotes/new"><Plus className="h-4 w-4 mr-1" /> New Quote</Link>
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data?.length ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <FileText className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">No quotes yet.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Valid Until</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((q: any) => (
              <TableRow key={q.id}>
                <TableCell className="font-mono">{q.quote_number}</TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{q.customer_name ?? q.customer_email ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground capitalize">
                  {(q.created_via ?? "—").replace(/_/g, " ")}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[q.quote_status] ?? "outline"} className="capitalize">
                    {q.quote_status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {q.valid_until ? new Date(q.valid_until).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatPrice(Number(q.total_amount), q.currency ?? "ZAR")}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/admin/quotes/${q.id}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
