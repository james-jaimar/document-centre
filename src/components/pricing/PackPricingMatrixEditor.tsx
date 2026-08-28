import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RotateCcw, Save, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCatalogSizes, useCatalogPapers } from "@/hooks/useCatalog";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import type { PricingOption } from "@/lib/pricing/packOptions";

export type PackScope = "master" | "tenant" | "branch";

interface Props {
  scope: PackScope;
  /** Parent ladder shown as read-only reference (branch → tenant, tenant → master). */
  parentBlocks?: QuantityBlock[];
  /** Current stored ladder for this scope. */
  initialBlocks: QuantityBlock[];
  /** Allowed size codes for this family — restricts the "Add pack" picker. */
  allowedSizeCodes?: string[];
  /** Family-defined pricing option axis (e.g. finishing options). */
  pricingOptions?: PricingOption[];
  saving?: boolean;
  onSave: (blocks: QuantityBlock[]) => Promise<void> | void;
  /** Only meaningful for tenant/branch scopes — clears the override row. */
  onRevertToParent?: () => Promise<void> | void;
  reverting?: boolean;
}

const DEFAULT_QTY_TIERS = [100, 250, 500, 1000];

type GroupKey = string; // `${option}|${size}|${paper}`

interface Group {
  key: GroupKey;
  option: string;
  size: string;
  paper: string;
  rows: { block: QuantityBlock; index: number }[];
}


