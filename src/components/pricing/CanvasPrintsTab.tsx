import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

import {
  useRateCardCanvasPrints,
  useRateCardCanvasSurcharges,
  type RateCardScope,
  type RateCardCanvasPrint,
  type RateCardCanvasWrapSurcharge,
} from "@/hooks/useCanvasPrintsPricing";
import {
  CANVAS_PRESETS,
  WRAP_DEPTH_PRESETS_MM,
} from "@/lib/canvasPrints/presets";
import { WRAP_MODE_OPTIONS, type WrapMode } from "@/lib/canvasPrints/types";

interface Props {
  scope: RateCardScope;
  tenantId?: string | null;
  branchId?: string | null;
}

export default function CanvasPrintsTab({ scope, tenantId, branchId }: Props) {
  const { data: baseRows = [] } = useRateCardCanvasPrints({ scope, tenantId, branchId });
  const { data: surchargeRows = [] } = useRateCardCanvasSurcharges({ scope, tenantId, branchId });

  return (
    <div className="space-y-6">
      <BaseMatrix rows={baseRows} scope={scope} tenantId={tenantId ?? null} branchId={branchId ?? null} />
      <SurchargesEditor
        rows={surchargeRows}
        scope={scope}
        tenantId={tenantId ?? null}
        branchId={branchId ?? null}
      />
    </div>
  );
}

// ─── Base matrix: size × wrap depth ────────────────────────────────────

function BaseMatrix({
  rows,
  scope,
  tenantId,
  branchId,
}: {
  rows: RateCardCanvasPrint[];
  scope: RateCardScope;
  tenantId: string | null;
  branchId: string | null;
}) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["rate_card", "canvas_prints"] });
    qc.invalidateQueries({ queryKey: ["resolved_rate_card", "canvas_prints"] });
  };

  const updateCell = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RateCardCanvasPrint> }) => {
      const { error } = await supabase
        .from("rate_card_canvas_prints" as any)
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rate_card_canvas_prints" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // Group rows by size_slug for a nicer size × wrap matrix.
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; rows: RateCardCanvasPrint[] }>();
    for (const r of rows) {
      const key = r.size_slug;
      if (!map.has(key)) map.set(key, { label: r.size_label ?? r.size_slug, rows: [] });
      map.get(key)!.rows.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [rows]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Canvas base prices</h3>
          <p className="text-xs text-muted-foreground">
            Sell price per canvas by finished size × wrap depth. Wrap-mode surcharges are added on top (see below).
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add size / depth
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Size</TableHead>
            <TableHead className="w-24">Wrap</TableHead>
            <TableHead className="w-32">Sell (R, ex-VAT)</TableHead>
            <TableHead className="w-32">Cost (R)</TableHead>
            <TableHead className="w-20">Active</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {grouped.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                No canvas prices yet — click "Add size / depth" to create your first row.
              </TableCell>
            </TableRow>
          )}
          {grouped.flatMap(([slug, group]) =>
            group.rows
              .sort((a, b) => a.wrap_mm - b.wrap_mm)
              .map((r, idx) => (
                <TableRow key={r.id}>
                  {idx === 0 && (
                    <TableCell rowSpan={group.rows.length} className="font-medium align-top">
                      {group.label}
                      <div className="text-[11px] text-muted-foreground font-mono">{slug}</div>
                    </TableCell>
                  )}
                  <TableCell>{r.wrap_mm} mm</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={r.sell_price}
                      className="h-8"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.sell_price) updateCell.mutate({ id: r.id, patch: { sell_price: v } });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={r.cost_price}
                      className="h-8"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== r.cost_price) updateCell.mutate({ id: r.id, patch: { cost_price: v } });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => updateCell.mutate({ id: r.id, patch: { is_active: v } })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => removeRow.mutate(r.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              )),
          )}
        </TableBody>
      </Table>

      <AddSizeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        scope={scope}
        tenantId={tenantId}
        branchId={branchId}
        onCreated={invalidate}
        existing={rows}
      />
    </Card>
  );
}

