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

interface BodyPage {
  pageNumber: number;
  label: string;
  parentSortOrder: number;
}

function buildBodyPages(sections: DocumentSection[], documents: Document[]): BodyPage[] {
  const pages: BodyPage[] = [];
  let pageNum = 1;
  for (const section of sections) {
    if (section.section_type === "tab" || section.section_type === "insert") continue;
    const doc = documents.find((d) => d.id === section.document_id);
    if (!doc) continue;
    const count = doc.page_count ?? 0;
    for (let p = 0; p < count; p++) {
      pages.push({
        pageNumber: pageNum,
        label: `Page ${pageNum}`,
        parentSortOrder: section.sort_order,
      });
      pageNum++;
    }
  }
  return pages;
}

function getPositionLabel(item: DocumentSection, bodyPages: BodyPage[]): string {
  let label = "Start";
  for (const page of bodyPages) {
    if (page.parentSortOrder < item.sort_order) {
      label = page.label;
    }
  }
  return `After ${label}`;
}

interface TabInsertDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: DocumentSection[];
  documents: Document[];
  orderItemId: string;
  tabEnabled: boolean;
  tabCount: number;
  isMultiColor: boolean;
  onAddTab: (sortOrder: number) => Promise<void>;
  onDeleteTab: (sectionId: string) => Promise<void>;
  onMoveTab: (sectionId: string, newSortOrder: number) => Promise<void>;
  onUpdateTabLabel: (sectionId: string, label: string) => Promise<void>;
  insertEnabled: boolean;
  onAddInsert: (sortOrder: number, color: string) => Promise<void>;
  onDeleteInsert: (sectionId: string) => Promise<void>;
  onMoveInsert: (sectionId: string, newSortOrder: number) => Promise<void>;
}

