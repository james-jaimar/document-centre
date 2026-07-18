import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuoteSpecBuilder from "@/components/quotes/QuoteSpecBuilder";
import { useTenantContext } from "@/hooks/useTenantContext";

export default function BranchQuoteSpecCreate() {
  const navigate = useNavigate();
  const { tenantId, appId, branchId } = useTenantContext();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/branch/quotes")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New spec-based quote</h1>
          <p className="text-sm text-muted-foreground">
            Price a job for a customer without artwork. The customer can upload
            files later and it converts into a real order.
          </p>
        </div>
      </div>

      {tenantId && appId && branchId ? (
        <QuoteSpecBuilder
          tenantId={tenantId}
          appId={appId}
          branchId={branchId}
          createdVia="branch_sales"
          onCreated={(q) => navigate(`/branch/quotes/${q.id}`)}
          onCancel={() => navigate("/branch/quotes")}
        />
      ) : (
        <p className="text-muted-foreground">Loading branch context…</p>
      )}
    </div>
  );
}
