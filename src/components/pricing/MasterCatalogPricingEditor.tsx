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
  usePatchCatalogPaper,
  usePatchCatalogFinishing,
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

/**
 * Display order for size columns. Sizes not in this list are appended
 * alphabetically. Each paper's actual columns are driven by its
 * `stocked_sizes` array so photo/poster stocks show their own sizes
 * instead of empty A4/A3/SRA3 cells.
 */
const SIZE_ORDER = [
  "a4", "a3", "sra3",
  "a5", "a6", "dl",
  "a2", "a1", "a0",
  "photo_4x6", "photo_5x7", "photo_6x8", "photo_8x10",
];

function CatalogPapersPricing({ scopeArgs }: { scopeArgs: { scope: CatalogScope; tenantId: string | null; branchId: string | null } }) {
  const { data: papers = [] } = useCatalogPapers(scopeArgs);
  const { data: prices = [], isLoading } = useCatalogPaperPrices(scopeArgs);
  const upsert = useUpsertCatalogPaperPrice(scopeArgs);
  const del = useDeleteCatalogPaperPrice();
  const patchPaper = usePatchCatalogPaper();

  const canEditPaper = scopeArgs.scope === "master";

  const [draft, setDraft] = useState<Record<string, string>>({});

  /** Map paper_id → { sizeCode → price row }. */
  const pricesByPaper = useMemo(() => {
    const out: Record<string, Record<string, typeof prices[number]>> = {};
    for (const p of prices) {
      const s = (p.size_code || "").toLowerCase();
      if (!s) continue;
      out[p.paper_id] ??= {};
      out[p.paper_id]![s] = p;
    }
    return out;
  }, [prices]);

  const rows = useMemo(
    () =>
      [...papers]
        .filter((p) => p.is_active)
        .sort(
          (a, b) =>
            (a.weight_gsm ?? 0) - (b.weight_gsm ?? 0) ||
            (a.label ?? "").localeCompare(b.label ?? ""),
        ),
    [papers],
  );

  /** Union of every size that any active paper is stocked in (sorted). */
  const allSizes = useMemo(() => {
    const set = new Set<string>();
    for (const p of rows) {
      for (const s of ((p as any).stocked_sizes ?? []) as string[]) {
        set.add(s.toLowerCase());
      }
    }
    const arr = Array.from(set);
    arr.sort((a, b) => {
      const ai = SIZE_ORDER.indexOf(a);
      const bi = SIZE_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return arr;
  }, [rows]);

  /** Coverage: how many active papers have at least one price row. */
  const coverage = useMemo(() => {
    let withPrices = 0;
    for (const p of rows) {
      const byP = pricesByPaper[p.id];
      if (byP && Object.values(byP).some((r) => (r?.sell_price_minor ?? 0) > 0)) {
        withPrices++;
      }
    }
    return { total: rows.length, withPrices };
  }, [rows, pricesByPaper]);

  const cellKey = (paperId: string, size: string) => `${paperId}:${size}`;

  function setCellDraft(paperId: string, size: string, value: string) {
    setDraft((d) => ({ ...d, [cellKey(paperId, size)]: value }));
  }

  async function commitCell(paper: typeof papers[number], size: string, value: string) {
    const minor = Math.round((parseFloat(value) || 0) * 100);
    const row = pricesByPaper[paper.id]?.[size];
    const currentMinor = row?.sell_price_minor ?? 0;
    if (row && minor === currentMinor) {
      setDraft((d) => {
        const next = { ...d };
        delete next[cellKey(paper.id, size)];
        return next;
      });
      return;
    }
    try {
      await upsert.mutateAsync({
        id: row?.id,
        paper_id: paper.id,
        size_code: size,
        sell_price_minor: minor,
        is_active: true,
      } as any);
      setDraft((d) => {
        const next = { ...d };
        delete next[cellKey(paper.id, size)];
        return next;
      });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function removeCell(paperId: string, size: string) {
    const row = pricesByPaper[paperId]?.[size];
    if (!row) return;
    if (!confirm(`Remove ${size.toUpperCase()} pricing for this paper?`)) return;
    try {
      await del.mutateAsync(row.id);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  async function addSizeToPaper(paper: typeof papers[number], size: string) {
    const current = ((paper as any).stocked_sizes ?? []) as string[];
    if (current.map((s) => s.toLowerCase()).includes(size)) return;
    try {
      await patchPaper.mutateAsync({
        id: paper.id,
        patch: { stocked_sizes: [...current, size] },
      });
      // Seed an editable 0.00 price row.
      await upsert.mutateAsync({
        paper_id: paper.id,
        size_code: size,
        sell_price_minor: 0,
        is_active: true,
      } as any);
    } catch (e: any) {
      toast({ title: "Add size failed", description: e.message, variant: "destructive" });
    }
  }

  async function toggleCover(paper: typeof papers[number]) {
    const next = !(paper as any).is_cover_stock;
    try {
      await patchPaper.mutateAsync({ id: paper.id, patch: { is_cover_stock: next } });
    } catch (e: any) {
      toast({ title: "Toggle failed", description: e.message, variant: "destructive" });
    }
  }

  async function toggleEdgeToEdge(paper: typeof papers[number]) {
    const next = !(paper as any).is_edge_to_edge_only;
    try {
      await patchPaper.mutateAsync({ id: paper.id, patch: { is_edge_to_edge_only: next } });
    } catch (e: any) {
      toast({ title: "Toggle failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-xs text-muted-foreground max-w-3xl">
          One row per paper stock. Columns are the sizes each stock is held in
          — A4 / A3 / SRA3 for office stocks, photo and poster sizes for
          their respective stocks. Child sizes (A5, A6, DL, business cards…)
          are derived by imposition at quote time and charged as whole parent
          sheets. Leave a cell blank if the paper isn't stocked in that size.
        </p>
        <Badge variant={coverage.withPrices < coverage.total ? "secondary" : "outline"} className="shrink-0">
          {coverage.withPrices} / {coverage.total} priced
        </Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Paper</TableHead>
            <TableHead className="w-16">GSM</TableHead>
            <TableHead>Finish</TableHead>
            {allSizes.map((s) => (
              <TableHead key={s} className="w-24 uppercase">{s.replace("_", " ")} (R)</TableHead>
            ))}
            <TableHead>Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((paper) => {
            const stocked = new Set(
              (((paper as any).stocked_sizes ?? []) as string[]).map((s) => s.toLowerCase()),
            );
            return (
              <TableRow key={paper.id}>
                <TableCell className="text-sm font-medium">{paper.label}</TableCell>
                <TableCell>{paper.weight_gsm}</TableCell>
                <TableCell className="capitalize text-muted-foreground">{paper.finish}</TableCell>
                {allSizes.map((size) => {
                  if (!stocked.has(size)) {
                    if (!canEditPaper) {
                      return <TableCell key={size} className="text-center text-muted-foreground/40">—</TableCell>;
                    }
                    return (
                      <TableCell key={size} className="text-center">
                        <button
                          type="button"
                          onClick={() => addSizeToPaper(paper, size)}
                          className="text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded px-2 py-1 transition-colors"
                          title={`Add ${size.toUpperCase()} to this paper`}
                        >
                          + Add
                        </button>
                      </TableCell>
                    );
                  }
                  const row = pricesByPaper[paper.id]?.[size];
                  const valueStr =
                    draft[cellKey(paper.id, size)] ??
                    (row ? (row.sell_price_minor / 100).toFixed(2) : "");
                  return (
                    <TableCell key={size}>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="—"
                        className="h-8 w-20 text-sm"
                        value={valueStr}
                        onChange={(e) => setCellDraft(paper.id, size, e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value.trim() === "" && !row) return;
                          if (e.target.value.trim() === "" && row) {
                            removeCell(paper.id, size);
                            return;
                          }
                          commitCell(paper, size, e.target.value);
                        }}
                      />
                    </TableCell>
                  );
                })}
                <TableCell className="space-x-1">
                  {canEditPaper ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleCover(paper)}
                        title="Click to toggle cover stock"
                      >
                        <Badge
                          variant={(paper as any).is_cover_stock ? "secondary" : "outline"}
                          className={`text-[10px] cursor-pointer ${(paper as any).is_cover_stock ? "" : "opacity-40 hover:opacity-80"}`}
                        >
                          Cover
                        </Badge>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleEdgeToEdge(paper)}
                        title="Click to toggle SRA3-only / edge-to-edge"
                      >
                        <Badge
                          variant={(paper as any).is_edge_to_edge_only ? "secondary" : "outline"}
                          className={`text-[10px] cursor-pointer ${(paper as any).is_edge_to_edge_only ? "" : "opacity-40 hover:opacity-80"}`}
                        >
                          SRA3-only
                        </Badge>
                      </button>
                    </>
                  ) : (
                    <>
                      {(paper as any).is_cover_stock && (
                        <Badge variant="secondary" className="text-[10px]">Cover</Badge>
                      )}
                      {(paper as any).is_edge_to_edge_only && (
                        <Badge variant="outline" className="text-[10px]">SRA3-only</Badge>
                      )}
                    </>
                  )}
                  {paper.category === "coloured" && (
                    <Badge variant="outline" className="text-[10px] capitalize">{paper.category}</Badge>
                  )}
                  {stocked.size === 0 && (
                    <Badge variant="destructive" className="text-[10px]">No sizes set</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3 + allSizes.length + 1} className="text-center text-sm text-muted-foreground py-6">
                No paper stocks yet. Add them in <strong>Master Catalogue → Papers</strong>.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
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
  const patchFinishing = usePatchCatalogFinishing();
  const canEdit = scopeArgs.scope === "master";

  const CATEGORY_OPTIONS = [
    "binding", "cover", "folding", "guillotining", "hole_punching",
    "inserts", "lamination", "packaging", "special", "stapling",
    "tab_dividers", "trimming",
  ];
  const BASIS_OPTIONS = ["per_unit", "per_sheet", "per_set"];

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

  async function changeItem(
    row: { id: string; size_code: string | null },
    newFinishingId: string,
  ) {
    try {
      await upsert.mutateAsync({
        id: row.id,
        finishing_id: newFinishingId,
        size_code: row.size_code ?? "any",
      } as any);
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  }

  async function changeSize(
    row: { id: string; finishing_id: string },
    newSize: string,
  ) {
    try {
      await upsert.mutateAsync({
        id: row.id,
        finishing_id: row.finishing_id,
        size_code: newSize,
      } as any);
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  }

  async function changeFinishingField(
    finishingId: string,
    patch: { category?: string; pricing_basis?: string },
  ) {
    try {
      await patchFinishing.mutateAsync({ id: finishingId, patch });
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
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
                <TableCell className="text-sm">
                  {canEdit ? (
                    <Select
                      value={row.finishing_id}
                      onValueChange={(v) => changeItem(row, v)}
                    >
                      <SelectTrigger className="h-8 w-[180px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((i) => (
                          <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    row.item?.label
                  )}
                </TableCell>
                <TableCell className="text-xs capitalize">
                  {canEdit && row.item ? (
                    <Select
                      value={row.item.category ?? ""}
                      onValueChange={(v) => changeFinishingField(row.finishing_id, { category: v })}
                    >
                      <SelectTrigger className="h-8 w-[150px] text-xs capitalize">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c} value={c} className="capitalize">
                            {c.replace("_", " ")}
                          </SelectItem>
                        ))}
                        {row.item.category && !CATEGORY_OPTIONS.includes(row.item.category) && (
                          <SelectItem value={row.item.category} className="capitalize">
                            {row.item.category.replace("_", " ")}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    row.item?.category ?? "—"
                  )}
                </TableCell>
                <TableCell>
                  {canEdit && row.item ? (
                    <Select
                      value={row.item.pricing_basis ?? "per_unit"}
                      onValueChange={(v) => changeFinishingField(row.finishing_id, { pricing_basis: v })}
                    >
                      <SelectTrigger className="h-8 w-[120px] text-xs capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BASIS_OPTIONS.map((b) => (
                          <SelectItem key={b} value={b} className="capitalize">
                            {b.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      {(row.item?.pricing_basis ?? "per_unit").replace("_", " ")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {canEdit ? (
                    <Select
                      value={row.size_code ?? "any"}
                      onValueChange={(v) => changeSize(row, v)}
                    >
                      <SelectTrigger className="h-8 w-[120px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        {sizes.map((s) => (
                          <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    row.size?.label ?? row.size_code ?? "Any"
                  )}
                </TableCell>
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
