import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Building2, Mail, Pencil, Phone, Plus, Star, UserMinus, Globe, UserPlus,
} from "lucide-react";
import {
  useCustomerCompany, useCompanyMembers, useCompanyMemberMutations, useUnlinkedCustomers,
} from "@/hooks/useCustomerCompanies";
import { CompanyFormDialog } from "@/components/customers/CompanyFormDialog";
import { AddCustomerDialog } from "@/components/admin/AddCustomerDialog";
import { CustomerRowActions } from "@/components/admin/CustomerRowActions";
import { useTenantContext } from "@/hooks/useTenantContext";

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
  const { data: unlinked = [] } = useUnlinkedCustomers();
  const { link, unlink, update } = useCompanyMemberMutations(companyId);
  const [editOpen, setEditOpen] = useState(false);
  const [pick, setPick] = useState<string>("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const { tenantId, appId } = useTenantContext();

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
          <Card className="p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[220px]">
                <div className="text-sm font-semibold">Link an existing customer</div>
                <p className="text-xs text-muted-foreground">
                  Customers not already attached to a company.
                </p>
              </div>
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Choose a customer…" />
                </SelectTrigger>
                <SelectContent>
                  {unlinked.length === 0 ? (
                    <SelectItem value="none" disabled>No unlinked customers</SelectItem>
                  ) : unlinked.map((u) => (
                    <SelectItem key={u.membership_id} value={u.membership_id}>
                      {u.name} · {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!pick || pick === "none" || link.isPending}
                onClick={() => link.mutate(pick, { onSuccess: () => setPick("") })}
              >
                <Plus className="h-4 w-4 mr-1" /> Link
              </Button>
              <Button
                variant="default"
                disabled={!tenantId || !appId}
                onClick={() => setAddUserOpen(true)}
              >
                <UserPlus className="h-4 w-4 mr-1" /> Add user
              </Button>
            </div>

            {tenantId && appId && (
              <AddCustomerDialog
                open={addUserOpen}
                onOpenChange={setAddUserOpen}
                tenantId={tenantId}
                appId={appId}
                lockedCompanyId={company.id}
                lockedCompanyName={company.name}
              />
            )}

            {members.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No users linked to this company yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Job title</TableHead>
                    <TableHead>Primary</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.membership_id}>
                      <TableCell className="font-medium">
                        {customerPath ? (
                          <Link to={customerPath(m.profile_id)} className="hover:underline">
                            {m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}
                          </Link>
                        ) : (
                          m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          defaultValue={m.job_title ?? ""}
                          placeholder="e.g. Marketing manager"
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            if (v !== (m.job_title ?? null)) {
                              update.mutate({ membershipId: m.membership_id, job_title: v });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={m.is_primary_contact ? "default" : "outline"}
                          onClick={() =>
                            update.mutate({
                              membershipId: m.membership_id,
                              is_primary_contact: !m.is_primary_contact,
                            })
                          }
                        >
                          <Star className="h-3.5 w-3.5 mr-1" />
                          {m.is_primary_contact ? "Primary" : "Set primary"}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            title="Remove from company"
                            onClick={() => unlink.mutate(m.membership_id)}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                          <CustomerRowActions
                            customer={{
                              profile_id: m.profile_id,
                              membership_id: m.membership_id,
                              email: m.email,
                              is_active: m.is_active,
                              first_name: m.first_name,
                              last_name: m.last_name,
                              display_name: m.display_name,
                              phone: m.phone,
                            }}
                            tenantId={tenantId}
                            appId={appId}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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
