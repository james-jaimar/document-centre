import { useParams } from "react-router-dom";
import { CompanyDetailView } from "@/components/customers/CompanyDetailView";

export default function BranchCompanyDetail() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <CompanyDetailView companyId={id} backPath="/branch/companies" />;
}
