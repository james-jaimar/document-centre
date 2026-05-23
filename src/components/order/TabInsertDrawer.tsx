import { useCallback, useMemo, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Wand2, Trash2, Tag, FileStack } from "lucide-react";
import { TAB_COLORS } from "@/components/preview/previewTypes";
import { toast } from "sonner";

type DocumentSection = Tables<"document_sections">;
type Document = Tables<"documents">;

const INSERT_COLORS = [
  { slug: "white", label: "White", hex: "#f8f8f8" },
  { slug: "yellow", label: "Yellow", hex: "#fef9c3" },
  { slug: "blue", label: "Blue", hex: "#dbeafe" },
  { slug: "green", label: "Green", hex: "#dcfce7" },
  { slug: "pink", label: "Pink", hex: "#fce7f3" },
];

/** Build a flat list of body pages with unique sequential indices */
function buildBodyPages(sections: DocumentSection[], documents: Document[]) {
  const pages: { pageNumber: number; label: string }[] = [];
  let pageNum = 1;
  for (const section of sections) {
    if (section.section_type === "tab" || section.section_type === "insert") continue;
    const doc = documents.find((d) => d.id === section.document_id);
    if (!doc) continue;
    const count = doc.page_count ?? 0;
    for (let p = 0; p < count; p++) {
      pages.push({ pageNumber: pageNum, label: `Page ${pageNum}` });
      pageNum++;
    }
  }
  return pages;
}

interface TabInsertDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: DocumentSection[];
  documents: Document[];
  orderItemId: string;
  isDuplex: boolean;
  tabEnabled: boolean;
  tabCount: number;
  packCount?: number;
  isMultiColor: boolean;
  onAddTab: (afterPage: number, label?: string, bankPosition?: number) => Promise<void>;
  onDeleteTab: (sectionId: string) => Promise<void>;
  onMoveTab: (sectionId: string, afterPage: number) => Promise<void>;
  onUpdateTabLabel: (sectionId: string, label: string) => Promise<void>;
  onUpdateTabBankPosition?: (sectionId: string, bankPosition: number) => Promise<void>;
  insertEnabled: boolean;
  onAddInsert: (afterPage: number, color: string) => Promise<void>;
  onDeleteInsert: (sectionId: string) => Promise<void>;
  onMoveInsert: (sectionId: string, afterPage: number) => Promise<void>;
}

