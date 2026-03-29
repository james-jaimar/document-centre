import { useCallback, useMemo, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Wand2, Trash2, Tag } from "lucide-react";
import { TAB_COLORS } from "@/components/preview/previewTypes";
import { toast } from "sonner";

type DocumentSection = Tables<"document_sections">;
type Document = Tables<"documents">;

interface TabManagerProps {
  sections: DocumentSection[];
  documents: Document[];
  orderItemId: string;
  tabCount: number;
  isMultiColor: boolean;
  onAddTab: (sortOrder: number) => Promise<void>;
  onDeleteTab: (sectionId: string) => Promise<void>;
  onMoveTab: (sectionId: string, newSortOrder: number) => Promise<void>;
  onUpdateTabLabel?: (sectionId: string, label: string) => Promise<void>;
}

export default function TabManager({
  sections,
  documents,
  orderItemId,
  tabCount,
  isMultiColor,
  onAddTab,
  onDeleteTab,
  onMoveTab,
}: TabManagerProps) {
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);

  // Separate tabs from body sections
  const tabSections = useMemo(
    () => sections.filter((s) => s.section_type === "tab"),
    [sections]
  );

  // Build page positions from non-tab sections for the "insert after page" dropdown
  const bodyPages = useMemo(() => {
    const pages: { label: string; sortOrder: number }[] = [];
    let pageNum = 1;
    for (const section of sections) {
      if (section.section_type === "tab") continue;
      const doc = documents.find((d) => d.id === section.document_id);
      const count = doc?.page_count ?? 1;
      for (let p = 0; p < count; p++) {
        pages.push({
          label: `Page ${pageNum}`,
          sortOrder: section.sort_order,
        });
        pageNum++;
      }
    }
    return pages;
  }, [sections, documents]);

  // Find which page a tab is positioned after
  const getTabPageLabel = (tab: DocumentSection) => {
    // Find the last body page whose sort_order is less than this tab's
    let label = "Start";
    for (const page of bodyPages) {
      if (page.sortOrder < tab.sort_order) {
        label = page.label;
      }
    }
    return `After ${label}`;
  };

  const currentTabCount = tabSections.length;
  const canAddMore = currentTabCount < tabCount;

  // Auto-insert tabs evenly
  const handleAutoInsert = useCallback(async () => {
    for (const tab of tabSections) {
      await onDeleteTab(tab.id);
    }

    const bodySections = sections.filter((s) => s.section_type !== "tab");
    let totalBodyPages = 0;
    for (const sec of bodySections) {
      const doc = documents.find((d) => d.id === sec.document_id);
      totalBodyPages += doc?.page_count ?? 1;
    }

    if (totalBodyPages === 0 || tabCount === 0) return;

    const interval = totalBodyPages / (tabCount + 1);
    const insertPositions: number[] = [];
    for (let i = 1; i <= tabCount; i++) {
      insertPositions.push(Math.round(interval * i));
    }

    let pageCount = 0;
    let tabIdx = 0;

    for (let i = 0; i < bodySections.length && tabIdx < insertPositions.length; i++) {
      const doc = documents.find((d) => d.id === bodySections[i].document_id);
      const secPages = doc?.page_count ?? 1;
      pageCount += secPages;

      while (tabIdx < insertPositions.length && pageCount >= insertPositions[tabIdx]) {
        await onAddTab(bodySections[i].sort_order + 1);
        tabIdx++;
      }
    }

    const lastSort = bodySections.length > 0
      ? bodySections[bodySections.length - 1].sort_order
      : 0;
    while (tabIdx < tabCount) {
      await onAddTab(lastSort + tabIdx + 2);
      tabIdx++;
    }

    toast.success(`${tabCount} tab dividers auto-inserted`);
  }, [tabSections, sections, documents, tabCount, onAddTab, onDeleteTab]);

  const handleAddAfterPage = useCallback(async (sortOrder: number) => {
    await onAddTab(sortOrder + 1);
    setAddPopoverOpen(false);
  }, [onAddTab]);

  const handleAddAtEnd = useCallback(async () => {
    const maxSort = sections.reduce((max, s) => Math.max(max, s.sort_order), 0);
    await onAddTab(maxSort + 1);
    setAddPopoverOpen(false);
  }, [sections, onAddTab]);

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">
            Tab Dividers ({currentTabCount}/{tabCount})
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="text-[11px] h-6 px-2"
            onClick={handleAutoInsert}
          >
            <Wand2 className="h-3 w-3 mr-1" />
            Auto
          </Button>
          <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] h-6 px-2"
                disabled={!canAddMore}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="end">
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Insert after…</p>
              <div className="max-h-40 overflow-auto space-y-0.5">
                {bodyPages.map((page, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAddAfterPage(page.sortOrder)}
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
                  >
                    {page.label}
                  </button>
                ))}
                <button
                  onClick={handleAddAtEnd}
                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors text-muted-foreground"
                >
                  At end
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {tabSections.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-1.5">
          No tabs placed yet. Use Auto or add manually.
        </p>
      ) : (
        <div className="space-y-1">
          {tabSections.map((tab, idx) => {
            const color = isMultiColor
              ? TAB_COLORS[idx % TAB_COLORS.length]
              : undefined;
            return (
              <div
                key={tab.id}
                className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1"
              >
                <div
                  className="w-3 h-3 rounded-sm shrink-0 border border-border/40"
                  style={{ backgroundColor: color ?? "hsl(var(--muted))" }}
                />
                <span className="text-[11px] font-medium text-foreground flex-1">
                  Tab {idx + 1}
                </span>

                {/* Position dropdown */}
                <Select
                  value={String(tab.sort_order)}
                  onValueChange={(val) => onMoveTab(tab.id, Number(val))}
                >
                  <SelectTrigger className="h-5 w-auto min-w-[80px] text-[10px] border-0 bg-transparent px-1">
                    <SelectValue>{getTabPageLabel(tab)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {bodyPages.map((page, pIdx) => (
                      <SelectItem key={pIdx} value={String(page.sortOrder + 1)} className="text-xs">
                        After {page.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <button
                  onClick={() => onDeleteTab(tab.id)}
                  className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
