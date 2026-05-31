import { useState } from "react";
import {
  useRateCardClicks,
  useRateCardPapers,
  useRateCardFinishing,
  useRateCardPhotoPrints,
  useRateCardBusinessCards,
  useUpdateRateCardClick,
  useInsertRateCardClick,
  useDeleteRateCardClick,
  useUpsertRateCardPaper,
  useDeleteRateCardPaper,
  useUpsertRateCardFinishing,
  useDeleteRateCardFinishing,
  useUpsertRateCardPhotoPrint,
  useDeleteRateCardPhotoPrint,
  useUpsertRateCardBusinessCard,
  useDeleteRateCardBusinessCard,
  useCloneMasterRateCard,
  type RateCardScope,
  type RateCardClick,
  type RateCardPaper,
  type RateCardFinishing,
  type RateCardPhotoPrint,
  type RateCardBusinessCard,
  type FinishingBasis,
} from "@/hooks/useRateCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import TiersButton from "./TiersButton";
import { toast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/formatCurrency";

interface Props {
  scope: RateCardScope;
  tenantId?: string | null;
  branchId?: string | null;
  title?: string;
  description?: string;
  /** Optional resync button (rendered when scope === 'branch') */
  onResync?: () => void | Promise<void>;
  resyncPending?: boolean;
}

const SIZE_PRESETS = ["A4", "A3", "SRA3", "A5", "A6", "DL"];
const FINISH_OPTIONS = ["bond", "gloss", "matt", "silk", "recycled"];
const FINISHING_CATEGORIES = [
  "binding",
  "stapling",
  "lamination",
  "folding",
  "trimming",
  "guillotining",
  "cover",
  "other",
];
const BASES: FinishingBasis[] = [
  "per_unit",
  "per_sheet",
  "per_set",
  "per_cut",
  "per_document",
  "per_page",
];
const PHOTO_SIZE_PRESETS: Array<{ slug: string; label: string; w: number; h: number }> = [
  { slug: "4x6", label: '4×6"', w: 152, h: 102 },
  { slug: "5x7", label: '5×7"', w: 178, h: 127 },
  { slug: "6x8", label: '6×8"', w: 203, h: 152 },
  { slug: "8x10", label: '8×10"', w: 254, h: 203 },
  { slug: "a4", label: "A4", w: 297, h: 210 },
];
const PHOTO_FINISH_OPTIONS = ["gloss", "matte", "lustre"];

export default function RateCardEditor({
  scope,
  tenantId,
  branchId,
  title = "Rate Card",
  description = "Single source of truth for print, paper and finishing prices.",
  onResync,
  resyncPending,
}: Props) {
  const args = { scope, tenantId, branchId };
  const { data: clicks = [], isLoading: clicksLoading } = useRateCardClicks(args);
  const { data: papers = [], isLoading: papersLoading } = useRateCardPapers(args);
  const { data: finishing = [], isLoading: finLoading } = useRateCardFinishing(args);
  const { data: photoPrints = [], isLoading: ppLoading } = useRateCardPhotoPrints(args);
  const { data: businessCards = [], isLoading: bcLoading } = useRateCardBusinessCards(args);

  const cloneMaster = useCloneMasterRateCard();
  const empty = !clicksLoading && !papersLoading && !finLoading && !ppLoading && !bcLoading &&
    clicks.length === 0 && papers.length === 0 && finishing.length === 0 && photoPrints.length === 0 && businessCards.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {scope === "tenant" && tenantId && (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await cloneMaster.mutateAsync(tenantId);
                toast({ title: "Synced rows from master rate card" });
              } catch (e: any) {
                toast({ title: "Sync failed", description: e.message, variant: "destructive" });
              }
            }}
            disabled={cloneMaster.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            {empty ? "Initialise from master" : "Pull missing from master"}
          </Button>
        )}
        {scope === "branch" && branchId && onResync && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onResync()}
            disabled={!!resyncPending}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Re-sync from tenant
          </Button>
        )}
      </div>

      {empty && scope === "tenant" && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          This tenant has no rate card yet. Click <strong>Initialise from master</strong> above
          to seed it from the platform master rate card.
        </Card>
      )}

      {empty && scope === "branch" && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          This branch has no rate card yet. Click <strong>Re-sync from tenant</strong> above
          to pull a full copy of the tenant's pricing.
        </Card>
      )}

      <Tabs defaultValue="clicks" className="w-full">
        <TabsList>
          <TabsTrigger value="clicks">Click Charges</TabsTrigger>
          <TabsTrigger value="papers">Paper Stocks</TabsTrigger>
          <TabsTrigger value="finishing">Finishing</TabsTrigger>
          <TabsTrigger value="photo">Photo Prints</TabsTrigger>
          <TabsTrigger value="business_cards">Business Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="clicks" className="mt-4">
          <ClicksTab clicks={clicks} scope={scope} tenantId={tenantId ?? null} branchId={branchId ?? null} />
        </TabsContent>
        <TabsContent value="papers" className="mt-4">
          <PapersTab papers={papers} scope={scope} tenantId={tenantId ?? null} branchId={branchId ?? null} />
        </TabsContent>
        <TabsContent value="finishing" className="mt-4">
          <FinishingTab finishing={finishing} scope={scope} tenantId={tenantId ?? null} branchId={branchId ?? null} />
        </TabsContent>
        <TabsContent value="photo" className="mt-4">
          <PhotoPrintsTab items={photoPrints} scope={scope} tenantId={tenantId ?? null} branchId={branchId ?? null} />
        </TabsContent>
        <TabsContent value="business_cards" className="mt-4">
          <BusinessCardsTab items={businessCards} scope={scope} tenantId={tenantId ?? null} branchId={branchId ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Clicks tab — full CRUD, dynamic sizes
// ============================================================================
function ClicksTab({
  clicks,
  scope,
  tenantId,
  branchId,
}: {
  clicks: RateCardClick[];
  scope: RateCardScope;
  tenantId: string | null;
  branchId: string | null;
}) {
  const update = useUpdateRateCardClick();
  const insert = useInsertRateCardClick();
  const del = useDeleteRateCardClick();
  const [drafts, setDrafts] = useState<Record<string, { sell?: string; cost?: string }>>({});
  const [adding, setAdding] = useState<{
    size: string;
    colour: "mono" | "colour";
    sides: "simplex" | "duplex";
    sell_price: number;
    cost_price: number;
  } | null>(null);

  function setDraft(id: string, field: "sell" | "cost", value: string) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }

  async function commit(row: RateCardClick, field: "sell_price" | "cost_price", value: string) {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num < 0) return;
    if (num === row[field]) return;
    try {
      await update.mutateAsync({ id: row.id, [field]: num } as any);
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  }

  async function toggleActive(row: RateCardClick, value: boolean) {
    try {
      await update.mutateAsync({ id: row.id, is_active: value });
    } catch (e: any) {
      toast({ title: "Toggle failed", description: e.message, variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this click charge row?")) return;
    try {
      await del.mutateAsync(id);
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  function openAdd() {
    setAdding({
      size: "A4",
      colour: "mono",
      sides: "simplex",
      sell_price: 0,
      cost_price: 0,
    });
  }

  async function saveAdd() {
    if (!adding) return;
    if (!adding.size.trim()) {
      toast({ title: "Size is required", variant: "destructive" });
      return;
    }
    try {
      await insert.mutateAsync({
        scope_type: scope,
        tenant_id: scope === "master" ? null : tenantId,
        branch_id: scope === "branch" ? branchId : null,
        size: adding.size.trim(),
        colour: adding.colour,
        sides: adding.sides,
        sell_price: adding.sell_price,
        cost_price: adding.cost_price,
        is_active: true,
      } as any);
      toast({ title: "Click row added" });
      setAdding(null);
    } catch (e: any) {
      toast({ title: "Add failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          Per-impression (per side) print charge. Add rows for any paper size you bill on (A4, A3, SRA3, A5…).
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add row
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Size</TableHead>
            <TableHead>Colour</TableHead>
            <TableHead>Sides</TableHead>
            <TableHead className="w-32">Sell (R)</TableHead>
            <TableHead className="w-32">Cost (R)</TableHead>
            <TableHead className="w-20">Active</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clicks.map((row) => {
            const sell = drafts[row.id]?.sell ?? String(row.sell_price);
            const cost = drafts[row.id]?.cost ?? String(row.cost_price);
            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.size}</TableCell>
                <TableCell className="capitalize">{row.colour}</TableCell>
                <TableCell className="capitalize">{row.sides}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24 text-sm"
                    value={sell}
                    onChange={(e) => setDraft(row.id, "sell", e.target.value)}
                    onBlur={(e) => commit(row, "sell_price", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24 text-sm"
                    value={cost}
                    onChange={(e) => setDraft(row.id, "cost", e.target.value)}
                    onBlur={(e) => commit(row, "cost_price", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={row.is_active}
                    onCheckedChange={(v) => toggleActive(row, v)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <TiersButton
                      table="clicks"
                      lineId={row.id}
                      label={`${row.size} · ${row.colour} · ${row.sides}`}
                      scope={scope}
                      tenantId={tenantId}
                      branchId={branchId}
                      fallbackSell={Number(row.sell_price)}
                      fallbackCost={Number(row.cost_price)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => remove(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {clicks.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                No click charges configured.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add click charge</DialogTitle>
          </DialogHeader>
          {adding && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Size</Label>
                <Input
                  list="click-size-presets"
                  value={adding.size}
                  onChange={(e) => setAdding({ ...adding, size: e.target.value.toUpperCase() })}
                  placeholder="A4, A3, SRA3, A5…"
                />
                <datalist id="click-size-presets">
                  {SIZE_PRESETS.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <Label className="text-xs">Colour</Label>
                <Select
                  value={adding.colour}
                  onValueChange={(v) => setAdding({ ...adding, colour: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mono">Mono</SelectItem>
                    <SelectItem value="colour">Colour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sides</Label>
                <Select
                  value={adding.sides}
                  onValueChange={(v) => setAdding({ ...adding, sides: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simplex">Simplex</SelectItem>
                    <SelectItem value="duplex">Duplex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div />
              <div>
                <Label className="text-xs">Sell price (R)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adding.sell_price}
                  onChange={(e) => setAdding({ ...adding, sell_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label className="text-xs">Cost price (R)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={adding.cost_price}
                  onChange={(e) => setAdding({ ...adding, cost_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(null)}>Cancel</Button>
            <Button onClick={saveAdd} disabled={insert.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================================
// Papers tab
// ============================================================================
function PapersTab({
  papers,
  scope,
  tenantId,
  branchId,
}: {
  papers: RateCardPaper[];
  scope: RateCardScope;
  tenantId: string | null;
  branchId: string | null;
}) {
  const upsert = useUpsertRateCardPaper();
  const del = useDeleteRateCardPaper();
  const [editing, setEditing] = useState<Partial<RateCardPaper> | null>(null);

  function openNew() {
    setEditing({
      scope_type: scope,
      tenant_id: scope === "master" ? null : (tenantId ?? undefined),
      branch_id: scope === "branch" ? (branchId ?? undefined) : null,
      code: "",
      label: "",
      weight_gsm: 80,
      finish: "bond",
      size: "A4",
      sell_price: 0,
      cost_price: 0,
      sort_order: papers.length * 10 + 100,
      is_active: true,
    } as any);
  }

  async function save() {
    if (!editing?.code || !editing?.label) {
      toast({ title: "Code and label are required", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync(editing as any);
      toast({ title: editing.id ? "Paper updated" : "Paper added" });
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this paper stock?")) return;
    try {
      await del.mutateAsync(id);
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          Paper stocks available across all products. Price is per sheet.
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add paper
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>GSM</TableHead>
            <TableHead>Finish</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Price/sheet</TableHead>
            <TableHead>Active</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {papers.map((p) => (
            <TableRow
              key={p.id}
              className="cursor-pointer hover:bg-muted/40"
              onClick={() => setEditing(p)}
            >
              <TableCell className="font-mono text-xs">{p.code}</TableCell>
              <TableCell className="text-sm">{p.label}</TableCell>
              <TableCell>{p.weight_gsm}</TableCell>
              <TableCell className="capitalize">{p.finish}</TableCell>
              <TableCell>{p.size}</TableCell>
              <TableCell className="font-mono text-xs">
                {formatPrice(p.sell_price, "ZAR")}
              </TableCell>
              <TableCell>
                {p.is_active ? (
                  <Badge variant="outline" className="text-[10px]">Active</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Off</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <TiersButton
                    table="papers"
                    lineId={p.id}
                    label={`${p.label || p.code} · ${p.size}`}
                    scope={scope}
                    tenantId={tenantId}
                    branchId={branchId}
                    fallbackSell={Number(p.sell_price)}
                    fallbackCost={Number(p.cost_price)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(p.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit paper" : "Add paper"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Code</Label>
                  <Input
                    value={editing.code ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, code: e.target.value.toLowerCase() })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={editing.label ?? ""}
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Weight (gsm)</Label>
                  <Input
                    type="number"
                    value={editing.weight_gsm ?? 80}
                    onChange={(e) =>
                      setEditing({ ...editing, weight_gsm: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Finish</Label>
                  <Select
                    value={editing.finish ?? "bond"}
                    onValueChange={(v) => setEditing({ ...editing, finish: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FINISH_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Size</Label>
                  <Input
                    list="paper-size-presets"
                    value={editing.size ?? "A4"}
                    onChange={(e) => setEditing({ ...editing, size: e.target.value.toUpperCase() })}
                    placeholder="A4, A3, SRA3…"
                  />
                  <datalist id="paper-size-presets">
                    {SIZE_PRESETS.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div>
                  <Label className="text-xs">Price per sheet (ZAR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.sell_price ?? 0}
                    onChange={(e) =>
                      setEditing({ ...editing, sell_price: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <Switch
                    checked={editing.is_active ?? true}
                    onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                  />
                  <Label className="text-xs">Active</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================================
// Finishing tab
// ============================================================================
function FinishingTab({
  finishing,
  scope,
  tenantId,
  branchId,
}: {
  finishing: RateCardFinishing[];
  scope: RateCardScope;
  tenantId: string | null;
  branchId: string | null;
}) {
  const upsert = useUpsertRateCardFinishing();
  const del = useDeleteRateCardFinishing();
  const [editing, setEditing] = useState<Partial<RateCardFinishing> | null>(null);

  function openNew() {
    setEditing({
      scope_type: scope,
      tenant_id: scope === "master" ? null : (tenantId ?? undefined),
      branch_id: scope === "branch" ? (branchId ?? undefined) : null,
      code: "",
      label: "",
      category: "binding",
      pricing_basis: "per_unit",
      variant: null,
      size: null,
      sell_price: 0,
      cost_price: 0,
      sort_order: finishing.length * 10 + 100,
      is_active: true,
    } as any);
  }

  async function save() {
    if (!editing?.code || !editing?.label) {
      toast({ title: "Code and label are required", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync(editing as any);
      toast({ title: editing.id ? "Updated" : "Added" });
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this finishing item?")) return;
    try {
      await del.mutateAsync(id);
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  const grouped = finishing.reduce<Record<string, RateCardFinishing[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          Finishing items. Each declares its own pricing basis (per unit, per sheet, etc.).
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add finishing item
        </Button>
      </div>

      {Object.keys(grouped).sort().map((cat) => (
        <div key={cat} className="mb-4">
          <h4 className="text-xs font-semibold text-foreground capitalize mb-1">{cat}</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Basis</TableHead>
                <TableHead>Price</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped[cat].map((f) => (
                <TableRow
                  key={f.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setEditing(f)}
                >
                  <TableCell className="font-mono text-[11px]">{f.code}</TableCell>
                  <TableCell className="text-sm">{f.label}</TableCell>
                  <TableCell className="text-xs">{f.variant ?? "—"}</TableCell>
                  <TableCell className="text-xs">{f.size ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {f.pricing_basis.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatPrice(f.sell_price, "ZAR")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <TiersButton
                        table="finishing"
                        lineId={f.id}
                        label={`${f.label || f.code}${f.variant ? ` · ${f.variant}` : ""}`}
                        scope={scope}
                        tenantId={tenantId}
                        branchId={branchId}
                        fallbackSell={Number(f.sell_price)}
                        fallbackCost={Number(f.cost_price)}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(f.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit finishing item" : "Add finishing item"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Code</Label>
                <Input
                  value={editing.code ?? ""}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toLowerCase() })}
                />
              </div>
              <div>
                <Label className="text-xs">Label</Label>
                <Input
                  value={editing.label ?? ""}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select
                  value={editing.category ?? "binding"}
                  onValueChange={(v) => setEditing({ ...editing, category: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FINISHING_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Pricing basis</Label>
                <Select
                  value={editing.pricing_basis ?? "per_unit"}
                  onValueChange={(v) =>
                    setEditing({ ...editing, pricing_basis: v as FinishingBasis })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BASES.map((b) => (
                      <SelectItem key={b} value={b}>{b.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Variant (optional)</Label>
                <Input
                  value={editing.variant ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, variant: e.target.value || null })
                  }
                  placeholder="e.g. 10mm, gloss"
                />
              </div>
              <div>
                <Label className="text-xs">Size (optional)</Label>
                <Input
                  list="finishing-size-presets"
                  value={editing.size ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, size: e.target.value ? e.target.value.toUpperCase() : null })
                  }
                  placeholder="— any —"
                />
                <datalist id="finishing-size-presets">
                  {SIZE_PRESETS.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Sell price (ZAR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.sell_price ?? 0}
                  onChange={(e) =>
                    setEditing({ ...editing, sell_price: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label className="text-xs">Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================================
// Photo Prints tab
// ============================================================================
function PhotoPrintsTab({
  items,
  scope,
  tenantId,
  branchId,
}: {
  items: RateCardPhotoPrint[];
  scope: RateCardScope;
  tenantId: string | null;
  branchId: string | null;
}) {
  const upsert = useUpsertRateCardPhotoPrint();
  const del = useDeleteRateCardPhotoPrint();
  const [editing, setEditing] = useState<Partial<RateCardPhotoPrint> | null>(null);

  function openNew() {
    setEditing({
      scope_type: scope,
      tenant_id: scope === "master" ? null : (tenantId ?? undefined),
      branch_id: scope === "branch" ? (branchId ?? undefined) : null,
      code: "",
      label: "",
      size_slug: "4x6",
      width_mm: 152,
      height_mm: 102,
      finish: "gloss",
      border_mm: 0,
      sell_price: 0,
      cost_price: 0,
      min_quantity: 1,
      sort_order: items.length * 10 + 100,
      is_active: true,
    } as any);
  }

  function applySizePreset(slug: string) {
    if (!editing) return;
    const preset = PHOTO_SIZE_PRESETS.find((p) => p.slug === slug);
    if (!preset) {
      setEditing({ ...editing, size_slug: slug });
      return;
    }
    setEditing({
      ...editing,
      size_slug: preset.slug,
      width_mm: preset.w,
      height_mm: preset.h,
    });
  }

  async function save() {
    if (!editing?.code || !editing?.label) {
      toast({ title: "Code and label are required", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync(editing as any);
      toast({ title: editing.id ? "Updated" : "Added" });
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this photo print?")) return;
    try {
      await del.mutateAsync(id);
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          Photo print prices. One row per size × finish × border combination. Price is per print.
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add photo print
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Dimensions</TableHead>
            <TableHead>Finish</TableHead>
            <TableHead>Border</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Active</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow
              key={p.id}
              className="cursor-pointer hover:bg-muted/40"
              onClick={() => setEditing(p)}
            >
              <TableCell className="font-mono text-[11px]">{p.code}</TableCell>
              <TableCell className="text-sm">{p.label}</TableCell>
              <TableCell className="font-mono text-xs">{p.size_slug}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {p.width_mm}×{p.height_mm} mm
              </TableCell>
              <TableCell className="capitalize">{p.finish}</TableCell>
              <TableCell className="text-xs">{p.border_mm > 0 ? `${p.border_mm} mm` : "—"}</TableCell>
              <TableCell className="font-mono text-xs">
                {formatPrice(p.sell_price, "ZAR")}
              </TableCell>
              <TableCell>
                {p.is_active ? (
                  <Badge variant="outline" className="text-[10px]">Active</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Off</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <TiersButton
                    table="photo_prints"
                    lineId={p.id}
                    label={`${p.label || p.code} · ${p.size_slug} ${p.finish}`}
                    scope={scope}
                    tenantId={tenantId}
                    branchId={branchId}
                    fallbackSell={Number(p.sell_price)}
                    fallbackCost={Number(p.cost_price)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(p.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                No photo prints configured.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit photo print" : "Add photo print"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Code</Label>
                <Input
                  value={editing.code ?? ""}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toLowerCase() })}
                  placeholder="e.g. 4x6-gloss"
                />
              </div>
              <div>
                <Label className="text-xs">Label</Label>
                <Input
                  value={editing.label ?? ""}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  placeholder='e.g. 4×6" Gloss'
                />
              </div>
              <div>
                <Label className="text-xs">Size preset</Label>
                <Select value={editing.size_slug ?? "4x6"} onValueChange={applySizePreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PHOTO_SIZE_PRESETS.map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.label} ({p.w}×{p.h} mm)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Finish</Label>
                <Select
                  value={editing.finish ?? "gloss"}
                  onValueChange={(v) => setEditing({ ...editing, finish: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PHOTO_FINISH_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Width (mm)</Label>
                <Input
                  type="number"
                  value={editing.width_mm ?? 0}
                  onChange={(e) => setEditing({ ...editing, width_mm: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label className="text-xs">Height (mm)</Label>
                <Input
                  type="number"
                  value={editing.height_mm ?? 0}
                  onChange={(e) => setEditing({ ...editing, height_mm: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label className="text-xs">Border (mm)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={editing.border_mm ?? 0}
                  onChange={(e) => setEditing({ ...editing, border_mm: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label className="text-xs">Min quantity</Label>
                <Input
                  type="number"
                  value={editing.min_quantity ?? 1}
                  onChange={(e) => setEditing({ ...editing, min_quantity: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <Label className="text-xs">Sell price (ZAR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.sell_price ?? 0}
                  onChange={(e) => setEditing({ ...editing, sell_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label className="text-xs">Cost price (ZAR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.cost_price ?? 0}
                  onChange={(e) => setEditing({ ...editing, cost_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label className="text-xs">Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================================
// Business Cards tab — quantity tier × sides × paper × finish → price
// ============================================================================

const BC_PAPER_PRESETS = [
  "350gsm Silk",
  "350gsm Matt",
  "350gsm Gloss",
  "400gsm Uncoated",
  "450gsm Silk",
  "Recycled 350gsm",
];
const BC_FINISH_PRESETS = [
  "none",
  "matt lamination",
  "gloss lamination",
  "soft-touch lamination",
  "spot UV",
  "foil",
  "rounded corners",
  "embossed",
];
const BC_QTY_PRESETS = [50, 100, 250, 500, 1000, 2500, 5000];

function BusinessCardsTab({
  items,
  scope,
  tenantId,
  branchId,
}: {
  items: RateCardBusinessCard[];
  scope: RateCardScope;
  tenantId: string | null;
  branchId: string | null;
}) {
  const upsert = useUpsertRateCardBusinessCard();
  const del = useDeleteRateCardBusinessCard();
  const [editing, setEditing] = useState<Partial<RateCardBusinessCard> | null>(null);

  function openNew() {
    setEditing({
      scope_type: scope,
      tenant_id: scope === "master" ? null : tenantId,
        branch_id: scope === "branch" ? branchId : null,
      code: "",
      label: "",
      quantity: 250,
      sides: "double",
      paper: "350gsm Silk",
      finish: "none",
      sell_price: 0,
      cost_price: 0,
      sort_order: items.length,
      is_active: true,
    });
  }

  async function save() {
    if (!editing?.code || !editing?.label) {
      toast({ title: "Code and label are required", variant: "destructive" });
      return;
    }
    if (!editing.quantity || editing.quantity < 1) {
      toast({ title: "Quantity must be at least 1", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync(editing as any);
      toast({ title: editing.id ? "Updated" : "Added" });
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this business card price?")) return;
    try {
      await del.mutateAsync(id);
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          Business card prices. Add one row per quantity × sides × paper × finish combination.
          Pricing is ad-hoc — there is no formula, each row stands alone.
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add business card price
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Sides</TableHead>
            <TableHead>Paper</TableHead>
            <TableHead>Finish</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Active</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((b) => (
            <TableRow
              key={b.id}
              className="cursor-pointer hover:bg-muted/40"
              onClick={() => setEditing(b)}
            >
              <TableCell className="font-mono text-[11px]">{b.code}</TableCell>
              <TableCell className="text-sm">{b.label}</TableCell>
              <TableCell className="font-mono text-xs">{b.quantity}</TableCell>
              <TableCell className="capitalize text-xs">{b.sides === "double" ? "Double-sided" : "Single-sided"}</TableCell>
              <TableCell className="text-xs">{b.paper}</TableCell>
              <TableCell className="text-xs capitalize">{b.finish}</TableCell>
              <TableCell className="font-mono text-xs">
                {formatPrice(b.sell_price, "ZAR")}
              </TableCell>
              <TableCell>
                {b.is_active ? (
                  <Badge variant="outline" className="text-[10px]">Active</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Off</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <TiersButton
                    table="business_cards"
                    lineId={b.id}
                    label={`${b.label || b.code} · qty ${b.quantity}`}
                    scope={scope}
                    tenantId={tenantId}
                    branchId={branchId}
                    fallbackSell={Number(b.sell_price)}
                    fallbackCost={Number(b.cost_price)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(b.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                No business card prices configured.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit business card price" : "Add business card price"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Code</Label>
                <Input
                  value={editing.code ?? ""}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                  placeholder="e.g. bc-250-double-silk"
                />
              </div>
              <div>
                <Label className="text-xs">Label</Label>
                <Input
                  value={editing.label ?? ""}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  placeholder="e.g. 250 × Double-sided 350gsm Silk"
                />
              </div>
              <div>
                <Label className="text-xs">Quantity</Label>
                <Select
                  value={String(editing.quantity ?? 250)}
                  onValueChange={(v) => setEditing({ ...editing, quantity: parseInt(v) || 0 })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BC_QTY_PRESETS.map((q) => (
                      <SelectItem key={q} value={String(q)}>{q}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Custom quantity</Label>
                <Input
                  type="number"
                  value={editing.quantity ?? 0}
                  onChange={(e) => setEditing({ ...editing, quantity: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label className="text-xs">Sides</Label>
                <Select
                  value={editing.sides ?? "double"}
                  onValueChange={(v) => setEditing({ ...editing, sides: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single-sided</SelectItem>
                    <SelectItem value="double">Double-sided</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Paper</Label>
                <Select
                  value={editing.paper ?? "350gsm Silk"}
                  onValueChange={(v) => setEditing({ ...editing, paper: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BC_PAPER_PRESETS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Custom paper (optional override)</Label>
                <Input
                  value={editing.paper ?? ""}
                  onChange={(e) => setEditing({ ...editing, paper: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Finish</Label>
                <Select
                  value={editing.finish ?? "none"}
                  onValueChange={(v) => setEditing({ ...editing, finish: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BC_FINISH_PRESETS.map((f) => (
                      <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Custom finish (optional override)</Label>
                <Input
                  value={editing.finish ?? ""}
                  onChange={(e) => setEditing({ ...editing, finish: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Sell price (ZAR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.sell_price ?? 0}
                  onChange={(e) => setEditing({ ...editing, sell_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label className="text-xs">Cost price (ZAR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.cost_price ?? 0}
                  onChange={(e) => setEditing({ ...editing, cost_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label className="text-xs">Sort order</Label>
                <Input
                  type="number"
                  value={editing.sort_order ?? 0}
                  onChange={(e) => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label className="text-xs">Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