export default function PackPricingMatrixEditor({
  scope,
  parentBlocks = [],
  initialBlocks,
  allowedSizeCodes = [],
  pricingOptions = [],
  saving = false,
  onSave,
  onRevertToParent,
  reverting = false,
}: Props) {
  const [blocks, setBlocks] = useState<QuantityBlock[]>(initialBlocks ?? []);
  const [dirty, setDirty] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    setBlocks(initialBlocks ?? []);
    setDirty(false);
  }, [initialBlocks]);

  const { data: sizesRaw = [] } = useCatalogSizes({ scope: "master" });
  const { data: papersRaw = [] } = useCatalogPapers({ scope: "master" });
  const allSizes = useMemo(() => sizesRaw.filter((s) => s.is_active), [sizesRaw]);
  const allPapers = useMemo(() => papersRaw.filter((p) => p.is_active), [papersRaw]);

  const sizeOptions = useMemo(() => {
    if (!allowedSizeCodes || allowedSizeCodes.length === 0) return allSizes;
    const allow = new Set(allowedSizeCodes.map((c) => c.toLowerCase()));
    const filtered = allSizes.filter((s) => allow.has(s.code.toLowerCase()));
    return filtered.length > 0 ? filtered : allSizes;
  }, [allSizes, allowedSizeCodes]);

  // ── label helpers: never show the raw slug ───────────────────────
  const sizeLabel = (code: string) => {
    if (code === "*") return "Any size";
    const s = allSizes.find((x) => x.code.toLowerCase() === code.toLowerCase());
    return s?.label ?? code.toUpperCase();
  };
  const paperLabel = (code: string) => {
    if (code === "*") return "Any paper";
    const p = allPapers.find((x) => x.code.toLowerCase() === code.toLowerCase());
    if (!p) return code;
    // Avoid "130gsm 130gsm" when label already includes the weight.
    const label = p.label ?? code;
    if (p.weight_gsm && !/\d+\s*gsm/i.test(label)) return `${label} ${p.weight_gsm}gsm`;
    return label;
  };

  const commit = (next: QuantityBlock[]) => {
    const sorted = next.slice().sort((a, b) => {
      const sa = `${a.size ?? "*"}|${a.paper ?? "*"}|${a.sides ?? "single"}`;
      const sb = `${b.size ?? "*"}|${b.paper ?? "*"}|${b.sides ?? "single"}`;
      if (sa !== sb) return sa.localeCompare(sb);
      return a.qty - b.qty;
    });
    setBlocks(sorted);
    setDirty(true);
  };

  // ── group by (option, size, paper) ───────────────────────────────
  const groups: Group[] = useMemo(() => {
    const byKey = new Map<GroupKey, Group>();
    blocks.forEach((b, index) => {
      const option = (b.option ?? "*").toLowerCase();
      const size = (b.size ?? "*").toLowerCase();
      const paper = (b.paper ?? "*").toLowerCase();
      const key = `${option}|${size}|${paper}`;
      if (!byKey.has(key)) byKey.set(key, { key, option, size, paper, rows: [] });
      byKey.get(key)!.rows.push({ block: b, index });
    });
    // Sort rows: single before double, then qty ascending
    for (const g of byKey.values()) {
      g.rows.sort((a, b) => {
        const sa = a.block.sides === "single" ? 0 : 1;
        const sb = b.block.sides === "single" ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return a.block.qty - b.block.qty;
      });
    }
    return Array.from(byKey.values());
  }, [blocks]);

  const isOverrideScope = scope !== "master";
  const hasOverride = isOverrideScope && (initialBlocks?.length ?? 0) > 0;
  const noCatalogueReady = sizeOptions.length === 0 || allPapers.length === 0;

  const optionLabel = (slug: string) => {
    if (!slug || slug === "*") return "All options";
    return pricingOptions.find((o) => o.slug.toLowerCase() === slug.toLowerCase())?.label ?? slug;
  };

  // ── group-level actions ──────────────────────────────────────────
  function updateBlockAt(idx: number, patch: Partial<QuantityBlock>) {
    const next = blocks.slice();
    next[idx] = { ...next[idx], ...patch };
    commit(next);
  }
  function deleteBlockAt(idx: number) {
    commit(blocks.filter((_, i) => i !== idx));
  }
  function addQtyRow(group: Group, sides: "single" | "double") {
    const existingQtys = group.rows.filter((r) => r.block.sides === sides).map((r) => r.block.qty);
    const nextQty = existingQtys.length ? Math.max(...existingQtys) * 2 : 100;
    commit([
      ...blocks,
      {
        size: group.size,
        paper: group.paper,
        option: group.option === "*" ? undefined : group.option,
        sides,
        qty: nextQty,
        price_minor: 0,
      },
    ]);
  }
  function duplicateSinglesToDouble(group: Group) {
    const singles = group.rows.filter((r) => r.block.sides === "single").map((r) => r.block);
    const existingDoubleQtys = new Set(
      group.rows.filter((r) => r.block.sides === "double").map((r) => r.block.qty),
    );
    const additions = singles
      .filter((s) => !existingDoubleQtys.has(s.qty))
      .map((s) => ({ ...s, sides: "double" as const }));
    if (additions.length === 0) return;
    commit([...blocks, ...additions]);
  }
  /** Copy this whole ladder onto another pricing option (skips existing rows). */
  function copyLadderToOption(group: Group, targetOption: string) {
    const target = targetOption.toLowerCase();
    const existing = new Set(
      blocks
        .filter(
          (b) =>
            (b.option ?? "*").toLowerCase() === target &&
            (b.size ?? "*").toLowerCase() === group.size &&
            (b.paper ?? "*").toLowerCase() === group.paper,
        )
        .map((b) => `${b.sides}|${b.qty}`),
    );
    const additions = group.rows
      .map((r) => r.block)
      .filter((b) => !existing.has(`${b.sides}|${b.qty}`))
      .map((b) => ({ ...b, option: target === "*" ? undefined : target }));
    if (additions.length === 0) return;
    commit([...blocks, ...additions]);
  }
  /** Fill the trade column for this ladder as consumer price minus a % */
  function fillTradeFromConsumer(group: Group) {
    const raw = prompt("Trade discount off the consumer price (%)", "15");
    if (raw == null) return;
    const pct = parseFloat(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100) return;
    const idxs = new Set(group.rows.map((r) => r.index));
    commit(
      blocks.map((b, i) =>
        idxs.has(i)
          ? { ...b, trade_price_minor: Math.round((b.price_minor * (100 - pct)) / 100) }
          : b,
      ),
    );
  }
  function deleteGroup(group: Group) {

    if (
      !confirm(
        `Remove all pack rows for ${optionLabel(group.option)} · ${sizeLabel(group.size)} · ${paperLabel(group.paper)}?`,
      )
    )
      return;
    const idxs = new Set(group.rows.map((r) => r.index));
    commit(blocks.filter((_, i) => !idxs.has(i)));
  }

  function seedPack(
    size: string,
    paper: string,
    qtys: number[],
    includeBothSides: boolean,
    option: string,
  ) {
    const opt = (option || "*").toLowerCase();
    const existing = new Set(
      blocks
        .filter(
          (b) =>
            (b.size ?? "*") === size &&
            (b.paper ?? "*") === paper &&
            (b.option ?? "*").toLowerCase() === opt,
        )
        .map((b) => `${b.sides}|${b.qty}`),
    );
    const additions: QuantityBlock[] = [];
    const sidesList: Array<"single" | "double"> = includeBothSides ? ["single", "double"] : ["single"];
    for (const sides of sidesList) {
      for (const qty of qtys) {
        if (existing.has(`${sides}|${qty}`)) continue;
        additions.push({
          size,
          paper,
          sides,
          qty,
          price_minor: 0,
          ...(opt === "*" ? {} : { option: opt }),
        });
      }
    }
    if (additions.length === 0) return;
    commit([...blocks, ...additions]);
  }

  const parentGroups: Group[] = useMemo(() => {
    const byKey = new Map<GroupKey, Group>();
    parentBlocks.forEach((b, index) => {
      const option = (b.option ?? "*").toLowerCase();
      const size = (b.size ?? "*").toLowerCase();
      const paper = (b.paper ?? "*").toLowerCase();
      const key = `${option}|${size}|${paper}`;
      if (!byKey.has(key)) byKey.set(key, { key, option, size, paper, rows: [] });
      byKey.get(key)!.rows.push({ block: b, index });
    });
    return Array.from(byKey.values());
  }, [parentBlocks]);


  return (
    <div className="space-y-4">
      {/* Header: scope badge + save/revert */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Grouped by <strong>Size × Paper</strong>. Each group has a Single-sided and Double-sided qty ladder.
          </p>
          {isOverrideScope && (
            <div className="flex items-center gap-2">
              {hasOverride ? (
                <Badge variant="secondary" className="text-[10px]">
                  {scope === "branch" ? "Branch override active" : "Tenant override active"}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Inheriting from {scope === "branch" ? "tenant / master" : "master"}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={noCatalogueReady}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add pack
          </Button>
          {isOverrideScope && hasOverride && onRevertToParent && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={reverting || saving}
              onClick={() => onRevertToParent()}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              {reverting ? "Reverting…" : "Revert to parent"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => onSave(blocks)}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {noCatalogueReady && (
        <p className="text-[11px] text-amber-600">
          {sizeOptions.length === 0
            ? "No sizes available — configure the master catalogue first."
            : "No papers found in the master catalogue."}
        </p>
      )}

      {/* Parent reference when inheriting */}
      {isOverrideScope && !hasOverride && parentGroups.length > 0 && (
        <div className="rounded-md border border-dashed p-3 bg-muted/30">
          <p className="text-[11px] font-semibold text-muted-foreground mb-2">
            Parent ladder (read-only) — this is what customers currently see
          </p>
          <div className="space-y-1.5">
            {parentGroups.map((g) => (
              <ParentGroupSummary key={g.key} group={g} sizeLabel={sizeLabel} paperLabel={paperLabel} />
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 h-7 text-xs"
            onClick={() => commit(parentBlocks.map((b) => ({ ...b })))}
          >
            <Copy className="h-3 w-3 mr-1" /> Copy parent as starting point
          </Button>
        </div>
      )}

      {/* Groups */}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-6 text-center border border-dashed rounded-md">
          {isOverrideScope
            ? "No override rows yet. Click Add pack to start."
            : "No pack rows yet. Click Add pack to create your first Size × Paper group."}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              sizeLabel={sizeLabel}
              paperLabel={paperLabel}
              optionLabel={optionLabel}
              pricingOptions={pricingOptions}
              onUpdateBlock={updateBlockAt}
              onDeleteBlock={deleteBlockAt}
              onAddQty={addQtyRow}
              onDuplicateSingles={duplicateSinglesToDouble}
              onCopyToOption={copyLadderToOption}
              onFillTrade={fillTradeFromConsumer}

              onDeleteGroup={deleteGroup}
            />
          ))}
        </div>
      )}

      {/* Add pack dialog */}
      <AddPackDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        sizeOptions={sizeOptions}
        allPapers={allPapers}
        paperLabel={paperLabel}
        pricingOptions={pricingOptions}
        existingKeys={new Set(groups.map((g) => g.key))}
        onSeed={(size, paper, qtys, both, option) => {
          seedPack(size, paper, qtys, both, option);
          setAddOpen(false);
        }}
      />

    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function GroupCard({
  group,
  sizeLabel,
  paperLabel,
  optionLabel,
  pricingOptions,
  onUpdateBlock,
  onDeleteBlock,
  onAddQty,
  onDuplicateSingles,
  onCopyToOption,
  onDeleteGroup,
}: {
  group: Group;
  sizeLabel: (c: string) => string;
  paperLabel: (c: string) => string;
  optionLabel: (slug: string) => string;
  pricingOptions: PricingOption[];
  onUpdateBlock: (idx: number, patch: Partial<QuantityBlock>) => void;
  onDeleteBlock: (idx: number) => void;
  onAddQty: (group: Group, sides: "single" | "double") => void;
  onDuplicateSingles: (group: Group) => void;
  onCopyToOption: (group: Group, targetOption: string) => void;
  onDeleteGroup: (group: Group) => void;
}) {
  const singles = group.rows.filter((r) => r.block.sides === "single");
  const doubles = group.rows.filter((r) => r.block.sides === "double");
  const copyTargets = pricingOptions.filter(
    (o) => o.slug.toLowerCase() !== group.option.toLowerCase(),
  );
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40 rounded-t-lg">
        <div className="flex items-center gap-2 min-w-0">
          {pricingOptions.length > 0 && (
            <Badge className="text-[11px]">{optionLabel(group.option)}</Badge>
          )}
          <Badge variant="secondary" className="text-[11px]">{sizeLabel(group.size)}</Badge>
          <span className="text-sm font-medium truncate">{paperLabel(group.paper)}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {copyTargets.length > 0 && (
            <Select value="" onValueChange={(v) => onCopyToOption(group, v)}>
              <SelectTrigger className="h-7 w-[170px] text-[11px]">
                <SelectValue placeholder="Copy ladder to…" />
              </SelectTrigger>
              <SelectContent>
                {copyTargets.map((o) => (
                  <SelectItem key={o.slug} value={o.slug} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => onDuplicateSingles(group)}
            disabled={singles.length === 0}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy singles → double
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDeleteGroup(group)}
            title="Delete this group"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
        <SidesColumn
          heading="Single-sided"
          rows={singles}
          onUpdateBlock={onUpdateBlock}
          onDeleteBlock={onDeleteBlock}
          onAddRow={() => onAddQty(group, "single")}
        />
        <SidesColumn
          heading="Double-sided"
          rows={doubles}
          onUpdateBlock={onUpdateBlock}
          onDeleteBlock={onDeleteBlock}
          onAddRow={() => onAddQty(group, "double")}
        />
      </div>
    </div>
  );
}

function SidesColumn({
  heading,
  rows,
  onUpdateBlock,
  onDeleteBlock,
  onAddRow,
}: {
  heading: string;
  rows: { block: QuantityBlock; index: number }[];
  onUpdateBlock: (idx: number, patch: Partial<QuantityBlock>) => void;
  onDeleteBlock: (idx: number) => void;
  onAddRow: () => void;
}) {
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{heading}</h5>
        <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={onAddRow}>
          <Plus className="h-3 w-3 mr-0.5" /> Qty
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">No qty tiers.</p>
      ) : (
        <>
          <div className="grid grid-cols-[70px_1fr_1fr_1fr_auto] gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
            <span>Qty</span>
            <span>Consumer</span>
            <span>Trade</span>
            <span>Cost</span>
            <span></span>
          </div>
          {rows.map(({ block, index }) => (
            <div key={index} className="grid grid-cols-[70px_1fr_1fr_1fr_auto] gap-2 items-center">
              <Input
                type="number"
                min={1}
                className="h-8 text-xs"
                value={block.qty}
                onChange={(e) => onUpdateBlock(index, { qty: parseInt(e.target.value, 10) || 0 })}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-8 text-xs"
                value={(block.price_minor / 100).toString()}
                onChange={(e) =>
                  onUpdateBlock(index, {
                    price_minor: Math.round(parseFloat(e.target.value || "0") * 100),
                  })
                }
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-8 text-xs"
                placeholder="same"
                title="Trade price — leave blank to charge the consumer price"
                value={block.trade_price_minor != null ? (block.trade_price_minor / 100).toString() : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  onUpdateBlock(index, {
                    trade_price_minor: raw === "" ? undefined : Math.round(parseFloat(raw) * 100),
                  });
                }}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-8 text-xs"
                placeholder="—"
                value={block.cost_minor != null ? (block.cost_minor / 100).toString() : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  onUpdateBlock(index, {
                    cost_minor: raw === "" ? undefined : Math.round(parseFloat(raw) * 100),
                  });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onDeleteBlock(index)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}


function ParentGroupSummary({
  group,
  sizeLabel,
  paperLabel,
}: {
  group: Group;
  sizeLabel: (c: string) => string;
  paperLabel: (c: string) => string;
}) {
  const summary = group.rows
    .map((r) => `${r.block.sides === "single" ? "1s" : "2s"}·${r.block.qty}=R${(r.block.price_minor / 100).toFixed(2)}`)
    .join("  ·  ");
  return (
    <div className="text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">{sizeLabel(group.size)} · {paperLabel(group.paper)}</span>
      <span className="ml-2">{summary}</span>
    </div>
  );
}

function AddPackDialog({
  open,
  onOpenChange,
  sizeOptions,
  allPapers,
  paperLabel,
  pricingOptions,
  existingKeys,
  onSeed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sizeOptions: Array<{ id: string; code: string; label: string }>;
  allPapers: Array<{ id: string; code: string; label: string; weight_gsm: number | null }>;
  paperLabel: (c: string) => string;
  pricingOptions: PricingOption[];
  existingKeys: Set<GroupKey>;
  onSeed: (
    size: string,
    paper: string,
    qtys: number[],
    includeBothSides: boolean,
    option: string,
  ) => void;
}) {
  const [size, setSize] = useState<string>("");
  const [paper, setPaper] = useState<string>("");
  const [option, setOption] = useState<string>("*");
  const [tiersText, setTiersText] = useState<string>(DEFAULT_QTY_TIERS.join(", "));
  const [includeBothSides, setIncludeBothSides] = useState(true);

  useEffect(() => {
    if (open) {
      setSize("");
      setPaper("");
      setOption(pricingOptions[0]?.slug ?? "*");
      setTiersText(DEFAULT_QTY_TIERS.join(", "));
      setIncludeBothSides(true);
    }
  }, [open, pricingOptions]);

  const parsedQtys = useMemo(
    () =>
      tiersText
        .split(/[,\s]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0),
    [tiersText],
  );

  const duplicate =
    size &&
    paper &&
    existingKeys.has(`${(option || "*").toLowerCase()}|${size.toLowerCase()}|${paper.toLowerCase()}`);
  const canSubmit = size && paper && parsedQtys.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add pack</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {pricingOptions.length > 0 && (
            <div>
              <Label className="text-xs">Pricing option</Label>
              <Select value={option} onValueChange={setOption}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pricingOptions.map((o) => (
                    <SelectItem key={o.slug} value={o.slug}>{o.label}</SelectItem>
                  ))}
                  <SelectItem value="*">All options</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Size</Label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Pick a size…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="*">Any size</SelectItem>
                {sizeOptions.map((s) => (
                  <SelectItem key={s.id} value={s.code.toLowerCase()}>
                    {s.label} <span className="text-muted-foreground text-[10px]">({s.code})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Paper</Label>
            <Select value={paper} onValueChange={setPaper}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Pick a paper…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="*">Any paper</SelectItem>
                {allPapers.map((p) => (
                  <SelectItem key={p.id} value={p.code.toLowerCase()}>
                    {paperLabel(p.code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Qty tiers</Label>
            <Input
              value={tiersText}
              onChange={(e) => setTiersText(e.target.value)}
              placeholder="100, 250, 500, 1000"
              className="h-9"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Comma or space separated. All prices default to 0 — set them in the group rows after adding.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={includeBothSides}
              onChange={(e) => setIncludeBothSides(e.target.checked)}
              className="h-4 w-4"
            />
            Create rows for both Single-sided and Double-sided
          </label>
          {duplicate && (
            <p className="text-[11px] text-amber-600">
              This Size × Paper group already exists — new qty rows will be added to it (duplicates skipped).
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canSubmit}
            onClick={() => onSeed(size, paper, parsedQtys, includeBothSides, option || "*")}
          >
            Add pack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
