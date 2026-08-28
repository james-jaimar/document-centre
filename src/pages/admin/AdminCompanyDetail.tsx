import { useParams } from "react-router-dom";
import { CompanyDetailView } from "@/components/customers/CompanyDetailView";
import { useTenantContext } from "@/hooks/useTenantContext";
import { buildAdminPath } from "@/lib/adminRouting";

export default function AdminCompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenantContext();
  if (!id) return null;
  return (
    <CompanyDetailView
      companyId={id}
      backPath={buildAdminPath("/admin/companies", tenantId)}
      customerPath={(pid) => buildAdminPath(`/admin/customers/${pid}`, tenantId)}
    />
  );
}
