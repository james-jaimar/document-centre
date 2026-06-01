import { useEffect } from "react";
import { useTenantBranding } from "@/hooks/useTenantBranding";

/**
 * Swaps the document title + favicon to the tenant's branding while
 * the component is mounted. Restores the original values on unmount.
 *
 * Used by admin/branch portal layouts so a PostNet user sees
 * "PostNet Print Centre — Admin" with the PostNet favicon instead of
 * the default "Document Centre — Web-to-Print SaaS".
 */
export function useDocumentBranding(
  tenantId: string | null,
  tenantName: string | null,
  suffix: string,
) {
  const { data: branding } = useTenantBranding(tenantId);

  const displayName = branding?.portal_name?.trim() || tenantName?.trim() || "";
  const faviconUrl = branding?.favicon_url?.trim() || "";

  useEffect(() => {
    if (!displayName) return;
    const originalTitle = document.title;
    document.title = suffix ? `${displayName} — ${suffix}` : displayName;
    return () => {
      document.title = originalTitle;
    };
  }, [displayName, suffix]);

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
