import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuoteSpecBuilder from "@/components/quotes/QuoteSpecBuilder";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";

export default function AdminQuoteSpecCreate() {
  const navigate = useNavigate();
  const { tenantId, appId } = useTenantContext();
  const { activeBranch } = useBranch();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/quotes")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New spec-based quote</h1>
          <p className="text-sm text-muted-foreground">
            Build a priced quote without artwork. The customer can accept the quote
            and upload artwork to convert it into a draft order.
          </p>
        </div>
      </div>

      {tenantId && appId ? (
        <QuoteSpecBuilder
          tenantId={tenantId}
          appId={appId}
          branchId={activeBranch?.id ?? null}
          createdVia="tenant_sales"
          onCreated={(q) => navigate(`/admin/quotes/${q.id}`)}
          onCancel={() => navigate("/admin/quotes")}
        />
      ) : (
        <p className="text-muted-foreground">Loading tenant…</p>
      )}
    </div>
  );
}
