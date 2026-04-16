export function buildAdminPath(path: string, tenantId?: string | null) {
  if (!tenantId) return path;

  const url = new URL(path, "https://tenant-admin.local");
  url.searchParams.set("tenant", tenantId);

  return `${url.pathname}${url.search}${url.hash}`;
}