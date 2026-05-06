import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pencil, MoreVertical, Shield, KeyRound, UserX, UserCheck, Trash2, Mail } from "lucide-react";
import type { TenantMemberRow } from "@/hooks/useTenantMembers";
import type { UserStat } from "@/hooks/useUserOrderStats";
import { formatPrice } from "@/lib/formatCurrency";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Tenant Admin",
  sales: "Sales",
  production: "Production",
  accounts: "Accounts",
  branch_manager: "Branch Manager",
  store_operator: "Store Operator",
  customer: "Customer",
};

const roleBadgeVariant = (role: string) => {
  switch (role) {
    case "owner":
    case "admin":
      return "default";
    case "branch_manager":
    case "store_operator":
      return "secondary";
    case "customer":
      return "secondary";
    default:
      return "outline";
  }
};

const formatRole = (role: string) => ROLE_LABELS[role] ?? role;

// NOTE: Member spend is aggregated across all orders; we render in the
// tenant's reporting currency (ZAR by default). Per-order amounts shown
// elsewhere always honour the order's own stored currency.
const formatCurrency = (n: number) => formatPrice(n, "ZAR").replace(/[,.]00$/, "");

const displayName = (m: TenantMemberRow) => {
  const p = m.profiles;
  if (!p) return "Unknown";
  if (p.first_name || p.last_name) return [p.first_name, p.last_name].filter(Boolean).join(" ");
  return p.display_name || p.email || "Unknown";
};

interface Props {
  members: TenantMemberRow[];
  branches: Array<{ id: string; name: string }> | undefined;
  stats: UserStat[] | undefined;
  onEdit: (m: TenantMemberRow) => void;
  onResetPassword: (m: TenantMemberRow) => void;
  onSetPassword: (m: TenantMemberRow) => void;
  onToggleActive: (m: TenantMemberRow) => void;
  onResendInvite: (m: TenantMemberRow) => void;
  onRemove: (m: TenantMemberRow) => void;
}

export function MembersTable({
  members, branches, stats, onEdit, onResetPassword, onToggleActive, onResendInvite, onRemove,
}: Props) {
  const statsMap = new Map(stats?.map((s) => [s.profile_id, s]) ?? []);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Branch</TableHead>
          <TableHead className="text-right">Orders</TableHead>
          <TableHead className="text-right">Spend</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => {
          const branchName = branches?.find((b) => b.id === m.branch_id)?.name;
          const s = statsMap.get(m.profile_id);
          return (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{displayName(m)}</TableCell>
              <TableCell className="text-muted-foreground">{m.profiles?.email || "—"}</TableCell>
              <TableCell>
                <Badge variant={roleBadgeVariant(m.role) as any}>
                  <Shield size={12} className="mr-1" />
                  {formatRole(m.role)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{branchName || "All"}</TableCell>
              <TableCell className="text-right tabular-nums">{s?.order_count ?? 0}</TableCell>
              <TableCell className="text-right tabular-nums">
                {s ? formatCurrency(s.total_spend) : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={m.is_active ? "default" : "secondary"}>
                  {m.is_active ? "Active" : "Disabled"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(m)} title="Edit">
                    <Pencil size={14} />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-popover">
                      <DropdownMenuItem onClick={() => onResetPassword(m)}>
                        <KeyRound size={14} className="mr-2" /> Force password reset
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onResendInvite(m)}>
                        <Mail size={14} className="mr-2" /> Resend invite email
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {m.is_active ? (
                        <DropdownMenuItem onClick={() => onToggleActive(m)}>
                          <UserX size={14} className="mr-2" /> Disable account
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => onToggleActive(m)}>
                          <UserCheck size={14} className="mr-2" /> Enable account
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onRemove(m)} className="text-destructive">
                        <Trash2 size={14} className="mr-2" /> Remove from tenant
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export { displayName };
