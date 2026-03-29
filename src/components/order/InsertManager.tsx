import { useCallback, useMemo, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FileStack } from "lucide-react";

type DocumentSection = Tables<"document_sections">;
type Document = Tables<"documents">;

const INSERT_COLORS = [
  { slug: "white", label: "White", hex: "#f8f8f8" },
  { slug: "yellow", label: "Yellow", hex: "#fef9c3" },
  { slug: "blue", label: "Blue", hex: "#dbeafe" },
  { slug: "green", label: "Green", hex: "#dcfce7" },
  { slug: "pink", label: "Pink", hex: "#fce7f3" },
];

interface InsertManagerProps {
  sections: DocumentSection[];
  documents: Document[];
  orderItemId: string;
  onAddInsert: (sortOrder: number, color: string) => Promise<void>;
  onDeleteInsert: (sectionId: string) => Promise<void>;
  onMoveInsert: (sectionId: string, newSortOrder: number) => Promise<void>;
}

export default function InsertManager({
  sections,
  documents,
  orderItemId,
  onAddInsert,
  onDeleteInsert,
  onMoveInsert,
}: InsertManagerProps) {
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState("white");

  const insertSections = useMemo(
    () => sections.filter((s) => s.section_type === "insert"),
    [sections]
  );

  // Build page positions from non-insert/non-tab sections
  const bodyPages = useMemo(() => {
    const pages: { label: string; sortOrder: number }[] = [];
    let pageNum = 1;
    for (const section of sections) {
      if (section.section_type === "tab" || section.section_type === "insert") continue;
      const doc = documents.find((d) => d.id === section.document_id);
      const count = doc?.page_count ?? 1;
      for (let p = 0; p < count; p++) {
        pages.push({ label: `Page ${pageNum}`, sortOrder: section.sort_order });
        pageNum++;
      }
    }
    return pages;
  }, [sections, documents]);

  const getInsertPageLabel = (ins: DocumentSection) => {
    let label = "Start";
    for (const page of bodyPages) {
      if (page.sortOrder < ins.sort_order) label = page.label;
    }
    return `After ${label}`;
  };

  const handleAddAfterPage = useCallback(async (sortOrder: number) => {
    await onAddInsert(sortOrder + 1, selectedColor);
    setAddPopoverOpen(false);
  }, [onAddInsert, selectedColor]);

  const handleAddAtEnd = useCallback(async () => {
    const maxSort = sections.reduce((max, s) => Math.max(max, s.sort_order), 0);
    await onAddInsert(maxSort + 1, selectedColor);
    setAddPopoverOpen(false);
  }, [sections, onAddInsert, selectedColor]);

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileStack className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">
            Insert Sheets ({insertSections.length})
          </h3>
        </div>
        <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-[11px] h-6 px-2">
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="end">
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Sheet color</p>
            <div className="flex gap-1 mb-2">
              {INSERT_COLORS.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setSelectedColor(c.slug)}
                  className="w-6 h-6 rounded-md border-2 transition-all"
                  style={{
                    backgroundColor: c.hex,
                    borderColor: selectedColor === c.slug ? "hsl(var(--primary))" : "transparent",
                  }}
                  title={c.label}
                />
              ))}
            </div>
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

      {insertSections.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-1.5">
          No insert sheets added yet.
        </p>
      ) : (
        <div className="space-y-1">
          {insertSections.map((ins, idx) => {
            const colorObj = INSERT_COLORS.find((c) => c.slug === (ins as any).color) ?? INSERT_COLORS[0];
            return (
              <div
                key={ins.id}
                className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1"
              >
                <div
                  className="w-3 h-3 rounded-sm shrink-0 border border-border/40"
                  style={{ backgroundColor: colorObj.hex }}
                />
                <span className="text-[11px] font-medium text-foreground flex-1">
                  {colorObj.label} Sheet
                </span>

                <Select
                  value={String(ins.sort_order)}
                  onValueChange={(val) => onMoveInsert(ins.id, Number(val))}
                >
                  <SelectTrigger className="h-5 w-auto min-w-[80px] text-[10px] border-0 bg-transparent px-1">
                    <SelectValue>{getInsertPageLabel(ins)}</SelectValue>
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
                  onClick={() => onDeleteInsert(ins.id)}
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
