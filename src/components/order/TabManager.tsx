import { useCallback, useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  // Separate tabs from body sections
  const tabSections = useMemo(
    () => sections.filter((s) => s.section_type === "tab"),
    [sections]
  );

  // Build page positions from non-tab sections for the "insert before page" dropdown
  const bodyPages = useMemo(() => {
    const pages: { label: string; sortOrder: number }[] = [];
    let pageNum = 1;
    for (const section of sections) {
      if (section.section_type === "tab") continue;
      const doc = documents.find((d) => d.id === section.document_id);
      const count = doc?.page_count ?? 1;
      pages.push({
        label: `Page ${pageNum}`,
        sortOrder: section.sort_order,
      });
      pageNum += count;
    }
    return pages;
  }, [sections, documents]);

  const currentTabCount = tabSections.length;
  const canAddMore = currentTabCount < tabCount;

  // Auto-insert tabs evenly
  const handleAutoInsert = useCallback(async () => {
    // Remove existing tabs first
    for (const tab of tabSections) {
      await onDeleteTab(tab.id);
    }

    // Count total body pages
    const bodySections = sections.filter((s) => s.section_type !== "tab");
    let totalBodyPages = 0;
    for (const sec of bodySections) {
      const doc = documents.find((d) => d.id === sec.document_id);
      totalBodyPages += doc?.page_count ?? 1;
    }

    if (totalBodyPages === 0 || tabCount === 0) return;

    // Calculate page positions for tab insertion
    const interval = totalBodyPages / (tabCount + 1);
    const insertPositions: number[] = [];
    for (let i = 1; i <= tabCount; i++) {
      insertPositions.push(Math.round(interval * i));
    }

    // Map page positions to sort orders
    // We need to re-number all sort_orders: body sections get even numbers, tabs get odd
    let pageCount = 0;
    let tabIdx = 0;
    const sortBase = 100; // Start at 100 to leave room

    for (let i = 0; i < bodySections.length && tabIdx < insertPositions.length; i++) {
      const doc = documents.find((d) => d.id === bodySections[i].document_id);
      const secPages = doc?.page_count ?? 1;
      pageCount += secPages;

      while (tabIdx < insertPositions.length && pageCount >= insertPositions[tabIdx]) {
        // Insert tab after this section
        await onAddTab(bodySections[i].sort_order + 1);
        tabIdx++;
      }
    }

    // Add remaining tabs at end
    const lastSort = bodySections.length > 0
      ? bodySections[bodySections.length - 1].sort_order
      : 0;
    while (tabIdx < tabCount) {
      await onAddTab(lastSort + tabIdx + 2);
      tabIdx++;
    }

    toast.success(`${tabCount} tab dividers auto-inserted`);
  }, [tabSections, sections, documents, tabCount, onAddTab, onDeleteTab]);

  const handleAddTab = useCallback(async () => {
    const maxSort = sections.reduce((max, s) => Math.max(max, s.sort_order), 0);
    await onAddTab(maxSort + 1);
  }, [sections, onAddTab]);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Tab Dividers ({currentTabCount}/{tabCount})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={handleAutoInsert}
          >
            <Wand2 className="h-3 w-3 mr-1" />
            Auto-Insert
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            disabled={!canAddMore}
            onClick={handleAddTab}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Tab
          </Button>
        </div>
      </div>

      {tabSections.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          No tabs placed yet. Use Auto-Insert or add manually.
        </p>
      ) : (
        <div className="space-y-1.5">
          {tabSections.map((tab, idx) => {
            const color = isMultiColor
              ? TAB_COLORS[idx % TAB_COLORS.length]
              : undefined;
            return (
              <div
                key={tab.id}
                className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-1.5"
              >
                {/* Color indicator */}
                <div
                  className="w-3 h-3 rounded-sm shrink-0 border border-border/40"
                  style={{ backgroundColor: color ?? "hsl(var(--muted))" }}
                />
                <span className="text-xs font-medium text-foreground flex-1">
                  Tab {idx + 1}
                </span>

                {/* Position in document */}
                <span className="text-[11px] text-muted-foreground">
                  Position {tab.sort_order}
                </span>

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
