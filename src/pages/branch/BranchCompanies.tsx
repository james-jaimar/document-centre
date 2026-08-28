import { CompaniesList } from "@/components/customers/CompaniesList";
import { useTenantContext } from "@/hooks/useTenantContext";

export default function BranchCompanies() {
  const { branchId } = useTenantContext();
  return (
    <div className="p-6">
      <CompaniesList
        branchId={branchId ?? null}
        detailPath={(id) => `/branch/companies/${id}`}
      />
    </div>
  );
}
