import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RotateCcw, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCatalogSizes, useCatalogPapers } from "@/hooks/useCatalog";
import type { QuantityBlock } from "@/hooks/useProductFamilies";

export type PackScope = "master" | "tenant" | "branch";

interface Props {
  scope: PackScope;
  /** Master ladder — shown as a read-only reference for tenant/branch scopes. */
  parentBlocks?: QuantityBlock[];
  /** Current stored ladder for this scope. */
  initialBlocks: QuantityBlock[];
  /** Size codes the family allows (from printing_rules.allowed_finished_sizes).
   *  When empty/undefined the picker falls back to the full active catalogue. */
  allowedSizeCodes?: string[];
  saving?: boolean;
  onSave: (blocks: QuantityBlock[]) => Promise<void> | void;
  /** Only meaningful for tenant/branch scopes — clears the override row. */
  onRevertToParent?: () => Promise<void> | void;
  reverting?: boolean;
}

export default function PackPricingMatrixEditor({
  scope,
  parentBlocks = [],
  initialBlocks,
  allowedSizeCodes = [],
  saving = false,
  onSave,
  onRevertToParent,
  reverting = false,
}: Props) {
  const [blocks, setBlocks] = useState<QuantityBlock[]>(initialBlocks ?? []);
  const [dirty, setDirty] = useState(false);

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

  const paperLabel = (code: string) => {
    const p = allPapers.find((pp) => pp.code.toLowerCase() === code.toLowerCase());
    if (!p) return code;
    return p.weight_gsm ? `${p.label} ${p.weight_gsm}gsm` : p.label;
  };

  const update = (next: QuantityBlock[]) => {
    const sorted = next.slice().sort((a, b) => {
      const sa = `${a.size ?? "*"}|${a.paper ?? "*"}|${a.sides ?? "single"}`;
      const sb = `${b.size ?? "*"}|${b.paper ?? "*"}|${b.sides ?? "single"}`;
      if (sa !== sb) return sa.localeCompare(sb);
      return a.qty - b.qty;
    });
    setBlocks(sorted);
    setDirty(true);
  };

  const noCatalogueReady = sizeOptions.length === 0 || allPapers.length === 0;
  const isOverrideScope = scope !== "master";
  const hasOverride = isOverrideScope && (initialBlocks?.length ?? 0) > 0;

  const usingParent = isOverrideScope && !hasOverride && blocks.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            Each row is one pack — keyed by size + paper + sides + qty. Choose{" "}
            <code className="text-[10px] bg-muted px-1 rounded">Any</code> for size or
            paper to match every catalogue option.
          </p>
          {isOverrideScope && (
            <div className="mt-1 flex items-center gap-2">
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
        <p className="text-[11px] text-amber-600 px-1">
          {sizeOptions.length === 0
            ? "No sizes available — configure the master catalogue first."
            : "No papers found in the master catalogue."}
        </p>
      )}

      {isOverrideScope && parentBlocks.length > 0 && !hasOverride && (
        <div className="rounded-md border border-dashed p-2">
          <p className="text-[11px] font-medium text-muted-foreground mb-1">
            Parent ladder (read-only reference)
          </p>
          <ParentBlocksSummary blocks={parentBlocks} paperLabel={paperLabel} />
        </div>
      )}

      <div className="grid grid-cols-[140px_200px_100px_90px_1fr_1fr_auto] gap-2 text-[11px] text-muted-foreground px-1">
        <span>Size</span>
        <span>Paper</span>
        <span>Sides</span>
        <span>Qty</span>
        <span>Sell (major)</span>
        <span>Cost (optional)</span>
        <span></span>
      </div>

      {blocks.length === 0 && (
        <p className="text-xs text-muted-foreground italic px-1">
          {usingParent
            ? "No override rows — customers see the parent ladder above. Add rows to start overriding."
            : "No pack rows yet. Add a row per size × paper × sides × qty combo you offer."}
        </p>
      )}

      {blocks.map((b, i) => {
        const sizeVal = (b.size ?? "*").toLowerCase();
        const paperVal = (b.paper ?? "*").toLowerCase();
        return (
          <div key={i} className="grid grid-cols-[140px_200px_100px_90px_1fr_1fr_auto] gap-2 items-center">
            <Select
              value={sizeVal}
              onValueChange={(v) => {
                const next = [...blocks];
                next[i] = { ...b, size: v };
                update(next);
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="*">Any (*)</SelectItem>
                {sizeOptions.map((s) => (
                  <SelectItem key={s.id} value={s.code.toLowerCase()}>
                    {s.label} ({s.code})
                  </SelectItem>
                ))}
                {sizeVal !== "*" && !sizeOptions.some((s) => s.code.toLowerCase() === sizeVal) && (
                  <SelectItem value={sizeVal}>{sizeVal} (legacy)</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Select
              value={paperVal}
              onValueChange={(v) => {
                const next = [...blocks];
                next[i] = { ...b, paper: v };
                update(next);
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="*">Any (*)</SelectItem>
                {allPapers.map((p) => (
                  <SelectItem key={p.id} value={p.code.toLowerCase()}>
                    {paperLabel(p.code)}
                  </SelectItem>
                ))}
                {paperVal !== "*" && !allPapers.some((p) => p.code.toLowerCase() === paperVal) && (
                  <SelectItem value={paperVal}>{paperVal} (legacy)</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Select
              value={b.sides ?? "single"}
              onValueChange={(v) => {
                const next = [...blocks];
                next[i] = { ...b, sides: v as "single" | "double" };
                update(next);
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="double">Double</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              className="h-8 text-xs"
              value={b.qty}
              onChange={(e) => {
                const next = [...blocks];
                next[i] = { ...b, qty: parseInt(e.target.value, 10) || 0 };
                update(next);
              }}
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              className="h-8 text-xs"
              value={(b.price_minor / 100).toString()}
              onChange={(e) => {
                const next = [...blocks];
                next[i] = { ...b, price_minor: Math.round(parseFloat(e.target.value || "0") * 100) };
                update(next);
              }}
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              className="h-8 text-xs"
              value={b.cost_minor != null ? (b.cost_minor / 100).toString() : ""}
              placeholder="—"
              onChange={(e) => {
                const raw = e.target.value;
                const next = [...blocks];
                next[i] = {
                  ...b,
                  cost_minor: raw === "" ? undefined : Math.round(parseFloat(raw) * 100),
                };
                update(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => update(blocks.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            const last = blocks[blocks.length - 1];
            update([
              ...blocks,
              {
                size: last?.size ?? "*",
                paper: last?.paper ?? "*",
                sides: last?.sides ?? "single",
                qty: last ? last.qty * 2 : 50,
                price_minor: 0,
              },
            ]);
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add row
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            const singles = blocks.filter((b) => b.sides === "single");
            const existingKeys = new Set(
              blocks.map((b) => `${b.size}|${b.paper}|${b.sides}|${b.qty}`),
            );
            const additions = singles
              .map((s) => ({ ...s, sides: "double" as const }))
              .filter(
                (s) => !existingKeys.has(`${s.size}|${s.paper}|${s.sides}|${s.qty}`),
              );
            if (additions.length === 0) return;
            update([...blocks, ...additions]);
          }}
        >
          Duplicate singles → double
        </Button>
        {isOverrideScope && parentBlocks.length > 0 && blocks.length === 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => update(parentBlocks.map((b) => ({ ...b })))}
          >
            Copy parent as starting point
          </Button>
        )}
      </div>
    </div>
  );
}

function ParentBlocksSummary({
  blocks,
  paperLabel,
}: {
  blocks: QuantityBlock[];
  paperLabel: (code: string) => string;
}) {
  return (
    <div className="space-y-0.5 text-[11px] text-muted-foreground">
      {blocks.slice(0, 12).map((b, i) => (
        <div key={i} className="flex justify-between gap-2">
          <span>
            {b.size} · {paperLabel(b.paper)} · {b.sides} · qty {b.qty}
          </span>
          <span>R{(b.price_minor / 100).toFixed(2)}</span>
        </div>
      ))}
      {blocks.length > 12 && <div>…and {blocks.length - 12} more.</div>}
    </div>
  );
}
