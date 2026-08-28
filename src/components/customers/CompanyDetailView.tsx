import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Building2, Mail, Pencil, Phone, Globe,
} from "lucide-react";
import { useCustomerCompany, useCompanyMembers } from "@/hooks/useCustomerCompanies";
import { CompanyFormDialog } from "@/components/customers/CompanyFormDialog";
import { CompanyUsersPanel } from "@/components/customers/CompanyUsersPanel";

interface Props {
  companyId: string;
  backPath: string;
  customerPath?: (profileId: string) => string;
}

function AddressBlock({
  title, lines,
}: { title: string; lines: (string | null)[] }) {
  const rows = lines.filter(Boolean) as string[];
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground mt-1">Not set</div>
      ) : (
        <div className="text-sm mt-1 space-y-0.5">
          {rows.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

export function CompanyDetailView({ companyId, backPath, customerPath }: Props) {
  const { data: company, isLoading } = useCustomerCompany(companyId);
  const { data: members = [] } = useCompanyMembers(companyId);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading || !company) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const delivery = company.delivery_same_as_billing
    ? [company.billing_line1, company.billing_line2, company.billing_suburb,
       company.billing_city, company.billing_province, company.billing_postal_code, company.billing_country]
    : [company.delivery_line1, company.delivery_line2, company.delivery_suburb,
       company.delivery_city, company.delivery_province, company.delivery_postal_code, company.delivery_country];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to={backPath} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All companies
          </Link>
          <h1 className="mt-2 text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> {company.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {company.trading_name && <span>t/a {company.trading_name}</span>}
            {company.email && (
              <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{company.email}</span>
            )}
            {company.phone && (
              <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{company.phone}</span>
            )}
            {company.website && (
              <span className="inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{company.website}</span>
            )}
            {company.is_trade_customer && <Badge>Trade</Badge>}
            <Badge variant={company.is_active ? "default" : "secondary"}>
              {company.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-1" /> Edit
        </Button>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Business profile</TabsTrigger>
          <TabsTrigger value="users">Users ({members.length})</TabsTrigger>
          <TabsTrigger value="account">Account terms</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="p-6 grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Registration</div>
                <div className="text-sm mt-1">{company.registration_number || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">VAT number</div>
                <div className="text-sm mt-1">{company.vat_number || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Industry</div>
                <div className="text-sm mt-1">{company.industry || "—"}</div>
              </div>
              {company.notes && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Internal notes</div>
                  <div className="text-sm mt-1 whitespace-pre-wrap">{company.notes}</div>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <AddressBlock
                title="Billing address"
                lines={[company.billing_line1, company.billing_line2, company.billing_suburb,
                  company.billing_city, company.billing_province, company.billing_postal_code, company.billing_country]}
              />
              <AddressBlock title="Delivery address" lines={delivery} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="p-4">
            <CompanyUsersPanel
              companyId={company.id}
              companyName={company.name}
              customerPath={customerPath}
            />
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <Card className="p-6 grid gap-6 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Pricing tier</div>
              <div className="text-lg font-semibold">{company.is_trade_customer ? "Trade" : "Consumer"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Account no. (MIS)</div>
              <div className="text-lg font-semibold">{company.mis_account_number || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Credit limit</div>
              <div className="text-lg font-semibold">{Number(company.credit_limit ?? 0).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Payment terms</div>
              <div className="text-lg font-semibold">{company.payment_terms_days ?? 0} days</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default discount</div>
              <div className="text-lg font-semibold">{Number(company.default_discount_pct ?? 0)}%</div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <CompanyFormDialog open={editOpen} onOpenChange={setEditOpen} company={company} />
    </div>
  );
}
