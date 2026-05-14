import { useEffect, useState } from "react";
import { Download, FileCog, Layers, Ticket, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProductionArtefacts } from "@/hooks/useProductionArtefacts";
import { useImpositionTemplates } from "@/hooks/useImpositionTemplates";

interface Props {
  jobId: string;
  jobStatus?: string | null;
}

export function ProductionPanel({ jobId, jobStatus }: Props) {
  const {
    artefacts,
    isLoading,
    generating,
    generatePrintReady,
    generateImposition,
    generateJobTicket,
    signedUrl,
  } = useProductionArtefacts(jobId);
  const { data: templates = [] } = useImpositionTemplates({ activeOnly: true });
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Default the picker to the existing job template, otherwise leave null
  // (operator must explicitly pick before imposing).
  useEffect(() => {
    if (artefacts?.imposition_template_id) {
      setSelectedTemplateId(artefacts.imposition_template_id);
    }
  }, [artefacts?.imposition_template_id]);

  const open = async (path: string | null) => {
    if (!path) return;
    setOpeningPath(path);
    try {
      const url = await signedUrl(path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningPath(null);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Production
        </h3>
        {jobStatus && (
          <span className="text-[10px] text-muted-foreground">Job status: {jobStatus}</span>
        )}
      </div>

      <Row
        icon={<FileCog className="h-3.5 w-3.5" />}
        label="Print-ready PDF"
        path={artefacts?.print_ready_pdf_path ?? null}
        loading={isLoading || generating === "print_ready"}
        opening={openingPath === artefacts?.print_ready_pdf_path}
        onGenerate={generatePrintReady}
        onOpen={() => open(artefacts?.print_ready_pdf_path ?? null)}
        generateLabel="Assemble"
      />

      <Separator />

      {/* Imposition picker */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Imposition</span>
        </div>
        <Select value={selectedTemplateId ?? ""} onValueChange={(v) => setSelectedTemplateId(v || null)}>
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue placeholder="Choose output sheet…" />
          </SelectTrigger>
          <SelectContent>
            {templates.length === 0 && (
              <div className="text-[11px] text-muted-foreground px-2 py-1.5">No templates configured</div>
            )}
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-[11px]">
                {t.input_size} → {t.output_size} · {t.n_up}-up{t.has_bleed ? " · bleed" : ""}{t.has_crop_marks ? " · crops" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Row
          icon={<Layers className="h-3.5 w-3.5" />}
          label="Imposed sheet"
          path={artefacts?.imposed_pdf_path ?? null}
          loading={isLoading || generating === "impose"}
          opening={openingPath === artefacts?.imposed_pdf_path}
          onGenerate={() => generateImposition(selectedTemplateId)}
          onOpen={() => open(artefacts?.imposed_pdf_path ?? null)}
          generateLabel="Impose"
          disabledReason={
            !artefacts?.print_ready_pdf_path
              ? "Assemble print-ready first"
              : !selectedTemplate
              ? "Pick a template above"
              : undefined
          }
        />
      </div>

      <Separator />

      <Row
        icon={<Ticket className="h-3.5 w-3.5" />}
        label="Job ticket"
        path={artefacts?.job_ticket_pdf_path ?? null}
        loading={isLoading || generating === "ticket"}
        opening={openingPath === artefacts?.job_ticket_pdf_path}
        onGenerate={generateJobTicket}
        onOpen={() => open(artefacts?.job_ticket_pdf_path ?? null)}
        generateLabel="Print ticket"
      />
    </div>
  );
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  path: string | null;
  loading: boolean;
  opening: boolean;
  generateLabel: string;
  onGenerate: () => void;
  onOpen: () => void;
  disabledReason?: string;
}

function Row({ icon, label, path, loading, opening, generateLabel, onGenerate, onOpen, disabledReason }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <div className="text-xs font-medium">{label}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {path ? path.split("/").pop() : disabledReason ?? "Not generated yet"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {path && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={onOpen}
            disabled={opening}
          >
            {opening ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          </Button>
        )}
        <Button
          variant={path ? "ghost" : "default"}
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={onGenerate}
          disabled={loading || !!disabledReason}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : path ? "Re-generate" : generateLabel}
        </Button>
      </div>
    </div>
  );
}

export default ProductionPanel;