export default function TabInsertDrawer({
  open,
  onOpenChange,
  sections,
  documents,
  orderItemId,
  isDuplex,
  tabEnabled,
  tabCount,
  packCount = 0,
  isMultiColor,
  onAddTab,
  onDeleteTab,
  onMoveTab,
  onUpdateTabLabel,
  onUpdateTabBankPosition,
  insertEnabled,
  onAddInsert,
  onDeleteInsert,
  onMoveInsert,
}: TabInsertDrawerProps) {
  const [selectedInsertColor, setSelectedInsertColor] = useState("white");

  const bodyPages = useMemo(() => buildBodyPages(sections, documents), [sections, documents]);

  // For duplex, only allow placement at sheet boundaries (even page numbers)
  const validPages = useMemo(() => {
    if (!isDuplex) return bodyPages;
    return bodyPages.filter((p) => p.pageNumber % 2 === 0);
  }, [bodyPages, isDuplex]);

  const tabSections = useMemo(
    () => sections
      .filter((s) => s.section_type === "tab")
      .sort((a, b) => (a.page_range_start ?? 0) - (b.page_range_start ?? 0)),
    [sections]
  );

  const insertSections = useMemo(
    () => sections.filter((s) => s.section_type === "insert"),
    [sections]
  );

  const canAddMoreTabs = tabSections.length < tabCount;

  /** Get the page_range_start value for display — this IS the "after page N" anchor */
  const getAnchor = (item: DocumentSection): number => {
    return item.page_range_start ?? 1;
  };

  /** Set of bank slots already occupied across placed tabs */
  const usedSlots = useMemo(() => {
    const s = new Set<number>();
    for (const t of tabSections) {
      const p = (t as any).bank_position as number | null | undefined;
      if (typeof p === "number") s.add(p);
    }
    return s;
  }, [tabSections]);

  /** Find the next free physical slot (1..tabCount), preferring sequential order */
  const nextFreeSlot = useCallback((): number | undefined => {
    for (let i = 1; i <= tabCount; i++) {
      if (!usedSlots.has(i)) return i;
    }
    return undefined;
  }, [usedSlots, tabCount]);

  const handleAutoInsert = useCallback(async () => {
    // Delete existing tabs first
    for (const tab of tabSections) {
      await onDeleteTab(tab.id);
    }
    const totalBodyPages = bodyPages.length;
    if (totalBodyPages === 0 || tabCount === 0) return;
    const interval = totalBodyPages / (tabCount + 1);
    for (let i = 1; i <= tabCount; i++) {
      const targetPage = Math.round(interval * i);
      // Auto-distribute assigns slot 1..N in order so banks fill sequentially
      await onAddTab(targetPage, `Tab ${i}`, i);
    }
    toast.success(`${tabCount} tab dividers auto-inserted`);
  }, [tabSections, bodyPages, tabCount, onAddTab, onDeleteTab]);


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px] overflow-auto">
        <SheetHeader>
          <SheetTitle>Tabs & Insert Sheets</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* ── TAB DIVIDERS ── */}
          {tabEnabled && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Tab Dividers ({tabSections.length}/{tabCount})
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleAutoInsert}>
                    <Wand2 className="h-3 w-3 mr-1" /> Auto
                  </Button>
                  {canAddMoreTabs && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => onAddTab(
                        validPages.length > 0 ? validPages[validPages.length - 1].pageNumber : 1,
                        undefined,
                        nextFreeSlot(),
                      )}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  )}
                </div>
              </div>

              {packCount > 0 && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Tab dividers come in pre-cut packs of 10 in a fixed order.
                  You've selected <strong>{packCount} pack{packCount === 1 ? "" : "s"}</strong> ({tabCount} slots).
                  You don't have to fill every slot — but slot 3 is always the 3rd physical tab.
                </p>
              )}

              {tabSections.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
                  No tabs placed yet. Use Auto or Add to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {tabSections.map((tab, idx) => {
                    const bankPos = (tab as any).bank_position as number | null | undefined;
                    const colorIdx = (typeof bankPos === "number" ? bankPos - 1 : idx);
                    const color = isMultiColor ? TAB_COLORS[colorIdx % TAB_COLORS.length] : undefined;
                    const anchor = getAnchor(tab);
                    return (
                      <div key={tab.id} className="rounded-lg border border-border bg-card p-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-sm shrink-0 border border-border/40"
                            style={{ backgroundColor: color ?? "hsl(var(--muted))" }}
                          />
                          <Input
                            defaultValue={tab.label || `Tab ${idx + 1}`}
                            placeholder={`Tab ${idx + 1}`}
                            onBlur={(e) => onUpdateTabLabel(tab.id, e.target.value)}
                            className="h-7 text-xs flex-1 min-w-0"
                          />
                          <Select
                            value={String(anchor)}
                            onValueChange={(val) => onMoveTab(tab.id, Number(val))}
                          >
                            <SelectTrigger className="h-7 w-[130px] text-xs shrink-0">
                              <SelectValue>After Page {anchor}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {validPages.map((page) => (
                                <SelectItem key={page.pageNumber} value={String(page.pageNumber)} className="text-xs">
                                  After {page.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => onDeleteTab(tab.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {/* ── Physical slot picker (1..tabCount within pack of 10) ── */}
                        {onUpdateTabBankPosition && tabCount > 0 && (
                          <div className="flex items-center gap-1 pl-6 flex-wrap">
                            <span className="text-[10px] text-muted-foreground mr-1">Physical slot:</span>
                            {Array.from({ length: tabCount }, (_, i) => i + 1).map((slot) => {
                              const isSelected = bankPos === slot;
                              const isUsedByOther = usedSlots.has(slot) && !isSelected;
                              const slotColor = isMultiColor ? TAB_COLORS[(slot - 1) % TAB_COLORS.length] : undefined;
                              return (
                                <button
                                  key={slot}
                                  type="button"
                                  disabled={isUsedByOther}
                                  onClick={() => onUpdateTabBankPosition(tab.id, slot)}
                                  title={isUsedByOther ? `Slot ${slot} used by another tab` : `Slot ${slot}${slot % 10 === 0 ? ` (end of pack ${slot / 10})` : ""}`}
                                  className={`h-5 min-w-[20px] px-1 rounded text-[10px] font-medium border transition-all ${
                                    isSelected
                                      ? "border-primary bg-primary/10 text-foreground"
                                      : isUsedByOther
                                        ? "border-border/40 text-muted-foreground/40 cursor-not-allowed"
                                        : "border-border/60 text-muted-foreground hover:border-primary/50"
                                  }`}
                                  style={isSelected && slotColor ? { backgroundColor: slotColor, color: "#000" } : undefined}
                                >
                                  {slot}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ── INSERT SHEETS ── */}
          {insertEnabled && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileStack className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Insert Sheets ({insertSections.length})
                  </h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => onAddInsert(
                    validPages.length > 0 ? validPages[validPages.length - 1].pageNumber : 1,
                    selectedInsertColor
                  )}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>

              {/* Color picker */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Color:</span>
                {INSERT_COLORS.map((c) => (
                  <button
                    key={c.slug}
                    onClick={() => setSelectedInsertColor(c.slug)}
                    className="w-6 h-6 rounded-md border-2 transition-all"
                    style={{
                      backgroundColor: c.hex,
                      borderColor: selectedInsertColor === c.slug ? "hsl(var(--primary))" : "transparent",
                    }}
                    title={c.label}
                  />
                ))}
              </div>

              {insertSections.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
                  No insert sheets added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {insertSections.map((ins) => {
                    const colorObj = INSERT_COLORS.find((c) => c.slug === ins.color) ?? INSERT_COLORS[0];
                    const anchor = getAnchor(ins);
                    return (
                      <div key={ins.id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                        <div
                          className="w-4 h-4 rounded-sm shrink-0 border border-border/40"
                          style={{ backgroundColor: colorObj.hex }}
                        />
                        <span className="text-xs font-medium text-foreground flex-1">
                          {colorObj.label} Sheet
                        </span>
                        <Select
                          value={String(anchor)}
                          onValueChange={(val) => onMoveInsert(ins.id, Number(val))}
                        >
                          <SelectTrigger className="h-7 w-[130px] text-xs shrink-0">
                            <SelectValue>After Page {anchor}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {validPages.map((page) => (
                              <SelectItem key={page.pageNumber} value={String(page.pageNumber)} className="text-xs">
                                After {page.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => onDeleteInsert(ins.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
