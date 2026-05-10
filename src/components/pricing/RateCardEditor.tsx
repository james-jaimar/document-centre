import { useState } from "react";
import {
  useRateCardClicks,
  useRateCardPapers,
  useRateCardFinishing,
  useUpdateRateCardClick,
  useUpsertRateCardPaper,
  useDeleteRateCardPaper,
  useUpsertRateCardFinishing,
  useDeleteRateCardFinishing,
  useCloneMasterRateCard,
  type RateCardScope,
  type RateCardClick,
  type RateCardPaper,
  type RateCardFinishing,
  type ClickSize,
  type FinishingBasis,
} from "@/hooks/useRateCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { formatPrice } from "@/lib/formatCurrency";

interface Props {
  scope: RateCardScope;
  /** Required when scope === "tenant" */
  tenantId?: string | null;
  /** Display title */
  title?: string;
  /** Description shown under the title */
  description?: string;
}

const SIZES: ClickSize[] = ["A4", "A3"];
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

export default function RateCardEditor({
  scope,
  tenantId,
  title = "Rate Card",
  description = "Single source of truth for print, paper and finishing prices.",
}: Props) {
  const args = { scope, tenantId };
  const { data: clicks = [], isLoading: clicksLoading } = useRateCardClicks(args);
  const { data: papers = [], isLoading: papersLoading } = useRateCardPapers(args);
  const { data: finishing = [], isLoading: finLoading } = useRateCardFinishing(args);

  const cloneMaster = useCloneMasterRateCard();
  const empty = !clicksLoading && !papersLoading && !finLoading &&
    clicks.length === 0 && papers.length === 0 && finishing.length === 0;

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
      </div>

      {empty && scope === "tenant" && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          This tenant has no rate card yet. Click <strong>Initialise from master</strong> above
          to seed it from the platform master rate card.
        </Card>
      )}

      <Tabs defaultValue="clicks" className="w-full">
        <TabsList>
          <TabsTrigger value="clicks">Click Charges</TabsTrigger>
          <TabsTrigger value="papers">Paper Stocks</TabsTrigger>
          <TabsTrigger value="finishing">Finishing</TabsTrigger>
        </TabsList>

        <TabsContent value="clicks" className="mt-4">
          <ClicksTab clicks={clicks} scope={scope} tenantId={tenantId ?? null} />
        </TabsContent>
        <TabsContent value="papers" className="mt-4">
          <PapersTab papers={papers} scope={scope} tenantId={tenantId ?? null} />
        </TabsContent>
        <TabsContent value="finishing" className="mt-4">
          <FinishingTab finishing={finishing} scope={scope} tenantId={tenantId ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Clicks tab — 8 fixed cells (size × colour × sides)
// ============================================================================
function ClicksTab({
  clicks,
  scope,
  tenantId,
}: {
  clicks: RateCardClick[];
  scope: RateCardScope;
  tenantId: string | null;
}) {
  const update = useUpdateRateCardClick();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const get = (size: ClickSize, colour: "mono" | "colour", sides: "simplex" | "duplex") =>
    clicks.find((c) => c.size === size && c.colour === colour && c.sides === sides);

  async function save(id: string, value: string) {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num < 0) return;
    try {
      await update.mutateAsync({ id, sell_price: num });
      toast({ title: "Click price updated" });
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  }

  if (clicks.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No click charges configured.
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground mb-3">
        Per-impression (per side) print charge. A3 is typically billed at roughly 2× A4.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Size</TableHead>
            <TableHead>Colour</TableHead>
            <TableHead>Sides</TableHead>
            <TableHead className="w-40">Price per impression</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SIZES.flatMap((size) =>
            (["mono", "colour"] as const).flatMap((colour) =>
              (["simplex", "duplex"] as const).map((sides) => {
                const row = get(size, colour, sides);
                if (!row) return null;
                const value = drafts[row.id] ?? String(row.sell_price);
                return (
                  <TableRow key={row.id}>
                    <TableCell>{size}</TableCell>
                    <TableCell className="capitalize">{colour}</TableCell>
                    <TableCell className="capitalize">{sides}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">R</span>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 w-28 text-sm"
                          value={value}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [row.id]: e.target.value }))
                          }
                          onBlur={(e) => {
                            if (parseFloat(e.target.value) !== row.sell_price) {
                              save(row.id, e.target.value);
                            }
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }),
            ),
          )}
        </TableBody>
      </Table>
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
}: {
  papers: RateCardPaper[];
  scope: RateCardScope;
  tenantId: string | null;
}) {
  const upsert = useUpsertRateCardPaper();
  const del = useDeleteRateCardPaper();
  const [editing, setEditing] = useState<Partial<RateCardPaper> | null>(null);

  function openNew() {
    setEditing({
      scope_type: scope,
      tenant_id: scope === "tenant" ? tenantId ?? undefined : null,
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
                  <Select
                    value={editing.size ?? "A4"}
                    onValueChange={(v) => setEditing({ ...editing, size: v as ClickSize })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
}: {
  finishing: RateCardFinishing[];
  scope: RateCardScope;
  tenantId: string | null;
}) {
  const upsert = useUpsertRateCardFinishing();
  const del = useDeleteRateCardFinishing();
  const [editing, setEditing] = useState<Partial<RateCardFinishing> | null>(null);

  function openNew() {
    setEditing({
      scope_type: scope,
      tenant_id: scope === "tenant" ? tenantId ?? undefined : null,
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

  // Group by category
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
                <Select
                  value={editing.size ?? "none"}
                  onValueChange={(v) =>
                    setEditing({ ...editing, size: v === "none" ? null : (v as ClickSize) })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— not size-specific —</SelectItem>
                    {SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
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
