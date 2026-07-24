import { useTenantBranding } from "@/hooks/useTenantBranding";

/**
 * Optional full-width branded band rendered above the standard portal
 * header. Configured per tenant via branding settings (brand_strip_*).
 * Renders nothing unless the tenant has toggled it on and provided at
 * least an image or a background colour.
 */
export default function BrandStrip({ tenantId }: { tenantId: string | null }) {
  const { data: branding } = useTenantBranding(tenantId);
  if (!branding?.brand_strip_enabled) return null;

  const image = branding.brand_strip_image_url?.trim();
  const bg = branding.brand_strip_bg_color?.trim();
  if (!image && !bg) return null;

  const height = branding.brand_strip_height?.trim() || "88px";
  const link = branding.brand_strip_link_url?.trim();

  const style: React.CSSProperties = {
    height,
    backgroundColor: bg || undefined,
    backgroundImage: image ? `url("${image}")` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };

  const className = "w-full shrink-0";

  if (link) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={style}
        aria-label="Brand"
      />
    );
  }

  return <div className={className} style={style} role="presentation" />;
}
