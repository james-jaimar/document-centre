/**
 * QuoteSectionsEditor
 *
 * Multi-section spec editor used by the QuoteSpecBuilder for bound
 * documents, presentations and ring binders. Each row represents a section
 * (cover, body, tab divider, insert sheet) with its own page count, colour
 * and sides. This mirrors what the customer builds in `OrderBuild` and
 * feeds `ItemSpec.sections` so pricing is billed section-by-section.
 */
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type QuoteSectionRole = "cover" | "body" | "tab" | "insert";

export interface QuoteSection {
  id: string;
  role: QuoteSectionRole;
  label: string;
  page_count: number;
  is_color: boolean;
  is_duplex: boolean;
}

const ROLE_LABELS: Record<QuoteSectionRole, string> = {
  cover: "Cover",
  body: "Body",
  tab: "Tab divider",
  insert: "Insert sheet",
};

const ROLE_DEFAULTS: Record<QuoteSectionRole, Partial<QuoteSection>> = {
  cover: { page_count: 2, is_color: true, is_duplex: false },
  body: { page_count: 20, is_color: false, is_duplex: true },
  tab: { page_count: 0, is_color: true, is_duplex: false },
  insert: { page_count: 1, is_color: true, is_duplex: false },
};

interface Props {
  sections: QuoteSection[];
  onChange: (next: QuoteSection[]) => void;
}

let seq = 0;
const nextId = () => `s_${Date.now()}_${++seq}`;

export function makeDefaultSections(): QuoteSection[] {
  return [
    {
      id: nextId(),
      role: "cover",
      label: "Front cover",
      ...(ROLE_DEFAULTS.cover as any),
    } as QuoteSection,
    {
      id: nextId(),
      role: "body",
      label: "Body",
      ...(ROLE_DEFAULTS.body as any),
    } as QuoteSection,
  ];
}

export default function QuoteSectionsEditor({ sections, onChange }: Props) {
  const update = (id: string, patch: Partial<QuoteSection>) =>
    onChange(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const remove = (id: string) => onChange(sections.filter((s) => s.id !== id));

  const add = (role: QuoteSectionRole) => {
    const defaults = ROLE_DEFAULTS[role];
    onChange([
      ...sections,
      {
        id: nextId(),
        role,
        label: ROLE_LABELS[role],
        page_count: defaults.page_count ?? 1,
        is_color: defaults.is_color ?? true,
        is_duplex: defaults.is_duplex ?? false,
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Sections</h3>
          <p className="text-xs text-muted-foreground">
            Add each section of the document. Pricing is billed per section
            so covers, body, tabs and inserts can each carry their own
            colour and sides.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["cover", "body", "tab", "insert"] as QuoteSectionRole[]).map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => add(r)}
            >
              <Plus className="h-3 w-3 mr-1" /> {ROLE_LABELS[r]}
            </Button>
          ))}
        </div>
      </div>

      {sections.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No sections yet — add a Cover and Body to get started.
        </div>
      )}

      {sections.map((s, idx) => (
        <div
          key={s.id}
          className="grid grid-cols-1 md:grid-cols-[110px_1fr_100px_110px_110px_40px] gap-3 items-end rounded-md border p-3"
        >
          <div>
            <Label className="text-xs">Type</Label>
            <Select
              value={s.role}
              onValueChange={(val) =>
                update(s.id, { role: val as QuoteSectionRole })
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as QuoteSectionRole[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Label</Label>
            <Input
              className="h-9"
              value={s.label}
              onChange={(e) => update(s.id, { label: e.target.value })}
              placeholder={ROLE_LABELS[s.role]}
            />
          </div>
          <div>
            <Label className="text-xs">Pages</Label>
            <Input
              className="h-9"
              type="number"
              min={0}
              value={s.page_count}
              onChange={(e) =>
                update(s.id, { page_count: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Colour</Label>
            <div className="h-9 flex items-center gap-2 px-2 rounded-md border bg-background">
              <Switch
                checked={s.is_color}
                onCheckedChange={(v) => update(s.id, { is_color: v })}
              />
              <span className="text-xs">{s.is_color ? "Colour" : "B&W"}</span>
            </div>
          </div>
          <div>
            <Label className="text-xs">Sides</Label>
            <div className="h-9 flex items-center gap-2 px-2 rounded-md border bg-background">
              <Switch
                checked={s.is_duplex}
                onCheckedChange={(v) => update(s.id, { is_duplex: v })}
              />
              <span className="text-xs">{s.is_duplex ? "Duplex" : "Single"}</span>
            </div>
          </div>
          <div className="flex md:justify-end">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => remove(s.id)}
              aria-label={`Remove section ${idx + 1}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
