import { CompaniesList } from "@/components/customers/CompaniesList";
import { useTenantContext } from "@/hooks/useTenantContext";
import { buildAdminPath } from "@/lib/adminRouting";

export default function AdminCompanies() {
  const { tenantId } = useTenantContext();
  return (
    <div className="p-6">
      <CompaniesList
        detailPath={(id) => buildAdminPath(`/admin/companies/${id}`, tenantId)}
      />
    </div>
  );
}