function AddSizeDialog({
  open,
  onOpenChange,
  scope,
  tenantId,
  branchId,
  onCreated,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: RateCardScope;
  tenantId: string | null;
  branchId: string | null;
  onCreated: () => void;
  existing: RateCardCanvasPrint[];
}) {
  const [presetId, setPresetId] = useState<string>(CANVAS_PRESETS[0].id);
  const [wrap, setWrap] = useState<number>(WRAP_DEPTH_PRESETS_MM[1]);
  const [sell, setSell] = useState<string>("0");
  const [cost, setCost] = useState<string>("0");
  const preset = CANVAS_PRESETS.find((p) => p.id === presetId)!;

  const insert = useMutation({
    mutationFn: async () => {
      const exists = existing.some(
        (r) => r.size_slug === presetId && r.wrap_mm === wrap,
      );
      if (exists) throw new Error("A row for this size + wrap depth already exists.");
      const payload: any = {
        scope_type: scope,
        tenant_id: scope === "master" ? null : tenantId,
        branch_id: scope === "branch" ? branchId : null,
        size_slug: presetId,
        size_label: preset.label,
        width_mm: preset.frontWidthMm,
        height_mm: preset.frontHeightMm,
        wrap_mm: wrap,
        sell_price: Number(sell) || 0,
        cost_price: Number(cost) || 0,
        is_active: true,
      };
      const { error } = await supabase.from("rate_card_canvas_prints" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      onCreated();
      onOpenChange(false);
      setSell("0");
      setCost("0");
    },
    onError: (e: any) => toast({ title: "Could not add", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add canvas size / wrap depth</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Size</Label>
            <Select value={presetId} onValueChange={setPresetId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANVAS_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Wrap depth</Label>
            <Select value={String(wrap)} onValueChange={(v) => setWrap(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WRAP_DEPTH_PRESETS_MM.map((d) => (
                  <SelectItem key={d} value={String(d)}>{d} mm</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sell price (ex-VAT)</Label>
            <Input type="number" step="0.01" value={sell} onChange={(e) => setSell(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Cost price</Label>
            <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => insert.mutate()} disabled={insert.isPending}>
            {insert.isPending ? "Adding…" : "Add row"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Wrap-mode surcharge editor ────────────────────────────────────────

function SurchargesEditor({
  rows,
  scope,
  tenantId,
  branchId,
}: {
  rows: RateCardCanvasWrapSurcharge[];
  scope: RateCardScope;
  tenantId: string | null;
  branchId: string | null;
}) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["rate_card", "canvas_surcharges"] });
    qc.invalidateQueries({ queryKey: ["resolved_rate_card", "canvas_surcharges"] });
  };

  const byMode = useMemo(() => {
    const m = new Map<WrapMode, RateCardCanvasWrapSurcharge>();
    for (const r of rows) m.set(r.wrap_mode, r);
    return m;
  }, [rows]);

  const upsert = useMutation({
    mutationFn: async ({
      wrap_mode,
      sell_price,
      cost_price,
      is_active,
    }: {
      wrap_mode: WrapMode;
      sell_price?: number;
      cost_price?: number;
      is_active?: boolean;
    }) => {
      const existing = byMode.get(wrap_mode);
      if (existing) {
        const patch: any = {};
        if (sell_price !== undefined) patch.sell_price = sell_price;
        if (cost_price !== undefined) patch.cost_price = cost_price;
        if (is_active !== undefined) patch.is_active = is_active;
        const { error } = await supabase
          .from("rate_card_canvas_wrap_surcharges" as any)
          .update(patch)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const payload: any = {
          scope_type: scope,
          tenant_id: scope === "master" ? null : tenantId,
          branch_id: scope === "branch" ? branchId : null,
          wrap_mode,
          sell_price: sell_price ?? 0,
          cost_price: cost_price ?? 0,
          is_active: is_active ?? true,
        };
        const { error } = await supabase
          .from("rate_card_canvas_wrap_surcharges" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold">Wrap-mode surcharges</h3>
        <p className="text-xs text-muted-foreground">
          Optional per-canvas extra applied on top of the base price for each edge-finish style.
          Leave at 0 if you don't charge extra.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Wrap mode</TableHead>
            <TableHead className="w-32">Sell (R)</TableHead>
            <TableHead className="w-32">Cost (R)</TableHead>
            <TableHead className="w-20">Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {WRAP_MODE_OPTIONS.map((opt) => {
            const row = byMode.get(opt.value);
            return (
              <TableRow key={opt.value}>
                <TableCell>
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground max-w-xl">{opt.help}</div>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={row?.sell_price ?? 0}
                    className="h-8"
                    onBlur={(e) =>
                      upsert.mutate({ wrap_mode: opt.value, sell_price: Number(e.target.value) })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={row?.cost_price ?? 0}
                    className="h-8"
                    onBlur={(e) =>
                      upsert.mutate({ wrap_mode: opt.value, cost_price: Number(e.target.value) })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={row?.is_active ?? true}
                    onCheckedChange={(v) => upsert.mutate({ wrap_mode: opt.value, is_active: v })}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
