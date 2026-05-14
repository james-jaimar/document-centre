import { useEffect, useState } from "react";
import { Download, FileCog, Layers, Ticket, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProductionArtefacts } from "@/hooks/useProductionArtefacts";
import { useTemplatesForProductFamily } from "@/hooks/useImpositionTemplates";

interface Props {
  jobId: string;
  jobStatus?: string | null;
  /** Product family this job belongs to — scopes the imposition picker. */
  productFamilyId?: string | null;
}

export function ProductionPanel({ jobId, jobStatus, productFamilyId }: Props) {
  const {
    artefacts,
    isLoading,
    generating,
    generatePrintReady,
    generateImposition,
    generateJobTicket,
    signedUrl,
  } = useProductionArtefacts(jobId);
  const { data: templates = [], isLoading: loadingTemplates } =
    useTemplatesForProductFamily(productFamilyId);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Default the picker to the existing job template, otherwise the
  // product family's primary template, otherwise null.
  useEffect(() => {
    if (artefacts?.imposition_template_id) {
      setSelectedTemplateId(artefacts.imposition_template_id);
      return;
    }
    if (templates.length > 0) {
      const primary = templates.find((t) => t.is_primary) ?? templates[0];
      setSelectedTemplateId(primary.id);
    }
  }, [artefacts?.imposition_template_id, templates]);

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
  const noTemplatesAssigned = !loadingTemplates && templates.length === 0;

  const describeTemplate = (t: typeof templates[number]) => {
    const kind = (t as any).kind ?? "template_pdf";
    if (kind === "parametric_nup") {
      const grid = `${(t as any).columns ?? "?"}×${(t as any).rows ?? "?"}`;
      const extras = [
        Number((t as any).bleed_mm) > 0 ? "bleed" : null,
        t.has_crop_marks ? "crops" : null,
        Number((t as any).gutter_mm) > 0 ? `${(t as any).gutter_mm}mm gap` : null,
      ].filter(Boolean).join(" · ");
      return `${grid} on ${t.output_size}${extras ? ` · ${extras}` : ""}`;
    }
    if (kind === "parametric_booklet") {
      const creep = Number((t as any).creep_per_sheet_mm) > 0 ? ` · ${(t as any).creep_per_sheet_mm}mm creep` : "";
      return `Booklet on ${t.output_size}${creep}`;
    }
    return `${t.input_size} → ${t.output_size} · ${t.n_up}-up${t.has_bleed ? " · bleed" : ""}${t.has_crop_marks ? " · crops" : ""}`;
  };

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

      {/* Imposition picker — scoped to templates assigned to this product family */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Imposition</span>
        </div>

        {noTemplatesAssigned ? (
          <div className="rounded border border-dashed border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
            No imposition templates configured for this product. Ask an admin to assign one in
            <span className="font-medium"> Platform → Imposition → Assign to products</span>.
          </div>
        ) : (
          <Select value={selectedTemplateId ?? ""} onValueChange={(v) => setSelectedTemplateId(v || null)}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue placeholder={loadingTemplates ? "Loading…" : "Choose output sheet…"} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-[11px]">
                  <span>
                    {t.name}
                    {t.is_primary && <span className="ml-1 text-muted-foreground">· default</span>}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">{describeTemplate(t)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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
              : noTemplatesAssigned
              ? "No templates assigned"
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
