/**
 * Admin editor: draw / drag / resize placeholder boxes over the rendered
 * template page. Geometry is kept in millimetres relative to the trim box.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageIcon, Type, Trash2, Copy, ChevronUp, ChevronDown, Palette } from "lucide-react";
import {
  ARTWORK_FONTS,
  DEFAULT_CMYK,
  DEFAULT_TEXT_STYLE,
  cmykToHex,
  normaliseCmyk,
  placeholdersForPage,
  pageScopeLabel,
  parsePageRange,
  formatPageRange,
  type ArtworkCmyk,
  type ArtworkPlaceholder,
  type PlaceholderKind,
  type PlaceholderPageScope,
} from "@/lib/artworkTemplates/types";


interface Props {
  pageImageUrl: string | null;
  trimWidthMm: number;
  trimHeightMm: number;
  /** Bleed included in the page image, per side (mm). Defaults to none. */
  bleedLeftMm?: number;
  bleedTopMm?: number;
  bleedRightMm?: number;
  bleedBottomMm?: number;
  placeholders: ArtworkPlaceholder[];
  onChange: (next: ArtworkPlaceholder[]) => void;
  /** Zero-based page currently being edited (multi-page templates). */
  pageIndex?: number;
  /** Total pages in the base PDF. */
  pageCount?: number;
}


type DragState =
  | { mode: "move"; id: string; startX: number; startY: number; origX: number; origY: number }
  | { mode: "resize"; id: string; startX: number; startY: number; origW: number; origH: number }
  | { mode: "draw"; startXmm: number; startYmm: number }
  | null;

let newCounter = 0;
function makeId() {
  newCounter += 1;
  return `new-${Date.now()}-${newCounter}`;
}

export function makePlaceholder(
  kind: PlaceholderKind,
  geom: { x_mm: number; y_mm: number; width_mm: number; height_mm: number },
  index: number,
  page?: { scope: PlaceholderPageScope; index: number },
): ArtworkPlaceholder {
  return {
    id: makeId(),
    template_id: "",
    kind,
    name:
      kind === "image"
        ? `Image ${index + 1}`
        : kind === "colour"
          ? `Colour ${index + 1}`
          : `Text ${index + 1}`,
    ...geom,
    fit_mode: "fill",
    corner_radius_mm: 0,
    background_hex: null,
    text_style: kind === "text" ? { ...DEFAULT_TEXT_STYLE } : {},
    max_length: kind === "text" ? 80 : null,
    default_value: null,
    is_required: kind === "image",
    is_locked: false,
    is_watermark: false,
    default_cmyk: kind === "colour" ? { ...DEFAULT_CMYK } : null,
    customer_editable_colour: kind === "colour",
    page_scope: page?.scope ?? "all",
    page_index: page?.scope === "page" ? page.index : null,
    page_indexes: page?.scope === "pages" ? [page.index] : null,
    field_key: null,
    sort_order: index,
    layer: "over",
    z_index: index,
    opacity: 1,
  };

}


const round1 = (n: number) => Math.round(n * 10) / 10;

