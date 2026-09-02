import { useEffect } from "react";
import { useTenantBranding } from "@/hooks/useTenantBranding";

/**
 * Swaps the document title, meta description, social tags and favicon to the
 * tenant's branding while the component is mounted. Restores the original
 * values on unmount.
 *
 * Used by customer/admin/branch layouts so a PostNet user sees
 * "PostNet Print Centre" with the PostNet favicon instead of
 * the default "Document Centre — Web-to-Print SaaS".
 */
function setMeta(selector: string, content: string): (() => void) | null {
  const el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) return null;
  const original = el.content;
  el.content = content;
  return () => {
    el.content = original;
  };
}

export function useDocumentBranding(
  tenantId: string | null,
  tenantName: string | null,
  suffix: string,
) {
  const { data: branding } = useTenantBranding(tenantId);

  const baseTitle =
    branding?.browser_title?.trim() ||
    branding?.portal_name?.trim() ||
    tenantName?.trim() ||
    "";
  const description =
    branding?.meta_description?.trim() || branding?.tagline?.trim() || "";
  const faviconUrl = branding?.favicon_url?.trim() || "";

  useEffect(() => {
    if (!baseTitle) return;
    const title = suffix ? `${baseTitle} — ${suffix}` : baseTitle;
    const originalTitle = document.title;
    document.title = title;

    const restorers = [
      setMeta('meta[property="og:title"]', title),
      setMeta('meta[name="twitter:title"]', title),
    ];

    return () => {
      document.title = originalTitle;
      restorers.forEach((r) => r?.());
    };
  }, [baseTitle, suffix]);

  useEffect(() => {
    if (!description) return;
    const restorers = [
      setMeta('meta[name="description"]', description),
      setMeta('meta[property="og:description"]', description),
      setMeta('meta[name="twitter:description"]', description),
    ];
    return () => restorers.forEach((r) => r?.());
  }, [description]);

  useEffect(() => {
    if (!faviconUrl) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    const original = link.href;
    link.href = faviconUrl;
    return () => {
      link.href = original;
    };
  }, [faviconUrl]);
}
