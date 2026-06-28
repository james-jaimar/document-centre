import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformLegalDoc {
  slug: string;
  title: string;
  published_version: number;
  published_html: string | null;
  published_at: string | null;
  effective_date: string | null;
  draft_html: string | null;
  draft_updated_at: string | null;
  draft_updated_by: string | null;
  updated_at: string;
}

export interface PlatformLegalVersion {
  id: string;
  slug: string;
  version: number;
  html: string;
  effective_date: string | null;
  published_at: string;
  published_by: string | null;
}

export function usePlatformLegalDocuments() {
  return useQuery({
    queryKey: ["platform-legal-docs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_legal_documents")
        .select("*")
        .order("title");
      if (error) throw error;
      return (data ?? []) as PlatformLegalDoc[];
    },
  });
}

export function usePlatformLegalDocument(slug: string | undefined) {
  return useQuery({
    queryKey: ["platform-legal-doc", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_legal_documents")
        .select("*")
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw error;
      return data as PlatformLegalDoc | null;
    },
  });
}

export function usePlatformLegalVersions(slug: string | undefined) {
  return useQuery({
    queryKey: ["platform-legal-versions", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_legal_versions")
        .select("*")
        .eq("slug", slug!)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlatformLegalVersion[];
    },
  });
}

export function useSaveLegalDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, draft_html }: { slug: string; draft_html: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("platform_legal_documents")
        .update({
          draft_html,
          draft_updated_at: new Date().toISOString(),
          draft_updated_by: u.user?.id ?? null,
        })
        .eq("slug", slug);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["platform-legal-doc", v.slug] });
      qc.invalidateQueries({ queryKey: ["platform-legal-docs"] });
    },
  });
}

export function usePublishLegalVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      slug,
      html,
      effective_date,
      current_version,
    }: {
      slug: string;
      html: string;
      effective_date: string;
      current_version: number;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id ?? null;
      const nextVersion = current_version + 1;
      const now = new Date().toISOString();

      // Insert the version-history row first; UNIQUE(slug, version) blocks races.
      const { error: vErr } = await supabase
        .from("platform_legal_versions")
        .insert({
          slug,
          version: nextVersion,
          html,
          effective_date,
          published_by: userId,
        });
      if (vErr) throw vErr;

      const { error: dErr } = await supabase
        .from("platform_legal_documents")
        .update({
          published_version: nextVersion,
          published_html: html,
          published_at: now,
          published_by: userId,
          effective_date,
          draft_html: null,
          draft_updated_at: null,
          draft_updated_by: null,
        })
        .eq("slug", slug);
      if (dErr) throw dErr;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["platform-legal-doc", v.slug] });
      qc.invalidateQueries({ queryKey: ["platform-legal-doc-public", v.slug] });
      qc.invalidateQueries({ queryKey: ["platform-legal-docs"] });
      qc.invalidateQueries({ queryKey: ["platform-legal-versions", v.slug] });
    },
  });
}
