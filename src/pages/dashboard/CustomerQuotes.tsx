import { Link } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useMyQuotes } from "@/hooks/useQuotes";
import { formatPrice } from "@/lib/formatCurrency";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileText, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  approved: "default",
  expired: "outline",
  declined: "destructive",
  converted: "secondary",
  void: "outline",
};

export default function CustomerQuotes() {
  const { tenantPath } = useTenantSlug();
  const { data: quotes, isLoading } = useMyQuotes();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!quotes?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <FileText className="h-16 w-16 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">No quotes yet</h2>
        <p className="text-muted-foreground text-sm max-w-md text-center">
          Build a cart and tap “Save as Quote” to lock in pricing for sign-off later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Quotes</h1>
        <p className="text-muted-foreground">Saved quotations awaiting approval or expiry</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quote #</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Valid Until</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((q: any) => (
            <TableRow key={q.id}>
              <TableCell className="font-mono">{q.quote_number}</TableCell>
              <TableCell>
                <div className="font-medium text-foreground">{q.name ?? "Saved quote"}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
                </div>
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
                  to={tenantPath(`quotes/${q.id}`)}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  View <ArrowRight className="h-3 w-3" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
