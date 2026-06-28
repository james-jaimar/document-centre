import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import LegalLayout from "@/pages/legal/LegalLayout";
import { supabase } from "@/integrations/supabase/client";
import { LEGAL_DOCS, type LegalDocSlug } from "@/lib/legal/versions";

interface Props {
  slug: LegalDocSlug;
  Fallback: () => JSX.Element;
}

/**
 * Public legal page that prefers DB-published content from
 * `platform_legal_documents`. Falls back to the hardcoded JSX body
 * (the seed) until an admin publishes a version through Platform
 * → Legal Documents.
 */
export default function LegalDocPage({ slug, Fallback }: Props) {
  const fallbackMeta = LEGAL_DOCS[slug];
  const [params] = useSearchParams();
  const preview = params.get("preview") === "1";

  const { data, isLoading } = useQuery({
    queryKey: ["platform-legal-doc-public", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_legal_documents")
        .select("title, published_version, published_html, draft_html, effective_date")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const html = preview
    ? data?.draft_html || data?.published_html
    : data?.published_html;
  const useDb = !!html && (preview || (data?.published_version ?? 0) > 0);

  const title = data?.title || fallbackMeta.title;
  const effective = data?.effective_date
    ? new Date(data.effective_date).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : fallbackMeta.effective;
  const version = useDb
    ? (preview ? (data?.published_version ?? 0) + 1 : data!.published_version)
    : fallbackMeta.version;

  return (
    <LegalLayout title={title} updated={effective} version={version}>
      {isLoading && !data ? null : useDb ? (
        <div dangerouslySetInnerHTML={{ __html: html! }} />
      ) : (
        <Fallback />
      )}
      {preview && (
        <div className="not-prose mt-8 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-900">
          You are viewing a <strong>draft preview</strong>. Customers see the
          published version (v{data?.published_version ?? 0}) until you publish.
        </div>
      )}
    </LegalLayout>
  );
}

export type { ReactNode };
