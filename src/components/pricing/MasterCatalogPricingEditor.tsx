import { useMemo, useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

import {
  useCatalogSizes,
  useCatalogPapers,
  useCatalogFinishing,
  type CatalogScope,
} from "@/hooks/useCatalog";
import {
  useCatalogPaperPrices,
  useUpsertCatalogPaperPrice,
  useDeleteCatalogPaperPrice,
  useCatalogFinishingPrices,
  useUpsertCatalogFinishingPrice,
  useDeleteCatalogFinishingPrice,
} from "@/hooks/useCatalogPrices";
import {
  useCloneMasterCatalogToTenant,
  useResyncTenantCatalogFromMaster,
  useCloneTenantCatalogToBranch,
  useResyncBranchCatalogFromTenant,
} from "@/hooks/useCatalogCascade";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  scope?: CatalogScope;
  tenantId?: string | null;
  branchId?: string | null;
  title?: string;
  description?: string;
}

/**
 * Catalogue Pricing editor — binds to `catalog_papers/catalog_paper_prices`
 * and `catalog_finishing/catalog_finishing_prices`, scoped to master/tenant/branch.
 */
export default function MasterCatalogPricingEditor({
  scope = "master",
  tenantId = null,
  branchId = null,
  title,
  description,
}: Props = {}) {
  const scopeArgs = { scope, tenantId, branchId };
  const cloneToTenant = useCloneMasterCatalogToTenant();
  const resyncTenant = useResyncTenantCatalogFromMaster();
  const cloneToBranch = useCloneTenantCatalogToBranch();
  const resyncBranch = useResyncBranchCatalogFromTenant();
  const [confirmResync, setConfirmResync] = useState(false);

  const defaultTitle =
    scope === "tenant" ? "Catalogue Pricing (Tenant)"
    : scope === "branch" ? "Catalogue Pricing (Branch)"
    : "Catalogue Pricing (Master)";
  const defaultDescription =
    scope === "tenant"
      ? "Your tenant's copy of paper-stock and finishing prices. 'Pull missing from master' fills in any new items; 'Re-sync from master' replaces everything."
      : scope === "branch"
      ? "Your branch's copy of paper-stock and finishing prices. 'Pull missing from tenant' fills in new items; 'Re-sync from tenant' replaces everything."
      : "Sell prices for every paper stock and finishing item in the Master Catalogue. Anything you change here flows to tenants and branches on their next pull.";

  async function handlePull() {
    try {
      if (scope === "tenant" && tenantId) {
        await cloneToTenant.mutateAsync(tenantId);
      } else if (scope === "branch" && branchId) {
        await cloneToBranch.mutateAsync(branchId);
      }
      toast({ title: "Pulled missing rows" });
    } catch (e: any) {
      toast({ title: "Pull failed", description: e.message, variant: "destructive" });
    }
  }

  async function handleResync() {
    setConfirmResync(false);
    try {
      if (scope === "tenant" && tenantId) {
        await resyncTenant.mutateAsync(tenantId);
      } else if (scope === "branch" && branchId) {
        await resyncBranch.mutateAsync(branchId);
      }
      toast({ title: "Re-synced" });
    } catch (e: any) {
      toast({ title: "Re-sync failed", description: e.message, variant: "destructive" });
    }
  }

  const pulling = cloneToTenant.isPending || cloneToBranch.isPending;
  const resyncing = resyncTenant.isPending || resyncBranch.isPending;
  const showCascade = scope === "tenant" || scope === "branch";

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{title ?? defaultTitle}</h2>
          <p className="text-sm text-muted-foreground">{description ?? defaultDescription}</p>
        </div>
        {showCascade && (
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={handlePull} disabled={pulling}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {scope === "tenant" ? "Pull missing from master" : "Pull missing from tenant"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmResync(true)} disabled={resyncing}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {scope === "tenant" ? "Re-sync from master" : "Re-sync from tenant"}
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="papers" className="w-full">
        <TabsList>
          <TabsTrigger value="papers">Paper Stocks</TabsTrigger>
          <TabsTrigger value="finishing">Finishing</TabsTrigger>
        </TabsList>
        <TabsContent value="papers" className="mt-4">
          <CatalogPapersPricing scopeArgs={scopeArgs} />
        </TabsContent>
        <TabsContent value="finishing" className="mt-4">
          <CatalogFinishingPricing scopeArgs={scopeArgs} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmResync} onOpenChange={setConfirmResync}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-sync catalogue?</AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>delete all of this {scope}'s catalogue rows</strong> and replace
              them with a fresh copy from the parent scope. Any local edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResync}>Re-sync</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


// ----------------------------------------------------------------------------
// Papers
// ----------------------------------------------------------------------------

function CatalogPapersPricing({ scopeArgs }: { scopeArgs: { scope: CatalogScope; tenantId: string | null; branchId: string | null } }) {
  const { data: papers = [] } = useCatalogPapers(scopeArgs);
  const { data: sizes = [] } = useCatalogSizes(scopeArgs);
  const { data: prices = [], isLoading } = useCatalogPaperPrices(scopeArgs);
  const upsert = useUpsertCatalogPaperPrice(scopeArgs);
  const del = useDeleteCatalogPaperPrice();

  const [adding, setAdding] = useState<{
    paper_id: string;
    size_code: string;
    sell: string;
    cost: string;
  } | null>(null);
  const [draft, setDraft] = useState<Record<string, { sell?: string; cost?: string }>>({});

  const papersById = useMemo(() => Object.fromEntries(papers.map((p) => [p.id, p])), [papers]);
  const sizesByCode = useMemo(() => Object.fromEntries(sizes.map((s) => [s.code, s])), [sizes]);

  const rows = useMemo(
    () =>
      [...prices]
        .map((p) => ({
          ...p,
          paper: papersById[p.paper_id],
          size: sizesByCode[p.size_code],
        }))
        .filter((p) => p.paper)
        .sort(
          (a, b) =>
            (a.paper?.weight_gsm ?? 0) - (b.paper?.weight_gsm ?? 0) ||
            (a.paper?.label ?? "").localeCompare(b.paper?.label ?? "") ||
            (a.size?.sort_order ?? 0) - (b.size?.sort_order ?? 0),
        ),
    [prices, papersById, sizesByCode],
  );

  function setRowDraft(id: string, key: "sell" | "cost", value: string) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
  }

  async function commitPrice(
    row: { id: string; paper_id: string; size_code: string; sell_price_minor: number; cost_price_minor: number | null; is_active: boolean },
    key: "sell_price_minor" | "cost_price_minor",
    value: string,
  ) {
    const minor = Math.round((parseFloat(value) || 0) * 100);
    const current =
      key === "sell_price_minor" ? row.sell_price_minor : row.cost_price_minor ?? 0;
    if (minor === current) return;
    try {
      await upsert.mutateAsync({
        id: row.id,
        paper_id: row.paper_id,
        size_code: row.size_code,
        [key]: minor,
      } as any);
      setDraft((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function toggleActive(row: { id: string; paper_id: string; size_code: string }, v: boolean) {
    try {
      await upsert.mutateAsync({ id: row.id, paper_id: row.paper_id, size_code: row.size_code, is_active: v });
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this price row? The paper stock itself stays in the catalogue.")) return;
    try {
      await del.mutateAsync(id);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  function openAdd() {
    setAdding({ paper_id: "", size_code: "", sell: "0.00", cost: "0.00" });
  }

  async function saveAdd() {
    if (!adding?.paper_id || !adding?.size_code) {
      toast({ title: "Pick a paper and size", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        paper_id: adding.paper_id,
        size_code: adding.size_code,
        sell_price_minor: Math.round((parseFloat(adding.sell) || 0) * 100),
        cost_price_minor: Math.round((parseFloat(adding.cost) || 0) * 100),
        is_active: true,
      } as any);
      setAdding(null);
      toast({ title: "Price added" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          One row per (paper × size). Prices are per sheet. Editing the paper's
          label, weight or finish is done in <strong>Master Catalogue → Papers</strong>.
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add price
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Paper</TableHead>
            <TableHead>GSM</TableHead>
            <TableHead>Finish</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Sell (R)</TableHead>
            <TableHead>Cost (R)</TableHead>
            <TableHead>Active</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const sell =
              draft[row.id]?.sell ?? (row.sell_price_minor / 100).toFixed(2);
            const cost =
              draft[row.id]?.cost ?? ((row.cost_price_minor ?? 0) / 100).toFixed(2);
            return (
              <TableRow key={row.id}>
                <TableCell className="text-sm">{row.paper?.label}</TableCell>
                <TableCell>{row.paper?.weight_gsm}</TableCell>
                <TableCell className="capitalize">{row.paper?.finish}</TableCell>
                <TableCell>{row.size?.label ?? row.size_code}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24 text-sm"
                    value={sell}
                    onChange={(e) => setRowDraft(row.id, "sell", e.target.value)}
                    onBlur={(e) => commitPrice(row, "sell_price_minor", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24 text-sm"
                    value={cost}
                    onChange={(e) => setRowDraft(row.id, "cost", e.target.value)}
                    onBlur={(e) => commitPrice(row, "cost_price_minor", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={row.is_active}
                    onCheckedChange={(v) => toggleActive(row, v)}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => remove(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                No paper prices yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add paper price</DialogTitle>
          </DialogHeader>
          {adding && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Paper stock</Label>
                <Select
                  value={adding.paper_id}
                  onValueChange={(v) => setAdding({ ...adding, paper_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick from Master Catalogue" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {papers
                      .filter((p) => p.is_active)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}{" "}
                          <span className="text-xs opacity-60">
                            ({p.weight_gsm}gsm · {p.finish})
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Size</Label>
                <Select
                  value={adding.size_code}
                  onValueChange={(v) => setAdding({ ...adding, size_code: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick a size" /></SelectTrigger>
                  <SelectContent>
                    {sizes
                      .filter((s) => s.is_active && s.code !== "any")
                      .map((s) => (
                        <SelectItem key={s.id} value={s.code}>{s.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sell price (R)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adding.sell}
                  onChange={(e) => setAdding({ ...adding, sell: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Cost price (R)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adding.cost}
                  onChange={(e) => setAdding({ ...adding, cost: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(null)}>Cancel</Button>
            <Button onClick={saveAdd} disabled={upsert.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Finishing
// ----------------------------------------------------------------------------

function CatalogFinishingPricing({ scopeArgs }: { scopeArgs: { scope: CatalogScope; tenantId: string | null; branchId: string | null } }) {
  const { data: items = [] } = useCatalogFinishing(scopeArgs);
  const { data: sizes = [] } = useCatalogSizes(scopeArgs);
  const { data: prices = [], isLoading } = useCatalogFinishingPrices(scopeArgs);
  const upsert = useUpsertCatalogFinishingPrice(scopeArgs);
  const del = useDeleteCatalogFinishingPrice();

  const [adding, setAdding] = useState<{
    finishing_id: string;
    size_code: string;
    sell: string;
    cost: string;
  } | null>(null);
  const [draft, setDraft] = useState<Record<string, { sell?: string; cost?: string }>>({});

  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const sizesByCode = useMemo(() => Object.fromEntries(sizes.map((s) => [s.code, s])), [sizes]);

  const rows = useMemo(
    () =>
      [...prices]
        .map((p) => ({
          ...p,
          item: itemsById[p.finishing_id],
          size: sizesByCode[p.size_code ?? "any"],
        }))
        .filter((p) => p.item)
        .sort(
          (a, b) =>
            (a.item?.category ?? "").localeCompare(b.item?.category ?? "") ||
            (a.item?.label ?? "").localeCompare(b.item?.label ?? "") ||
            (a.size?.sort_order ?? 0) - (b.size?.sort_order ?? 0),
        ),
    [prices, itemsById, sizesByCode],
  );

  function setRowDraft(id: string, key: "sell" | "cost", value: string) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
  }

  async function commitPrice(
    row: { id: string; finishing_id: string; size_code: string | null; sell_price_minor: number; cost_price_minor: number | null },
    key: "sell_price_minor" | "cost_price_minor",
    value: string,
  ) {
    const minor = Math.round((parseFloat(value) || 0) * 100);
    const current =
      key === "sell_price_minor" ? row.sell_price_minor : row.cost_price_minor ?? 0;
    if (minor === current) return;
    try {
      await upsert.mutateAsync({
        id: row.id,
        finishing_id: row.finishing_id,
        size_code: row.size_code ?? "any",
        [key]: minor,
      } as any);
      setDraft((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function toggleActive(
    row: { id: string; finishing_id: string; size_code: string | null },
    v: boolean,
  ) {
    try {
      await upsert.mutateAsync({
        id: row.id,
        finishing_id: row.finishing_id,
        size_code: row.size_code ?? "any",
        is_active: v,
      });
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this price row? The finishing item itself stays in the catalogue.")) return;
    try {
      await del.mutateAsync(id);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  function openAdd() {
    setAdding({ finishing_id: "", size_code: "any", sell: "0.00", cost: "0.00" });
  }

  async function saveAdd() {
    if (!adding?.finishing_id || !adding?.size_code) {
      toast({ title: "Pick an item and size", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        finishing_id: adding.finishing_id,
        size_code: adding.size_code,
        sell_price_minor: Math.round((parseFloat(adding.sell) || 0) * 100),
        cost_price_minor: Math.round((parseFloat(adding.cost) || 0) * 100),
        is_active: true,
      } as any);
      setAdding(null);
      toast({ title: "Price added" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          One row per (finishing item × size). Use <strong>Any size</strong> for
          items priced the same regardless of paper size. Edit category, pricing
          basis or variant in <strong>Master Catalogue → Finishing</strong>.
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add price
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Basis</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Sell (R)</TableHead>
            <TableHead>Cost (R)</TableHead>
            <TableHead>Active</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const sell =
              draft[row.id]?.sell ?? (row.sell_price_minor / 100).toFixed(2);
            const cost =
              draft[row.id]?.cost ?? ((row.cost_price_minor ?? 0) / 100).toFixed(2);
            return (
              <TableRow key={row.id}>
                <TableCell className="text-sm">{row.item?.label}</TableCell>
                <TableCell className="text-xs capitalize">{row.item?.category ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">
                    {(row.item?.pricing_basis ?? "per_unit").replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell>{row.size?.label ?? row.size_code ?? "Any"}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24 text-sm"
                    value={sell}
                    onChange={(e) => setRowDraft(row.id, "sell", e.target.value)}
                    onBlur={(e) => commitPrice(row, "sell_price_minor", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24 text-sm"
                    value={cost}
                    onChange={(e) => setRowDraft(row.id, "cost", e.target.value)}
                    onBlur={(e) => commitPrice(row, "cost_price_minor", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={row.is_active}
                    onCheckedChange={(v) => toggleActive(row, v)}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => remove(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                No finishing prices yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add finishing price</DialogTitle>
          </DialogHeader>
          {adding && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Finishing item</Label>
                <Select
                  value={adding.finishing_id}
                  onValueChange={(v) => setAdding({ ...adding, finishing_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Pick from Master Catalogue" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {items
                      .filter((i) => i.is_active)
                      .map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.label}{" "}
                          <span className="text-xs opacity-60">({i.category ?? "—"})</span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Size</Label>
                <Select
                  value={adding.size_code}
                  onValueChange={(v) => setAdding({ ...adding, size_code: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any size</SelectItem>
                    {sizes
                      .filter((s) => s.is_active && s.code !== "any")
                      .map((s) => (
                        <SelectItem key={s.id} value={s.code}>{s.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sell price (R)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adding.sell}
                  onChange={(e) => setAdding({ ...adding, sell: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Cost price (R)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adding.cost}
                  onChange={(e) => setAdding({ ...adding, cost: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(null)}>Cancel</Button>
            <Button onClick={saveAdd} disabled={upsert.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