export default function TabInsertDrawer({
  open,
  onOpenChange,
  sections,
  documents,
  orderItemId,
  tabEnabled,
  tabCount,
  isMultiColor,
  onAddTab,
  onDeleteTab,
  onMoveTab,
  onUpdateTabLabel,
  insertEnabled,
  onAddInsert,
  onDeleteInsert,
  onMoveInsert,
}: TabInsertDrawerProps) {
  const [selectedInsertColor, setSelectedInsertColor] = useState("white");

  const bodyPages = useMemo(() => buildBodyPages(sections, documents), [sections, documents]);

  const tabSections = useMemo(
    () => sections.filter((s) => s.section_type === "tab"),
    [sections]
  );

  const insertSections = useMemo(
    () => sections.filter((s) => s.section_type === "insert"),
    [sections]
  );

  const canAddMoreTabs = tabSections.length < tabCount;

  const handleAddTabAfterPage = useCallback(async (pageNumber: number) => {
    const page = bodyPages.find((p) => p.pageNumber === pageNumber);
    if (page) {
      await onAddTab(page.parentSortOrder + 1);
    }
  }, [bodyPages, onAddTab]);

  const handleAddTabAtEnd = useCallback(async () => {
    const maxSort = sections.reduce((max, s) => Math.max(max, s.sort_order), 0);
    await onAddTab(maxSort + 1);
  }, [sections, onAddTab]);

  const handleAutoInsert = useCallback(async () => {
    for (const tab of tabSections) {
      await onDeleteTab(tab.id);
    }
    const totalBodyPages = bodyPages.length;
    if (totalBodyPages === 0 || tabCount === 0) return;
    const interval = totalBodyPages / (tabCount + 1);
    for (let i = 1; i <= tabCount; i++) {
      const targetPage = Math.round(interval * i);
      const page = bodyPages[Math.min(targetPage - 1, bodyPages.length - 1)];
      if (page) await onAddTab(page.parentSortOrder + 1);
    }
    toast.success(`${tabCount} tab dividers auto-inserted`);
  }, [tabSections, bodyPages, tabCount, onAddTab, onDeleteTab]);

  const handleMoveTabToPage = useCallback(async (sectionId: string, pageNumber: number) => {
    const page = bodyPages.find((p) => p.pageNumber === pageNumber);
    if (page) {
      await onMoveTab(sectionId, page.parentSortOrder + 1);
    }
  }, [bodyPages, onMoveTab]);

  const handleAddInsertAfterPage = useCallback(async (pageNumber: number) => {
    const page = bodyPages.find((p) => p.pageNumber === pageNumber);
    if (page) {
      await onAddInsert(page.parentSortOrder + 1, selectedInsertColor);
    }
  }, [bodyPages, onAddInsert, selectedInsertColor]);

  const handleAddInsertAtEnd = useCallback(async () => {
    const maxSort = sections.reduce((max, s) => Math.max(max, s.sort_order), 0);
    await onAddInsert(maxSort + 1, selectedInsertColor);
  }, [sections, onAddInsert, selectedInsertColor]);

  const handleMoveInsertToPage = useCallback(async (sectionId: string, pageNumber: number) => {
    const page = bodyPages.find((p) => p.pageNumber === pageNumber);
    if (page) {
      await onMoveInsert(sectionId, page.parentSortOrder + 1);
    }
  }, [bodyPages, onMoveInsert]);

  const getItemPositionLabel = useCallback((item: DocumentSection) => {
    return getPositionLabel(item, bodyPages);
  }, [bodyPages]);

  const getItemPageValue = useCallback((item: DocumentSection): string => {
    let lastPageNum = 0;
    for (const page of bodyPages) {
      if (page.parentSortOrder < item.sort_order) {
        lastPageNum = page.pageNumber;
      }
    }
    return String(lastPageNum || bodyPages[0]?.pageNumber || 1);
  }, [bodyPages]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px] overflow-auto">
        <SheetHeader>
          <SheetTitle>Tabs & Insert Sheets</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
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
                </div>
              </div>

              {tabSections.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
                  No tabs placed yet. Use Auto or add manually below.
                </p>
              ) : (
                <div className="space-y-2">
                  {tabSections.map((tab, idx) => {
                    const color = isMultiColor ? TAB_COLORS[idx % TAB_COLORS.length] : undefined;
                    return (
                      <div key={tab.id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                        <div
                          className="w-4 h-4 rounded-sm shrink-0 border border-border/40"
                          style={{ backgroundColor: color ?? "hsl(var(--muted))" }}
                        />
                        <Input
                          defaultValue={(tab as any).label || `Tab ${idx + 1}`}
                          placeholder={`Tab ${idx + 1}`}
                          onBlur={(e) => onUpdateTabLabel(tab.id, e.target.value)}
                          className="h-7 text-xs flex-1 min-w-0"
                        />
                        <Select
                          value={getItemPageValue(tab)}
                          onValueChange={(val) => handleMoveTabToPage(tab.id, Number(val))}
                        >
                          <SelectTrigger className="h-7 w-[120px] text-xs shrink-0">
                            <SelectValue>{getItemPositionLabel(tab)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {bodyPages.map((page) => (
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
                    );
                  })}
                </div>
              )}

              {canAddMoreTabs && (
                <div className="border border-dashed border-border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Add tab after…</p>
                  <div className="max-h-32 overflow-auto space-y-0.5">
                    {bodyPages.map((page) => (
                      <button
                        key={page.pageNumber}
                        onClick={() => handleAddTabAfterPage(page.pageNumber)}
                        className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
                      >
                        {page.label}
                      </button>
                    ))}
                    <button
                      onClick={handleAddTabAtEnd}
                      className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors text-muted-foreground"
                    >
                      At end
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {insertEnabled && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileStack className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Insert Sheets ({insertSections.length})
                </h3>
              </div>

              {insertSections.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
                  No insert sheets added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {insertSections.map((ins) => {
                    const colorObj = INSERT_COLORS.find((c) => c.slug === (ins as any).color) ?? INSERT_COLORS[0];
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
                          value={getItemPageValue(ins)}
                          onValueChange={(val) => handleMoveInsertToPage(ins.id, Number(val))}
                        >
                          <SelectTrigger className="h-7 w-[120px] text-xs shrink-0">
                            <SelectValue>{getItemPositionLabel(ins)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {bodyPages.map((page) => (
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

              <div className="border border-dashed border-border rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Sheet color</p>
                <div className="flex gap-1.5">
                  {INSERT_COLORS.map((c) => (
                    <button
                      key={c.slug}
                      onClick={() => setSelectedInsertColor(c.slug)}
                      className="w-7 h-7 rounded-md border-2 transition-all"
                      style={{
                        backgroundColor: c.hex,
                        borderColor: selectedInsertColor === c.slug ? "hsl(var(--primary))" : "transparent",
                      }}
                      title={c.label}
                    />
                  ))}
                </div>
                <p className="text-xs font-medium text-muted-foreground mt-2">Insert after…</p>
                <div className="max-h-32 overflow-auto space-y-0.5">
                  {bodyPages.map((page) => (
                    <button
                      key={page.pageNumber}
                      onClick={() => handleAddInsertAfterPage(page.pageNumber)}
                      className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
                    >
                      {page.label}
                    </button>
                  ))}
                  <button
                    onClick={handleAddInsertAtEnd}
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors text-muted-foreground"
                  >
                    At end
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
