import { Button } from "@/components/ui/button";
import {
  BookOpen,
  FileText,
  Layers,
  ArrowRight,
  Trash2,
} from "lucide-react";

interface SectionActionsProps {
  hasSelectedFile: boolean;
  onAddAs: (type: "front_cover" | "back_cover" | "body" | "insert" | "tab") => void;
  hasSelectedSection: boolean;
  onRemoveSection: () => void;
}

export default function SectionActions({
  hasSelectedFile,
  onAddAs,
  hasSelectedSection,
  onRemoveSection,
}: SectionActionsProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Add Selected File As
      </p>

      <Button
        variant="outline"
        size="sm"
        disabled={!hasSelectedFile}
        onClick={() => onAddAs("front_cover")}
        className="justify-start gap-2"
      >
        <BookOpen className="h-3.5 w-3.5" />
        Front Cover
        <ArrowRight className="h-3 w-3 ml-auto opacity-50" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={!hasSelectedFile}
        onClick={() => onAddAs("body")}
        className="justify-start gap-2"
      >
        <FileText className="h-3.5 w-3.5" />
        Body Pages
        <ArrowRight className="h-3 w-3 ml-auto opacity-50" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={!hasSelectedFile}
        onClick={() => onAddAs("back_cover")}
        className="justify-start gap-2"
      >
        <BookOpen className="h-3.5 w-3.5" />
        Back Cover
        <ArrowRight className="h-3 w-3 ml-auto opacity-50" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={!hasSelectedFile}
        onClick={() => onAddAs("insert")}
        className="justify-start gap-2"
      >
        <Layers className="h-3.5 w-3.5" />
        Insert
        <ArrowRight className="h-3 w-3 ml-auto opacity-50" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={!hasSelectedFile}
        onClick={() => onAddAs("tab")}
        className="justify-start gap-2"
      >
        <Layers className="h-3.5 w-3.5" />
        Tab Divider
        <ArrowRight className="h-3 w-3 ml-auto opacity-50" />
      </Button>

      <div className="border-t border-border my-2" />

      <Button
        variant="ghost"
        size="sm"
        disabled={!hasSelectedSection}
        onClick={onRemoveSection}
        className="justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Remove Section
      </Button>
    </div>
  );
}
