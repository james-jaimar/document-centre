import {
  BookOpen,
  FileText,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionActionsProps {
  hasSelectedFile: boolean;
  onAddAs: (type: "front_cover" | "back_cover" | "body" | "insert" | "tab") => void;
  hasSelectedSection: boolean;
  onRemoveSection: () => void;
}

const ACTIONS = [
  { type: "front_cover" as const, label: "Front Cover", icon: BookOpen },
  { type: "body" as const, label: "Body Pages", icon: FileText },
  { type: "back_cover" as const, label: "Back Cover", icon: BookOpen },
];

export default function SectionActions({
  hasSelectedFile,
  onAddAs,
  hasSelectedSection,
  onRemoveSection,
}: SectionActionsProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="section-header mb-1">Add Selected File As</p>

      {ACTIONS.map(({ type, label, icon: Icon }) => (
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
