import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getDownloadUrls } from "@/lib/s3Storage";


export interface ProductionArtefacts {
  print_ready_pdf_path: string | null;
  imposed_pdf_path: string | null;
  job_ticket_pdf_path: string | null;
  imposition_template_id: string | null;
  product_category: string | null;
  assembly_report: AssemblyReport | null;
  print_ready_assembled_at: string | null;
  print_ready_spec_hash: string | null;
  auto_assemble_error: string | null;
  auto_assemble_failed_at: string | null;
  order_id: string | null;
}

export interface AssemblyReport {
  reused_source?: boolean;
  reused_cache?: boolean;
  steps?: string[];
  warnings?: string[];
  source_count?: number;
  target?: {
    width_mm?: number | null;
    height_mm?: number | null;
    orientation?: string | null;
    colour_mode?: string | null;
    print_to_edge?: boolean;
  };
  detected_size_mm?: number[] | null;
}

/**
 * Reads + mutates the three production-PDF paths on `order_jobs`.
 * The actual PDF generation is delegated to the `production-pdf` edge
 * function (assemble / impose / ticket).
 */
export function useProductionArtefacts(jobId: string | null) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [generating, setGenerating] = useState<"print_ready" | "impose" | "ticket" | null>(null);

  const query = useQuery({
    queryKey: ["production-artefacts", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_jobs")
        .select(
          "print_ready_pdf_path, imposed_pdf_path, job_ticket_pdf_path, imposition_template_id, product_category, assembly_report, print_ready_assembled_at, print_ready_spec_hash, auto_assemble_error, auto_assemble_failed_at, order_id",
        )
        .eq("id", jobId!)
        .single();
      if (error) throw error;
      return data as unknown as ProductionArtefacts;
    },
  });

  /** Retry the auto-assemble fan-out for the whole order (clears error on success). */
  const retryAutoAssemble = useCallback(async () => {
    if (!jobId) return;
    const orderId = query.data?.order_id;
    if (!orderId) return;
    setGenerating("print_ready");
    try {
      const { data, error } = await supabase.functions.invoke("enqueue-print-ready", {
        body: { order_id: orderId, force: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Auto-assemble retried", description: "Generating print-ready PDFs and tickets." });
      qc.invalidateQueries({ queryKey: ["production-artefacts", jobId] });
      qc.invalidateQueries({ queryKey: ["production-queue"] });
    } catch (e: any) {
      toast({
        title: "Retry failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  }, [jobId, query.data?.order_id, qc, toast]);

  const generatePrintReady = useCallback(async (opts?: { force?: boolean }) => {
    if (!jobId) return;
    setGenerating("print_ready");
    try {
      const { data, error } = await supabase.functions.invoke("production-pdf", {
        body: { action: "assemble", job_id: jobId, force: !!opts?.force },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Print-ready PDF generated", description: "Available for download below." });
      qc.invalidateQueries({ queryKey: ["production-artefacts", jobId] });
    } catch (e: any) {
      toast({
        title: "Could not generate print-ready PDF",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  }, [jobId, qc, toast]);

  const generateImposition = useCallback(async (impositionTemplateId?: string | null) => {
    if (!jobId) return;
    setGenerating("impose");
    try {
      const { data, error } = await supabase.functions.invoke("production-pdf", {
        body: { action: "impose", job_id: jobId, imposition_template_id: impositionTemplateId ?? null },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Imposed sheet PDF generated" });
      qc.invalidateQueries({ queryKey: ["production-artefacts", jobId] });
    } catch (e: any) {
      toast({
        title: "Could not impose",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  }, [jobId, qc, toast]);

  const generateJobTicket = useCallback(async (opts?: { force?: boolean }) => {
    if (!jobId) return;
    setGenerating("ticket");
    try {
      const { data, error } = await supabase.functions.invoke("production-pdf", {
        body: { action: "ticket", job_id: jobId, force: !!opts?.force },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Job ticket generated" });
      qc.invalidateQueries({ queryKey: ["production-artefacts", jobId] });
    } catch (e: any) {
      toast({
        title: "Could not generate job ticket",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  }, [jobId, qc, toast]);

  /** Sign a storage path (S3) so the operator can download it. */
  const signedUrl = useCallback(async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    try {
      const urls = await getDownloadUrls([path]);
      return urls[path] ?? null;
    } catch (e) {
      console.error("[production-artefacts] sign failed", e);
      return null;
    }
  }, []);


  return {
    artefacts: query.data,
    isLoading: query.isLoading,
    generating,
    generatePrintReady,
    generateImposition,
    generateJobTicket,
    signedUrl,
  };
}
