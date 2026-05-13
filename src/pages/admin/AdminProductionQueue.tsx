import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Factory, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenantContext } from "@/hooks/useTenantContext";
import { format } from "date-fns";

interface QueueRow {
  id: string;
  job_number: string;
  job_name: string | null;
  product_name: string | null;
  job_status: string;
  urgency: string | null;
  quantity: number;
  ready_at: string | null;
  created_at: string;
  print_ready_pdf_path: string | null;
  imposed_pdf_path: string | null;
  order_id: string;
  order: { order_number: string; tenant_id: string } | null;
}

const ACTIVE_STATUSES = [
  "new_job",
  "awaiting_files",
  "approved_for_production",
  "in_production",
  "outsourced",
  "qa",
];

export default function AdminProductionQueue() {
  const { tenantId } = useTenantContext();

  const { data, isLoading } = useQuery({
    queryKey: ["production-queue", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_jobs")
        .select(
          "id, job_number, job_name, product_name, job_status, urgency, quantity, ready_at, created_at, print_ready_pdf_path, imposed_pdf_path, order_id, order:orders!inner(order_number, tenant_id)"
        )
        .eq("tenant_id", tenantId!)
        .in("job_status", ACTIVE_STATUSES)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as QueueRow[];
    },
  });

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Factory className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">Production Queue</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Active jobs to print, impose, finish and dispatch. Sorted oldest first.
      </p>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">
            {isLoading ? "Loading…" : `${data?.length ?? 0} active jobs`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!data || data.length === 0) && !isLoading ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No jobs in production right now.
            </div>
          ) : (
            <div className="divide-y">
              {data?.map((row) => (
                <Link
                  key={row.id}
                  to={`/admin/orders/${row.order_id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{row.job_number}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs font-medium truncate">{row.job_name || row.product_name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">{row.job_status}</Badge>
                      {row.urgency && row.urgency !== "standard" && (
                        <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{row.urgency}</Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">qty {row.quantity}</span>
                      <span className="text-[10px] text-muted-foreground">
                        Order {row.order?.order_number}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(row.created_at), "d MMM")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {row.print_ready_pdf_path ? (
                      <Badge className="text-[10px] h-4 px-1.5">PR</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 opacity-50">PR</Badge>
                    )}
                    {row.imposed_pdf_path ? (
                      <Badge className="text-[10px] h-4 px-1.5">IMP</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 opacity-50">IMP</Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