export default function TemplateBoxEditor({
  pageImageUrl,
  trimWidthMm,
  trimHeightMm,
  bleedLeftMm = 0,
  bleedTopMm = 0,
  bleedRightMm = 0,
  bleedBottomMm = 0,
  placeholders,
  onChange,
  pageIndex = 0,
  pageCount = 1,
}: Props) {
  const canvasWidthMm = trimWidthMm + bleedLeftMm + bleedRightMm;
  const canvasHeightMm = trimHeightMm + bleedTopMm + bleedBottomMm;
  const hasBleed = bleedLeftMm + bleedTopMm + bleedRightMm + bleedBottomMm > 0.05;

  const stageRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawKind, setDrawKind] = useState<PlaceholderKind | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** Scope given to boxes created from here (multi-page templates). */
  const [newScope, setNewScope] = useState<PlaceholderPageScope>(
    pageCount > 1 ? "page" : "all",
  );

  /** Only the boxes that paint on the page being edited. */
  const visible = useMemo(
    () => placeholdersForPage(placeholders, pageIndex),
    [placeholders, pageIndex],
  );

  const active = useMemo(
    () => visible.find((p) => p.id === activeId) ?? null,
    [visible, activeId],
  );

  // Stage coordinates are the bleed canvas, but placeholder geometry is stored
  // relative to the TRIM origin — so subtract the bleed margin here. Boxes that
  // bleed off the sheet legitimately carry negative x/y.
  const toMm = useCallback(
    (clientX: number, clientY: number) => {
      const el = stageRef.current;
      if (!el || !canvasWidthMm) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return {
        x: ((clientX - r.left) / r.width) * canvasWidthMm - bleedLeftMm,
        y: ((clientY - r.top) / r.height) * canvasHeightMm - bleedTopMm,
      };
    },
    [canvasWidthMm, canvasHeightMm, bleedLeftMm, bleedTopMm],
  );

  const mmPerPx = useCallback(() => {
    const el = stageRef.current;
    if (!el || !canvasWidthMm) return 1;
    return canvasWidthMm / el.getBoundingClientRect().width;
  }, [canvasWidthMm]);

  const patch = useCallback(
    (id: string, updates: Partial<ArtworkPlaceholder>) => {
      onChange(placeholders.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    },
    [placeholders, onChange],
  );

  const clampBox = useCallback(
    (p: ArtworkPlaceholder): ArtworkPlaceholder => {
      const width = round1(Math.max(5, Math.min(p.width_mm, canvasWidthMm)));
      const height = round1(Math.max(5, Math.min(p.height_mm, canvasHeightMm)));
      return {
        ...p,
        width_mm: width,
        height_mm: height,
        x_mm: round1(
          Math.max(-bleedLeftMm, Math.min(p.x_mm, trimWidthMm + bleedRightMm - width)),
        ),
        y_mm: round1(
          Math.max(-bleedTopMm, Math.min(p.y_mm, trimHeightMm + bleedBottomMm - height)),
        ),
      };
    },
    [
      trimWidthMm,
      trimHeightMm,
      canvasWidthMm,
      canvasHeightMm,
      bleedLeftMm,
      bleedTopMm,
      bleedRightMm,
      bleedBottomMm,
    ],
  );

  /** Snap the selected box to full bleed on all four sides. */
  const bleedOffEdges = useCallback(
    (p: ArtworkPlaceholder) =>
      patch(p.id, {
        x_mm: round1(-bleedLeftMm),
        y_mm: round1(-bleedTopMm),
        width_mm: round1(trimWidthMm + bleedLeftMm + bleedRightMm),
        height_mm: round1(trimHeightMm + bleedTopMm + bleedBottomMm),
      }),
    [patch, trimWidthMm, trimHeightMm, bleedLeftMm, bleedTopMm, bleedRightMm, bleedBottomMm],
  );


  // ── pointer handling ──────────────────────────────────────────────
  const onStagePointerDown = (e: React.PointerEvent) => {
    if (!drawKind) return;
    const { x, y } = toMm(e.clientX, e.clientY);
    setDrag({ mode: "draw", startXmm: x, startYmm: y });
    setGhost({ x, y, w: 0, h: 0 });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.mode === "draw") {
      const { x, y } = toMm(e.clientX, e.clientY);
      setGhost({
        x: Math.min(x, drag.startXmm),
        y: Math.min(y, drag.startYmm),
        w: Math.abs(x - drag.startXmm),
        h: Math.abs(y - drag.startYmm),
      });
      return;
    }
    const scale = mmPerPx();
    const dx = (e.clientX - drag.startX) * scale;
    const dy = (e.clientY - drag.startY) * scale;
    const target = placeholders.find((p) => p.id === drag.id);
    if (!target) return;
    if (drag.mode === "move") {
      patch(drag.id, clampBox({ ...target, x_mm: drag.origX + dx, y_mm: drag.origY + dy }));
    } else {
      patch(drag.id, clampBox({ ...target, width_mm: drag.origW + dx, height_mm: drag.origH + dy }));
    }
  };

  const onPointerUp = () => {
    if (drag?.mode === "draw" && ghost) {
      if (ghost.w > 4 && ghost.h > 4) {
        const created = clampBox(
          makePlaceholder(
            drawKind ?? "image",
            {
              x_mm: round1(ghost.x),
              y_mm: round1(ghost.y),
              width_mm: round1(ghost.w),
              height_mm: round1(ghost.h),
            },
            placeholders.length,
            { scope: newScope, index: pageIndex },
          ),
        );
        onChange([...placeholders, created]);
        setActiveId(created.id);
      }
      setDrawKind(null);
      setGhost(null);
    }
    setDrag(null);
  };

  const addDefault = (kind: PlaceholderKind) => {
    const created = clampBox(
      makePlaceholder(
        kind,
        {
          x_mm: round1(trimWidthMm * 0.1),
          y_mm: round1(trimHeightMm * 0.1),
          width_mm: round1(trimWidthMm * (kind === "image" ? 0.5 : 0.4)),
          height_mm: round1(trimHeightMm * (kind === "image" ? 0.3 : 0.08)),
        },
        placeholders.length,
        { scope: newScope, index: pageIndex },
      ),
    );
    onChange([...placeholders, created]);
    setActiveId(created.id);
  };

  const remove = (id: string) => {
    onChange(placeholders.filter((p) => p.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const duplicate = (p: ArtworkPlaceholder) => {
    const copy = clampBox({
      ...p,
      id: makeId(),
      name: `${p.name} copy`,
      x_mm: p.x_mm + 5,
      y_mm: p.y_mm + 5,
    });
    onChange([...placeholders, copy]);
    setActiveId(copy.id);
  };

  const pct = (v: number, total: number) => `${total > 0 ? (v / total) * 100 : 0}%`;

  /** Boxes in paint order: `under` first, then the template, then `over`. */
  const ordered = useMemo(
    () =>
      [...visible].sort(
        (a, b) =>
          (a.layer === "under" ? 0 : 1) - (b.layer === "under" ? 0 : 1) ||
          (a.z_index ?? 0) - (b.z_index ?? 0),
      ),
    [visible],
  );

  /** Nudge a box up or down the stack within its own layer. */
  const restack = (p: ArtworkPlaceholder, dir: -1 | 1) => {
    const sameLayer = ordered.filter((o) => o.layer === p.layer);
    const idx = sameLayer.findIndex((o) => o.id === p.id);
    const target = idx + dir;
    if (target < 0 || target >= sameLayer.length) return;
    const reordered = [...sameLayer];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    // Renumber the layer so the stack is always unambiguous.
    const zById = new Map(reordered.map((o, i) => [o.id, i]));
    onChange(
      placeholders.map((o) => (zById.has(o.id) ? { ...o, z_index: zById.get(o.id)! } : o)),
    );
  };



  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Stage */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={drawKind === "image" ? "default" : "outline"}
            onClick={() => setDrawKind(drawKind === "image" ? null : "image")}
          >
            <ImageIcon className="h-4 w-4 mr-1.5" /> Draw image box
          </Button>
          <Button
            size="sm"
            variant={drawKind === "text" ? "default" : "outline"}
            onClick={() => setDrawKind(drawKind === "text" ? null : "text")}
          >
            <Type className="h-4 w-4 mr-1.5" /> Draw text box
          </Button>
          <Button
            size="sm"
            variant={drawKind === "colour" ? "default" : "outline"}
            onClick={() => setDrawKind(drawKind === "colour" ? null : "colour")}
          >
            <Palette className="h-4 w-4 mr-1.5" /> Draw colour box
          </Button>
          {pageCount > 1 && (
            <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
              <Label className="text-xs text-muted-foreground">New boxes</Label>
              <Select
                value={newScope}
                onValueChange={(v) => setNewScope(v as PlaceholderPageScope)}
              >
                <SelectTrigger className="h-7 w-[150px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">This page only</SelectItem>
                  <SelectItem value="all">Every page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={() => addDefault("image")}>
            + Image
          </Button>
          <Button size="sm" variant="ghost" onClick={() => addDefault("text")}>
            + Text
          </Button>
          <Button size="sm" variant="ghost" onClick={() => addDefault("colour")}>
            + Colour
          </Button>

          {drawKind && (
            <span className="text-xs text-muted-foreground">
              Drag on the page to draw the box.
            </span>
          )}
        </div>

        <div
          ref={stageRef}
          onPointerDown={onStagePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className={`relative w-full overflow-hidden rounded-none border bg-muted ${drawKind ? "cursor-crosshair" : ""}`}
          style={{ aspectRatio: `${canvasWidthMm || 1} / ${canvasHeightMm || 1}` }}
        >
          {pageImageUrl ? (
            <img
              src={pageImageUrl}
              alt="Template page"
              className="absolute inset-0 h-full w-full select-none object-fill"
              draggable={false}
              style={{ zIndex: 5 }}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              Upload a template PDF to start placing boxes.
            </div>
          )}

          {ordered.map((p, i) => (
            <div
              key={p.id}
              onPointerDown={(e) => {
                if (drawKind) return;
                e.stopPropagation();
                setActiveId(p.id);
                setDrag({
                  mode: "move",
                  id: p.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: p.x_mm,
                  origY: p.y_mm,
                });
                (e.target as Element).setPointerCapture?.(e.pointerId);
              }}
              className={`absolute cursor-move border-2 ${
                p.layer === "under"
                  ? activeId === p.id
                    ? "border-amber-500 bg-amber-500/20"
                    : "border-amber-500/50 bg-amber-500/10"
                  : activeId === p.id
                    ? "border-primary bg-primary/15"
                    : "border-primary/50 bg-primary/5"
              }`}
              style={{
                left: pct(p.x_mm + bleedLeftMm, canvasWidthMm),
                top: pct(p.y_mm + bleedTopMm, canvasHeightMm),
                width: pct(p.width_mm, canvasWidthMm),
                height: pct(p.height_mm, canvasHeightMm),
                borderRadius: `${(p.corner_radius_mm / Math.max(1, p.width_mm)) * 100}%`,
                // Under-template boxes sit below the artwork image (zIndex 5).
                zIndex: p.layer === "under" ? 1 : 10 + i,
                // Colour boxes preview their actual ink build.
                background:
                  p.kind === "colour" ? cmykToHex(p.default_cmyk ?? DEFAULT_CMYK) : undefined,
                opacity: p.kind === "colour" ? (p.opacity ?? 1) : undefined,
              }}
            >
              <span
                className={`pointer-events-none absolute left-0 top-0 max-w-full truncate px-1 text-[10px] leading-4 ${
                  p.layer === "under"
                    ? "bg-amber-500 text-white"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {p.kind === "text" ? "T" : p.kind === "colour" ? "CLR" : "IMG"} · {p.name}
                {p.layer === "under" ? " · behind" : ""}
                {(p.opacity ?? 1) < 1 ? ` · ${Math.round((p.opacity ?? 1) * 100)}%` : ""}
              </span>


              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setActiveId(p.id);
                  setDrag({
                    mode: "resize",
                    id: p.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    origW: p.width_mm,
                    origH: p.height_mm,
                  });
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                }}
                className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm border border-background bg-primary"
              />
            </div>
          ))}

          {ghost && (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
              style={{
                left: pct(ghost.x + bleedLeftMm, canvasWidthMm),
                top: pct(ghost.y + bleedTopMm, canvasHeightMm),
                width: pct(ghost.w, canvasWidthMm),
                height: pct(ghost.h, canvasHeightMm),
              }}
            />
          )}

          {/* Where the sheet actually cuts. Anything outside is trimmed away. */}
          {hasBleed && (
            <div
              className="pointer-events-none absolute border border-dashed border-foreground/70 outline-dashed outline-1 outline-background/70"
              style={{
                left: pct(bleedLeftMm, canvasWidthMm),
                top: pct(bleedTopMm, canvasHeightMm),
                width: pct(trimWidthMm, canvasWidthMm),
                height: pct(trimHeightMm, canvasHeightMm),
                zIndex: 9999,
              }}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Trim {trimWidthMm} × {trimHeightMm} mm
          {hasBleed
            ? ` · showing ${Math.max(bleedLeftMm, bleedTopMm, bleedRightMm, bleedBottomMm)} mm bleed — the dashed line is where it cuts, anything outside is trimmed off`
            : ""}
          . Boxes repeat on every page of the template.
        </p>
      </div>


      {/* Inspector */}
      <div className="space-y-3">
        <div className="rounded-lg border">
          <div className="border-b px-3 py-2 text-sm font-medium">
            Layers ({visible.length}
            {pageCount > 1 ? ` on page ${pageIndex + 1}` : ""})
          </div>
          <div className="max-h-56 overflow-auto">
            {ordered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">None yet.</p>
            ) : (
              // Top of the list = top of the stack.
              [...ordered].reverse().map((p) => (
                <div
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                    activeId === p.id ? "bg-muted" : ""
                  }`}
                >
                  {p.kind === "text" ? (
                    <Type className="h-3.5 w-3.5 shrink-0" />
                  ) : p.kind === "colour" ? (
                    <Palette className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                  )}

                  <span className="truncate">{p.name}</span>
                  {pageCount > 1 && (
                    <Badge
                      variant={(p.page_scope ?? "all") === "all" ? "secondary" : "outline"}
                      className="shrink-0 text-[10px]"
                    >
                      {(p.page_scope ?? "all") === "all" ? "all pages" : pageScopeLabel(p)}
                    </Badge>
                  )}
                  {(p.field_key ?? "").trim() && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      #{p.field_key}
                    </Badge>
                  )}
                  {p.layer === "under" && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">behind</Badge>
                  )}
                  {(p.opacity ?? 1) < 1 && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {Math.round((p.opacity ?? 1) * 100)}%
                    </Badge>
                  )}
                  {p.is_required && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">req</Badge>
                  )}
                  <span className="ml-auto flex shrink-0 items-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        restack(p, 1);
                      }}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        restack(p, -1);
                      }}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>


        {active && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Selected box</span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => duplicate(active)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(active.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Label shown to the customer</Label>
              <Input
                value={active.name}
                onChange={(e) => patch(active.id, { name: e.target.value })}
              />
            </div>

            {pageCount > 1 && (
              <div className="space-y-2 rounded-md border p-2">
                <Label className="text-xs">Appears on</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={active.page_scope ?? "all"}
                    onValueChange={(v) =>
                      patch(active.id, {
                        page_scope: v as PlaceholderPageScope,
                        page_index: v === "page" ? (active.page_index ?? pageIndex) : null,
                        page_indexes:
                          v === "pages"
                            ? (active.page_indexes?.length
                                ? active.page_indexes
                                : [active.page_index ?? pageIndex])
                            : null,
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="page">This page only</SelectItem>
                      <SelectItem value="pages">Specific pages…</SelectItem>
                      <SelectItem value="all">Every page</SelectItem>
                    </SelectContent>
                  </Select>
                  {(active.page_scope ?? "all") === "page" && (
                    <Select
                      value={String(active.page_index ?? pageIndex)}
                      onValueChange={(v) => patch(active.id, { page_index: Number(v) })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: pageCount }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            Page {i + 1}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {(active.page_scope ?? "all") === "page" && (
                  <Select
                    value=""
                    onValueChange={(v) => {
                      const target = Number(v);
                      const copy = {
                        ...active,
                        id: makeId(),
                        page_scope: "page" as PlaceholderPageScope,
                        page_index: target,
                        z_index: placeholders.length,
                        sort_order: placeholders.length,
                      };
                      onChange([...placeholders, copy]);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Copy this box to another page…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: pageCount }, (_, i) => i)
                        .filter((i) => i !== (active.page_index ?? pageIndex))
                        .map((i) => (
                          <SelectItem key={i} value={String(i)}>
                            Copy to page {i + 1}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                {(active.page_scope ?? "all") === "pages" && (
                  <div className="space-y-1">
                    <Input
                      className="h-8 text-xs"
                      defaultValue={formatPageRange(active.page_indexes)}
                      placeholder="e.g. 2-13 or 1,3,5"
                      onBlur={(e) =>
                        patch(active.id, {
                          page_indexes: parsePageRange(e.target.value, pageCount),
                        })
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Pages {formatPageRange(active.page_indexes) || "—"} (1 = first page)
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5 rounded-md border p-2">
              <Label className="text-xs">Shared field name (optional)</Label>
              <Input
                className="h-8 text-xs"
                list="artwork-field-keys"
                value={active.field_key ?? ""}
                placeholder="e.g. logo"
                onChange={(e) => patch(active.id, { field_key: e.target.value })}
              />
              <datalist id="artwork-field-keys">
                {[...new Set(
                  placeholders
                    .map((p) => (p.field_key ?? "").trim())
                    .filter(Boolean),
                )].map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
              <p className="text-[11px] text-muted-foreground">
                Boxes sharing a name are filled by one customer upload — placed in each
                box's own position and size.
              </p>
            </div>



            <div className="grid grid-cols-2 gap-2">
              {(["x_mm", "y_mm", "width_mm", "height_mm"] as const).map((key) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs uppercase">{key.replace("_mm", "")} (mm)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={active[key]}
                    onChange={(e) =>
                      patch(
                        active.id,
                        clampBox({ ...active, [key]: Number(e.target.value) || 0 }),
                      )
                    }
                  />
                </div>
              ))}
            </div>

            {hasBleed && (
              <div className="space-y-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => bleedOffEdges(active)}
                >
                  Bleed off all edges
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Negative X/Y are allowed — they push the box out into the bleed
                  (up to {Math.max(bleedLeftMm, bleedTopMm, bleedRightMm, bleedBottomMm)} mm).
                </p>
              </div>
            )}


            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Layer</Label>
                <Select
                  value={active.layer ?? "over"}
                  onValueChange={(v) => patch(active.id, { layer: v as "under" | "over" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="over">In front of the template</SelectItem>
                    <SelectItem value="under">Behind the template</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Opacity ({Math.round((active.opacity ?? 1) * 100)}%)</Label>
                <Input
                  type="number"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round((active.opacity ?? 1) * 100)}
                  onChange={(e) => {
                    const pctVal = Math.max(5, Math.min(100, Number(e.target.value) || 100));
                    patch(active.id, { opacity: pctVal / 100 });
                  }}
                />
              </div>
            </div>
            {active.layer === "under" && (
              <p className="text-xs text-muted-foreground">
                Behind-template boxes show through wherever the template artwork is transparent.
              </p>
            )}


            {active.kind === "colour" ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Default colour (CMYK %)</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {(["c", "m", "y", "k"] as const).map((ch) => (
                      <div key={ch} className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">{ch}</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={(active.default_cmyk ?? DEFAULT_CMYK)[ch]}
                          onChange={(e) =>
                            patch(active.id, {
                              default_cmyk: normaliseCmyk({
                                ...(active.default_cmyk ?? DEFAULT_CMYK),
                                [ch]: Number(e.target.value),
                              } as ArtworkCmyk),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span
                      className="h-6 w-10 rounded border"
                      style={{ background: cmykToHex(active.default_cmyk ?? DEFAULT_CMYK) }}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      Screen approximation — the PDF prints the exact ink build.
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Corner radius (mm)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    value={active.corner_radius_mm}
                    onChange={(e) =>
                      patch(active.id, { corner_radius_mm: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="flex items-start justify-between gap-3 rounded-md border p-2">
                  <div>
                    <Label className="text-xs">Customer can change colour</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Off means the block always prints the default build. Position and size are
                      always fixed.
                    </p>
                  </div>
                  <Switch
                    checked={active.customer_editable_colour !== false}
                    onCheckedChange={(v) => patch(active.id, { customer_editable_colour: v })}
                  />
                </div>
              </>
            ) : active.kind === "image" ? (

              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Default fit</Label>
                  <Select
                    value={active.fit_mode}
                    onValueChange={(v) => patch(active.id, { fit_mode: v as "fit" | "fill" })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fill">Fill box (crop overflow)</SelectItem>
                      <SelectItem value="fit">Fit inside (show all)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Corner radius (mm)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    value={active.corner_radius_mm}
                    onChange={(e) =>
                      patch(active.id, { corner_radius_mm: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Font</Label>
                    <Select
                      value={active.text_style?.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily}
                      onValueChange={(v) =>
                        patch(active.id, { text_style: { ...active.text_style, fontFamily: v } })
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ARTWORK_FONTS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Size (pt)</Label>
                    <Input
                      type="number"
                      min={4}
                      value={active.text_style?.fontSizePt ?? DEFAULT_TEXT_STYLE.fontSizePt}
                      onChange={(e) =>
                        patch(active.id, {
                          text_style: { ...active.text_style, fontSizePt: Number(e.target.value) || 12 },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Align</Label>
                    <Select
                      value={active.text_style?.align ?? "left"}
                      onValueChange={(v) =>
                        patch(active.id, { text_style: { ...active.text_style, align: v as any } })
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Centre</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Colour</Label>
                    <Input
                      type="color"
                      className="h-9 p-1"
                      value={active.text_style?.colorHex ?? DEFAULT_TEXT_STYLE.colorHex}
                      onChange={(e) =>
                        patch(active.id, { text_style: { ...active.text_style, colorHex: e.target.value } })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max characters</Label>
                    <Input
                      type="number"
                      min={1}
                      value={active.max_length ?? 80}
                      onChange={(e) => patch(active.id, { max_length: Number(e.target.value) || 80 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Default text</Label>
                    <Input
                      value={active.default_value ?? ""}
                      onChange={(e) => patch(active.id, { default_value: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center justify-between rounded-md border p-2">
              <Label className="text-xs">Required</Label>
              <Switch
                checked={active.is_required}
                onCheckedChange={(v) => patch(active.id, { is_required: v })}
              />
            </div>

            {active.kind === "image" && (
              <div className="flex items-start justify-between gap-3 rounded-md border p-2">
                <div>
                  <Label className="text-xs">Watermark image</Label>
                  <p className="text-[11px] text-muted-foreground">
                    When the customer places a file here, the paid watermark printing extra is
                    switched on and locked.
                  </p>
                </div>
                <Switch
                  checked={!!active.is_watermark}
                  onCheckedChange={(v) => patch(active.id, { is_watermark: v })}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
