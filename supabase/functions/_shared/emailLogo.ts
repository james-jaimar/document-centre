// Shared helper for picking an email-safe logo URL.
//
// Outlook (and several other clients) do not render SVG <img> in emails.
// Prefer an explicit `email_logo_url` branding setting (raster), then fall
// back to `logo_url` only if it is a raster format. Otherwise return null so
// the caller renders the portal name as text instead of a broken image.
export function pickEmailLogoUrl(
  settings: Record<string, unknown> | null | undefined,
): string | null {
  const isRaster = (u: string) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);
  const emailLogo = typeof settings?.email_logo_url === "string" ? settings!.email_logo_url as string : "";
  if (emailLogo && isRaster(emailLogo)) return emailLogo;
  const main = typeof settings?.logo_url === "string" ? settings!.logo_url as string : "";
  if (main && isRaster(main)) return main;
  return null;
}
