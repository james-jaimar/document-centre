// Mirrors the email shell used by supabase/functions/_shared/sendBranchActivation.ts
// so what you see in the admin preview matches what recipients actually get.

export interface PreviewTenantLike {
  name?: string | null;
  slug?: string | null;
  custom_domain?: string | null;
}

export interface PreviewBranchLike {
  name?: string | null;
  email?: string | null;
  trading_name?: string | null;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

/** Substitute {{token}} merge tokens. Leaves unknown tokens visible so editors
 *  can spot typos. Does NOT escape — the email HTML is authored content. */
export function applyMergeTokens(tpl: string, vars: Record<string, string>): string {
  return (tpl ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    vars[k] !== undefined ? vars[k] : `{{${k}}}`
  );
}

/** Sample values used in previews so admins see real copy, not raw tokens. */
export function defaultPreviewVars(
  tenant?: PreviewTenantLike | null,
  branch?: PreviewBranchLike | null,
  portalName?: string | null,
): Record<string, string> {
  const domain = tenant?.custom_domain
    ? `https://${tenant.custom_domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`
    : tenant?.slug ? `https://document-centre.com/t/${tenant.slug}` : "https://example.com";
  const branchName = branch?.name || "PostNet Sandton City";
  const contact = branch?.trading_name || branch?.name || "Alex Smith";
  return {
    branch_name: branchName,
    contact_name: contact,
    tenant_name: tenant?.name ?? "PostNet South Africa",
    portal_name: portalName || tenant?.name || "Document Centre",
    store_url: domain,
    login_email: branch?.email || "owner@example.com",
    action_link: `${domain}/welcome?token=sample`,
    activation_link: `${domain}/activate/sample-slug`,
    is_returning_user: "false",
    existing_branch_count: "0",
  };
}

export interface EmailShellOptions {
  portalName: string;
  primaryColor?: string | null;
  logoUrl?: string | null;
  bodyHtml: string;
}

/** Wraps body HTML in the same branded card shell the sender uses. */
export function renderEmailShell(opts: EmailShellOptions): string {
  const primary = opts.primaryColor || "#1a1a2e";
  const portal = escapeHtml(opts.portalName || "Document Centre");
  const logoBlock = opts.logoUrl
    ? `<img src="${escapeHtml(opts.logoUrl)}" alt="${portal}" style="max-height:48px;margin-bottom:24px;" />`
    : `<div style="font-size:20px;font-weight:600;color:${primary};margin-bottom:24px;">${portal}</div>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.06);"><tr><td>
${logoBlock}
<div style="font-size:15px;line-height:1.6;color:#333;">${opts.bodyHtml}</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
