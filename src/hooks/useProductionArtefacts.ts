import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ProductionArtefacts {
  print_ready_pdf_path: string | null;
  imposed_pdf_path: string | null;
  job_ticket_pdf_path: string | null;
  imposition_template_id: string | null;
  product_family_id: string | null;
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
        .select("print_ready_pdf_path, imposed_pdf_path, job_ticket_pdf_path, imposition_template_id, product_family_id")
        .eq("id", jobId!)
        .single();
      if (error) throw error;
      return data as ProductionArtefacts;
    },
  });

  const generatePrintReady = useCallback(async () => {
    if (!jobId) return;
    setGenerating("print_ready");
    try {
      const { data, error } = await supabase.functions.invoke("production-pdf", {
        body: { action: "assemble", job_id: jobId },
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

  const generateJobTicket = useCallback(async () => {
    if (!jobId) return;
    setGenerating("ticket");
    try {
      const { data, error } = await supabase.functions.invoke("production-pdf", {
        body: { action: "ticket", job_id: jobId },
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

  /** Sign a storage path so the operator can download it. */
  const signedUrl = useCallback(async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(path, 60 * 10);
    if (error) {
      console.error("[production-artefacts] sign failed", error);
      return null;
    }
    return data?.signedUrl ?? null;
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
