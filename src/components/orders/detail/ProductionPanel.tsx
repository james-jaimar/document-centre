import { useEffect, useState } from "react";
import { Download, FileCog, Layers, Ticket, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useProductionArtefacts } from "@/hooks/useProductionArtefacts";
import { useTemplatesForProductFamily } from "@/hooks/useImpositionTemplates";
import { format } from "date-fns";
import { sizesMatch, type ResolvedJobSize } from "@/lib/orders/jobSize";

interface Props {
  jobId: string;
  jobStatus?: string | null;
  /** Product family this job belongs to — scopes the imposition picker. */
  productFamilyId?: string | null;
  /** Used to build a meaningful download filename. */
  jobNumber?: string | null;
  orderNumber?: string | null;
  /** Finished/trim size of the job, surfaced next to the imposition picker. */
  jobSize?: ResolvedJobSize | null;
}

/** Sanitise a string for use in a download filename. */
function safeFilenamePart(s: string | null | undefined, fallback: string): string {
  const v = (s ?? "").toString().trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return v || fallback;
}

type Tone = "primary" | "success" | "warning";

const TONE_ICON_BG: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
};

export function ProductionPanel({ jobId, jobStatus, productFamilyId, jobNumber, orderNumber, jobSize = null }: Props) {
  const {
    artefacts,
    isLoading,
    generating,
    generatePrintReady,
    generateImposition,
    generateJobTicket,
    retryAutoAssemble,
    signedUrl,
  } = useProductionArtefacts(jobId);
  const { data: templates = [], isLoading: loadingTemplates } =
    useTemplatesForProductFamily(productFamilyId);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Pull the actual job trim size (post-assembly) so we can pick a matching
  // template instead of always defaulting to the primary. Bus card jobs that
  // print 90×55mm should not silently fall back to a 90×50mm sheet.
  const jobTarget = (artefacts?.assembly_report as { target?: { width_mm?: number; height_mm?: number } } | undefined)?.target;
  const jobW = Number(jobTarget?.width_mm) || Number(jobSize?.width_mm) || 0;
  const jobH = Number(jobTarget?.height_mm) || Number(jobSize?.height_mm) || 0;


  useEffect(() => {
    if (artefacts?.imposition_template_id) {
      setSelectedTemplateId(artefacts.imposition_template_id);
      return;
    }
    if (templates.length === 0) return;

    // Try size-matching first (±1mm tolerance, both orientations).
    const TOL = 1.0;
    const matchesSize = (t: typeof templates[number]) => {
      const iw = Number((t as any).input_width_mm) || 0;
      const ih = Number((t as any).input_height_mm) || 0;
      if (!(iw > 0 && ih > 0)) return false;
      const matchPortrait = Math.abs(iw - jobW) <= TOL && Math.abs(ih - jobH) <= TOL;
      const matchLandscape = Math.abs(iw - jobH) <= TOL && Math.abs(ih - jobW) <= TOL;
      return matchPortrait || matchLandscape;
    };

    let chosen: typeof templates[number] | undefined;
    if (jobW > 0 && jobH > 0) {
      // Prefer a primary template that matches; otherwise any matching template.
      chosen = templates.find((t) => t.is_primary && matchesSize(t))
        ?? templates.find(matchesSize);
    }
    if (!chosen) {
      chosen = templates.find((t) => t.is_primary) ?? templates[0];
    }
    setSelectedTemplateId(chosen.id);
  }, [artefacts?.imposition_template_id, templates, jobW, jobH]);

  const filenameFor = (suffix: string): string => {
    const order = safeFilenamePart(orderNumber, "order");
    const job = safeFilenamePart(jobNumber, "job");
    return `${order}-${job}-${suffix}.pdf`;
  };

  const download = async (path: string | null, suffix: string) => {
    if (!path) return;
    setOpeningPath(path);
    try {
      const url = await signedUrl(path);
      if (!url) return;
      const filename = filenameFor(suffix);
      let triggered = false;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          triggered = true;
        }
      } catch {
        // CORS fallback
      }
      if (!triggered) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningPath(null);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const noTemplatesAssigned = !loadingTemplates && templates.length === 0;

  const templateMatchesJob = (t: any) =>
    sizesMatch(jobW, jobH, Number(t?.input_width_mm) || 0, Number(t?.input_height_mm) || 0);

  const selTplW = Number((selectedTemplate as any)?.input_width_mm) || 0;
  const selTplH = Number((selectedTemplate as any)?.input_height_mm) || 0;
  const sizeMismatch =
    !!selectedTemplate && jobW > 0 && jobH > 0 && selTplW > 0 && selTplH > 0 && !templateMatchesJob(selectedTemplate);

  const jobSizeLabel = jobSize?.label
    ?? (jobW > 0 && jobH > 0 ? `${jobW}×${jobH}mm` : null);

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
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Production
        </h3>
        {jobStatus && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Job status
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
              {jobStatus}
            </span>
          </div>
        )}
      </div>

      <div className="p-5 space-y-5">
        {artefacts?.auto_assemble_error && !artefacts?.print_ready_pdf_path && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-foreground">Auto-assemble failed</div>
              <div className="text-[11px] text-muted-foreground truncate" title={artefacts.auto_assemble_error}>
                {artefacts.auto_assemble_error}
              </div>
              {artefacts.auto_assemble_failed_at && (
                <div className="text-[10px] text-muted-foreground">
                  {format(new Date(artefacts.auto_assemble_failed_at), "d MMM HH:mm")}
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 font-bold"
              onClick={() => retryAutoAssemble()}
              disabled={generating === "print_ready"}
            >
              {generating === "print_ready" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Retry"}
            </Button>
          </div>
        )}

        {/* Print-ready */}
        <Row
          tone="primary"
          icon={<FileCog className="h-5 w-5" />}
          label="Print-ready PDF"
          path={artefacts?.print_ready_pdf_path ?? null}
          loading={isLoading || generating === "print_ready"}
          opening={openingPath === artefacts?.print_ready_pdf_path}
          onGenerate={() => generatePrintReady()}
          onOpen={() => download(artefacts?.print_ready_pdf_path ?? null, "print-ready")}
          generateLabel="Assemble"
        />

        {artefacts?.assembly_report && (
          <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 space-y-1">
            {artefacts.assembly_report.reused_source && (
              <div className="text-[11px] text-muted-foreground">Reused uploaded PDF — no work needed.</div>
            )}
            {artefacts.assembly_report.reused_cache && (
              <div className="text-[11px] text-muted-foreground">Served from cache (spec unchanged).</div>
            )}
            {!!artefacts.assembly_report.steps?.length && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Processing chain
                </div>
                <p className="text-[11px] text-foreground/80 font-mono break-all">
                  {artefacts.assembly_report.steps.join(" → ")}
                </p>
              </>
            )}
            {artefacts.assembly_report.warnings?.map((w, i) => (
              <div key={i} className="text-[11px] text-warning">⚠ {w}</div>
            ))}
            {artefacts?.print_ready_pdf_path && (
              <button
                type="button"
                onClick={() => generatePrintReady({ force: true })}
                disabled={generating === "print_ready"}
                className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:underline disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                Force rebuild
              </button>
            )}
          </div>
        )}

        <Separator />

        {/* Imposition setup */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wide">Imposition setup</span>
            </div>
            {jobSizeLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-primary/40 bg-primary/5 px-2 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">Job size</span>
                <span className="text-sm font-extrabold text-primary">{jobSizeLabel}</span>
              </span>
            )}
          </div>

          {noTemplatesAssigned ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              No imposition templates configured for this product. Ask an admin to assign one in
              <span className="font-medium"> Platform → Imposition → Assign to products</span>.
            </div>
          ) : (
            <Select value={selectedTemplateId ?? ""} onValueChange={(v) => setSelectedTemplateId(v || null)}>
              <SelectTrigger className="h-11 text-sm font-semibold bg-muted/40 border-2">
                <SelectValue placeholder={loadingTemplates ? "Loading…" : "Choose output sheet…"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    <span>
                      {t.name}
                      {t.is_primary && <span className="ml-1 text-muted-foreground">· default</span>}
                      {templateMatchesJob(t) && (
                        <span className="ml-1 font-semibold text-success">· matches job size</span>
                      )}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">{describeTemplate(t)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {sizeMismatch && (
            <div className="flex items-start gap-2 rounded-lg border-2 border-warning/50 bg-warning/10 px-3 py-2 text-xs text-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <span>
                <span className="font-bold">Size mismatch.</span> This template expects{" "}
                <span className="font-semibold">{selTplW}×{selTplH}mm</span>, but this job is{" "}
                <span className="font-semibold">{jobSizeLabel}</span>. Double-check before imposing.
              </span>
            </div>
          )}


          <Row
            tone="success"
            icon={<Layers className="h-5 w-5" />}
            label="Imposed sheet"
            path={artefacts?.imposed_pdf_path ?? null}
            loading={isLoading || generating === "impose"}
            opening={openingPath === artefacts?.imposed_pdf_path}
            onGenerate={() => generateImposition(selectedTemplateId)}
            onOpen={() => download(artefacts?.imposed_pdf_path ?? null, "imposed")}
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

        {/* Job ticket */}
        <Row
          tone="warning"
          icon={<Ticket className="h-5 w-5" />}
          label="Job ticket"
          path={artefacts?.job_ticket_pdf_path ?? null}
          loading={isLoading || generating === "ticket"}
          opening={openingPath === artefacts?.job_ticket_pdf_path}
          onGenerate={() => generateJobTicket({ force: !!artefacts?.job_ticket_pdf_path })}
          onOpen={() => download(artefacts?.job_ticket_pdf_path ?? null, "ticket")}
          generateLabel="Print ticket"
        />
      </div>
    </div>
  );
}

interface RowProps {
  tone: Tone;
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

function Row({ tone, icon, label, path, loading, opening, generateLabel, onGenerate, onOpen, disabledReason }: RowProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex gap-3 min-w-0">
        <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${TONE_ICON_BG[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-foreground">{label}</h4>
          <code className="text-[11px] text-muted-foreground block mt-0.5 truncate max-w-[260px]">
            {path ? path.split("/").pop() : disabledReason ?? "Not generated yet"}
          </code>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {path && (
          <Button
            size="sm"
            onClick={onOpen}
            disabled={opening}
            className="h-9 px-4 font-bold shadow-sm"
          >
            {opening ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Download className="h-4 w-4 mr-1.5" />
                Download
              </>
            )}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onGenerate}
          disabled={loading || !!disabledReason}
          className="h-9 px-4 font-bold border-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : path ? "Re-generate" : generateLabel}
        </Button>
      </div>
    </div>
  );
}

export default ProductionPanel;
