import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDown, ArrowUp, Building2, MoreHorizontal, Pencil, Plus, Search, Trash2,
} from "lucide-react";
import {
  useCustomerCompanies, useDeleteCustomerCompany, type CustomerCompany,
} from "@/hooks/useCustomerCompanies";
import { useCompanyAccountSummaries } from "@/hooks/useCompanyAccountSummaries";
import { CompanyFormDialog } from "@/components/customers/CompanyFormDialog";
import { formatPrice } from "@/lib/formatCurrency";
import { cn } from "@/lib/utils";

interface Props {
  /** Builds the link to a company detail page. */
  detailPath: (id: string) => string;
  branchId?: string | null;
  currencyCode?: string;
}

type SortKey =
  | "name" | "credit_limit" | "balance" | "available" | "overdue"
  | "last_order" | "total_spend";

interface Row {
  company: CustomerCompany;
  creditLimit: number | null;
  balance: number;
  available: number | null;
  overdue: number;
  lastOrderAt: string | null;
  totalSpend: number;
  overLimit: boolean;
}

function termsLabel(c: CustomerCompany) {
  if ((c as any).payment_terms_mode === "prepaid") return "Pay on order";
  const d = c.payment_terms_days ?? 0;
  return `${d} days`;
}

function dateLabel(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function CompaniesList({ detailPath, branchId = null, currencyCode = "ZAR" }: Props) {
  const { data, isLoading } = useCustomerCompanies({ branchId });
  const { data: summaries, isLoading: loadingSummary } = useCompanyAccountSummaries({ branchId });
  const remove = useDeleteCustomerCompany();
  const [search, setSearch] = useState("");
  const [onlyOverLimit, setOnlyOverLimit] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerCompany | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomerCompany | null>(null);

  const rows: Row[] = useMemo(() => {
    return (data ?? []).map((c) => {
      const s = summaries?.get(c.id);
      const limit = c.credit_limit == null ? null : Number(c.credit_limit);
      const balance = s?.balance ?? 0;
      const available = limit == null ? null : limit - balance;
      return {
        company: c,
        creditLimit: limit,
        balance,
        available,
        overdue: s?.overdue ?? 0,
        lastOrderAt: s?.last_order_at ?? null,
        totalSpend: s?.total_spend ?? 0,
        overLimit: available != null && available < 0,
      };
    });
  }, [data, summaries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = out.filter(({ company: c }) =>
        [c.name, c.trading_name, c.vat_number, c.mis_account_number]
          .some((v) => (v ?? "").toLowerCase().includes(q)),
      );
    }
    if (onlyOverLimit) out = out.filter((r) => r.overLimit);
    if (onlyOverdue) out = out.filter((r) => r.overdue > 0);

    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: Row): string | number => {
      switch (sortKey) {
        case "credit_limit": return r.creditLimit ?? -1;
        case "balance": return r.balance;
        case "available": return r.available ?? Number.NEGATIVE_INFINITY;
        case "overdue": return r.overdue;
        case "last_order": return r.lastOrderAt ? Date.parse(r.lastOrderAt) : 0;
        case "total_spend": return r.totalSpend;
        default: return r.company.name.toLowerCase();
      }
    };
    return [...out].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }, [rows, search, onlyOverLimit, onlyOverdue, sortKey, sortDir]);

  const totals = useMemo(() => ({
    outstanding: rows.reduce((s, r) => s + r.balance, 0),
    overdue: rows.reduce((s, r) => s + r.overdue, 0),
    overLimit: rows.filter((r) => r.overLimit).length,
  }), [rows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  const SortHead = ({ label, k, right = true }: { label: string; k: SortKey; right?: boolean }) => (
    <TableHead className={right ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          sortKey === k ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {label}
        {sortKey === k && (sortDir === "asc"
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Companies
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Business accounts with credit limits, balances and trading activity.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New company
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total outstanding</div>
          <div className="text-xl font-semibold">{formatPrice(totals.outstanding, currencyCode)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total overdue</div>
          <div className={cn("text-xl font-semibold", totals.overdue > 0 && "text-destructive")}>
            {formatPrice(totals.overdue, currencyCode)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Over credit limit</div>
          <div className={cn("text-xl font-semibold", totals.overLimit > 0 && "text-destructive")}>
            {totals.overLimit} {totals.overLimit === 1 ? "company" : "companies"}
          </div>
        </Card>
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search company, VAT, account no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Toggle pressed={onlyOverLimit} onPressedChange={setOnlyOverLimit} variant="outline" size="sm">
          Over limit
        </Toggle>
        <Toggle pressed={onlyOverdue} onPressedChange={setOnlyOverdue} variant="outline" size="sm">
          Overdue
        </Toggle>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Building2 className="mx-auto h-10 w-10 opacity-40 mb-3" />
            <p>{rows.length === 0 ? "No companies yet." : "No companies match these filters."}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Company" k="name" right={false} />
                <TableHead>Account no.</TableHead>
                <TableHead>Terms</TableHead>
                <SortHead label="Credit limit" k="credit_limit" />
                <SortHead label="Balance" k="balance" />
                <SortHead label="Available" k="available" />
                <SortHead label="Overdue" k="overdue" />
                <SortHead label="Last order" k="last_order" />
                <SortHead label="Total spend" k="total_spend" />
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(({ company: c, ...r }) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link to={detailPath(c.id)} className="hover:underline">{c.name}</Link>
                    {c.is_trade_customer && <Badge className="ml-2 text-[10px]">Trade</Badge>}
                    {c.trading_name && (
                      <div className="text-xs text-muted-foreground">t/a {c.trading_name}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.mis_account_number ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{termsLabel(c)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.creditLimit == null ? "—" : formatPrice(r.creditLimit, currencyCode)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {loadingSummary ? "…" : formatPrice(r.balance, currencyCode)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.overLimit && "text-destructive font-medium")}>
                    {r.available == null ? "—" : formatPrice(r.available, currencyCode)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.overdue > 0 && "text-destructive font-medium")}>
                    {formatPrice(r.overdue, currencyCode)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                    {dateLabel(r.lastOrderAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(r.totalSpend, currencyCode)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.is_active ? "default" : "secondary"}>
                      {c.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditing(c); setFormOpen(true); }}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(c)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CompanyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        company={editing}
        branchId={branchId}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The company record is removed. Linked users and their order history are kept, but they
              will no longer inherit this company's account terms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) {
                  remove.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
