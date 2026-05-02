import {
  BookOpen,
  FileText,
  ArrowRight,
  Trash2,
  Layers,
  Image,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SectionType = "front_cover" | "back_cover" | "body" | "outside" | "inside" | "front" | "back" | "print_sheet";

interface SectionActionsProps {
  hasSelectedFile: boolean;
  onAddAs: (type: SectionType) => void;
  hasSelectedSection: boolean;
  onRemoveSection: () => void;
  familySlug?: string | null;
  selectedFilePageCount?: number;
  onAutoAssignBrochure?: () => void;
  onAutoAssignPanels?: () => void;
  onAutoAssignFlyer?: () => void;
}

interface ActionDef {
  type: SectionType;
  label: string;
  icon: typeof BookOpen;
}

const BOUND_ACTIONS: ActionDef[] = [
  { type: "front_cover", label: "Front Cover", icon: BookOpen },
  { type: "body", label: "Body Pages", icon: FileText },
  { type: "back_cover", label: "Back Cover", icon: BookOpen },
];

// Ring binders use a slip-in cover sheet (single side, sits in front PVC pocket).
// No back cover — the binder itself provides the rear panel.
const RING_BINDER_ACTIONS: ActionDef[] = [
  { type: "front_cover", label: "Cover Sheet", icon: BookOpen },
  { type: "body", label: "Body Pages", icon: FileText },
];

const BROCHURE_ACTIONS: ActionDef[] = [
  { type: "front_cover", label: "Outside (front of sheet)", icon: Layers },
  { type: "back_cover", label: "Inside (back of sheet)", icon: Layers },
];

const FLYER_ACTIONS: ActionDef[] = [
  { type: "front_cover", label: "Front", icon: Image },
  { type: "back_cover", label: "Back (optional)", icon: Image },
];

const POSTER_ACTIONS: ActionDef[] = [
  { type: "front_cover", label: "Add as Print", icon: Image },
];

const BOUND_SLUGS = new Set([
  "bound_documents",
  "presentations",
  "ring_binders",
  "booklets",
  "stapled_loose",
]);

function getActions(familySlug?: string | null): ActionDef[] {
  if (!familySlug) return BOUND_ACTIONS;
  if (familySlug === "brochures") return BROCHURE_ACTIONS;
  if (familySlug === "flyers") return FLYER_ACTIONS;
  if (familySlug === "posters") return POSTER_ACTIONS;
  if (familySlug === "ring_binders" || familySlug === "ring-binders") return RING_BINDER_ACTIONS;
  if (BOUND_SLUGS.has(familySlug)) return BOUND_ACTIONS;
  return BOUND_ACTIONS;
}

export default function SectionActions({
  hasSelectedFile,
  onAddAs,
  hasSelectedSection,
  onRemoveSection,
  familySlug,
  selectedFilePageCount,
  onAutoAssignBrochure,
  onAutoAssignPanels,
  onAutoAssignFlyer,
}: SectionActionsProps) {
  const actions = getActions(familySlug);
  const showAutoAssign =
    hasSelectedFile &&
    familySlug === "brochures" &&
    (selectedFilePageCount ?? 0) >= 2 &&
    (selectedFilePageCount ?? 0) < 4 &&
    !!onAutoAssignBrochure;

  const pc = selectedFilePageCount ?? 0;
  const showPanelAssign =
    hasSelectedFile &&
    familySlug === "brochures" &&
    (pc === 4 || pc === 6) &&
    !!onAutoAssignPanels;

  const showFlyerAutoAssign =
    hasSelectedFile &&
    familySlug === "flyers" &&
    (selectedFilePageCount ?? 0) >= 2 &&
    !!onAutoAssignFlyer;

  const showBrochureHint =
    hasSelectedFile &&
    familySlug === "brochures" &&
    (selectedFilePageCount ?? 0) === 1;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="section-header mb-1">Add Selected File As</p>

      {showBrochureHint && (
        <p className="text-xs text-muted-foreground px-3 pb-1">
          Assign this image as the Outside or Inside of your brochure.
        </p>
      )}

      {showAutoAssign && (
        <>
          <button
            onClick={onAutoAssignBrochure}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium transition-all text-left bg-primary/10 text-primary hover:bg-primary/20"
          >
            <Wand2 className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">Auto-assign Outside + Inside</span>
            <ArrowRight className="h-3 w-3 opacity-40" />
          </button>
          <div className="border-t border-border/40 my-1" />
        </>
      )}

      {showPanelAssign && (
        <>
          <button
            onClick={onAutoAssignPanels}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium transition-all text-left bg-primary/10 text-primary hover:bg-primary/20"
          >
            <Wand2 className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">Auto-assign panels ({selectedFilePageCount}-page layout)</span>
            <ArrowRight className="h-3 w-3 opacity-40" />
          </button>
          <div className="border-t border-border/40 my-1" />
        </>
      )}

      {actions.map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          disabled={!hasSelectedFile}
          onClick={() => onAddAs(type)}
          className={cn(
            "flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium transition-all text-left",
            hasSelectedFile
              ? "text-foreground hover:bg-primary/10 hover:text-primary"
              : "text-muted-foreground/50 cursor-not-allowed"
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{label}</span>
          <ArrowRight className="h-3 w-3 opacity-40" />
        </button>
      ))}

      <div className="border-t border-border/60 my-2" />

      <button
        disabled={!hasSelectedSection}
        onClick={onRemoveSection}
        className={cn(
          "flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium transition-all text-left",
          hasSelectedSection
            ? "text-destructive hover:bg-destructive/10"
            : "text-muted-foreground/50 cursor-not-allowed"
        )}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">Remove Section</span>
      </button>
    </div>
  );
}