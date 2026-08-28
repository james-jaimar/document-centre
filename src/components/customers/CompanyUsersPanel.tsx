import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Star, UserMinus, UserPlus } from "lucide-react";
import {
  useCompanyMembers, useCompanyMemberMutations, useUnlinkedCustomers,
} from "@/hooks/useCustomerCompanies";
import { AddCustomerDialog } from "@/components/admin/AddCustomerDialog";
import { CustomerRowActions } from "@/components/admin/CustomerRowActions";
import { useTenantContext } from "@/hooks/useTenantContext";

interface Props {
  companyId: string;
  companyName: string;
  customerPath?: (profileId: string) => string;
}

/** Users linked to a company: add, link, edit job title, set primary, remove. */
export function CompanyUsersPanel({ companyId, companyName, customerPath }: Props) {
  const { data: members = [] } = useCompanyMembers(companyId);
  const { data: unlinked = [] } = useUnlinkedCustomers();
  const { link, unlink, update } = useCompanyMemberMutations(companyId);
  const [pick, setPick] = useState<string>("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const { tenantId, appId } = useTenantContext();

  return (
    <div className="space-y-4">
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
          variant="outline"
          disabled={!pick || pick === "none" || link.isPending}
          onClick={() => link.mutate(pick, { onSuccess: () => setPick("") })}
        >
          <Plus className="h-4 w-4 mr-1" /> Link
        </Button>
        <Button disabled={!tenantId || !appId} onClick={() => setAddUserOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Add user
        </Button>
      </div>

      {tenantId && appId && (
        <AddCustomerDialog
          open={addUserOpen}
          onOpenChange={setAddUserOpen}
          tenantId={tenantId}
          appId={appId}
          lockedCompanyId={companyId}
          lockedCompanyName={companyName}
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
    </div>
  );
}
