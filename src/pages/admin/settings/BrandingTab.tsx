import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Save, Palette, Globe, Loader2, Type, Image, Layout, Eye, EyeOff, Info, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function BrandingTab() {
  const { settingsMap, isLoading } = useTenantSettingsMap("branding");
  const { tenantId } = useTenantContext();
  const bulkUpsert = useBulkUpsertTenantSettings();

  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [portalName, setPortalName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [tagline, setTagline] = useState("");
  const [fontHeading, setFontHeading] = useState("");
  const [fontBody, setFontBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [landingLayout, setLandingLayout] = useState("hero_centered");
  const [originUrl, setOriginUrl] = useState("");

  // Import state
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  // Reference scrape state (kept for admin convenience, not rendered live)
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [showHeaderSource, setShowHeaderSource] = useState(false);
  const [showFooterSource, setShowFooterSource] = useState(false);
  const [scrapingFacsimile, setScrapingFacsimile] = useState(false);
  const [scrapeStats, setScrapeStats] = useState<{
    header_length: number;
    footer_length: number;
    external_css_count: number;
  } | null>(null);

  useEffect(() => {
    if (!isLoading && settingsMap) {
      setPrimaryColor((settingsMap.primary_color as string) ?? "#1a1a2e");
      setSecondaryColor((settingsMap.secondary_color as string) ?? "#16213e");
      setAccentColor((settingsMap.accent_color as string) ?? "#0f3460");
      setPortalName((settingsMap.portal_name as string) ?? "");
      setLogoUrl((settingsMap.logo_url as string) ?? "");
      setHeroImageUrl((settingsMap.hero_image_url as string) ?? "");
      setTagline((settingsMap.tagline as string) ?? "");
      setFontHeading((settingsMap.font_heading as string) ?? "");
      setFontBody((settingsMap.font_body as string) ?? "");
      setCtaText((settingsMap.cta_text as string) ?? "");
      setLandingLayout((settingsMap.landing_layout as string) ?? "hero_centered");
      setOriginUrl((settingsMap.origin_url as string) ?? "");
      setHeaderHtml((settingsMap.header_html as string) ?? "");
      setFooterHtml((settingsMap.footer_html as string) ?? "");
    }
  }, [isLoading, settingsMap]);

  const handleImport = async () => {
    if (!importUrl) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-branding", {
        body: { url: importUrl },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Scrape failed");

      const b = data.branding;
      if (b?.colors) {
        if (b.colors.primary) setPrimaryColor(b.colors.primary);
        if (b.colors.secondary) setSecondaryColor(b.colors.secondary);
        if (b.colors.accent) setAccentColor(b.colors.accent);
      }
      if (b?.logo) setLogoUrl(b.logo);
      if (b?.typography?.fontFamilies?.heading) setFontHeading(b.typography.fontFamilies.heading);
      if (b?.typography?.fontFamilies?.primary) setFontBody(b.typography.fontFamilies.primary);
      if (data.title) setPortalName(data.title);
      if (data.description) setTagline(data.description);
      if (!originUrl) setOriginUrl(importUrl);

      toast.success("Branding imported! Review and save.");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to import branding");
    } finally {
      setImporting(false);
    }
  };

  const handleScrapeFacsimile = async () => {
    const scrapeUrl = originUrl || importUrl;
    if (!scrapeUrl) {
      toast.error("Enter the tenant's website URL first");
      return;
    }
    setScrapingFacsimile(true);
    setScrapeStats(null);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-branding", {
        body: { url: scrapeUrl, mode: "facsimile" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Scrape failed");

      const f = data.facsimile;
      if (f) {
        if (f.header_html) setHeaderHtml(f.header_html);
        if (f.footer_html) setFooterHtml(f.footer_html);
        if (!originUrl) setOriginUrl(scrapeUrl);
        setScrapeStats({
          header_length: f.header_length ?? 0,
          footer_length: f.footer_length ?? 0,
          external_css_count: f.external_css_count ?? 0,
        });
        toast.success("Header & footer scraped for reference.");
      } else {
        toast.error("Could not extract header/footer from the page");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to scrape header/footer");
    } finally {
      setScrapingFacsimile(false);
    }
  };

  const handleSave = async () => {
    try {
      await bulkUpsert.mutateAsync([
        { category: "branding", setting_key: "primary_color", setting_value: primaryColor, value_type: "string" },
        { category: "branding", setting_key: "secondary_color", setting_value: secondaryColor, value_type: "string" },
        { category: "branding", setting_key: "accent_color", setting_value: accentColor, value_type: "string" },
        { category: "branding", setting_key: "portal_name", setting_value: portalName, value_type: "string" },
        { category: "branding", setting_key: "logo_url", setting_value: logoUrl, value_type: "string" },
        { category: "branding", setting_key: "hero_image_url", setting_value: heroImageUrl, value_type: "string" },
        { category: "branding", setting_key: "tagline", setting_value: tagline, value_type: "string" },
        { category: "branding", setting_key: "font_heading", setting_value: fontHeading, value_type: "string" },
        { category: "branding", setting_key: "font_body", setting_value: fontBody, value_type: "string" },
        { category: "branding", setting_key: "cta_text", setting_value: ctaText, value_type: "string" },
        { category: "branding", setting_key: "landing_layout", setting_value: landingLayout, value_type: "string" },
        { category: "branding", setting_key: "origin_url", setting_value: originUrl, value_type: "string" },
        // Store scraped HTML for reference (not rendered live on customer pages)
        { category: "branding", setting_key: "header_html", setting_value: headerHtml, value_type: "string" },
        { category: "branding", setting_key: "footer_html", setting_value: footerHtml, value_type: "string" },
        // Disable facsimile rendering — branding is now applied via controlled components
        { category: "branding", setting_key: "facsimile_enabled", setting_value: false, value_type: "boolean" },
      ]);
      toast.success("Branding settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* How branding works */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-5">
          <div className="flex gap-3 items-start">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-900 space-y-1">
              <p className="font-medium">How tenant branding works</p>
              <p className="text-blue-700">
                Your brand settings (logo, colours, name, fonts) are applied to the Document Centre print portal.
                The ordering UI and layout remain consistent — branding customises the header, sidebar, footer, and accent colours.
                Customers get a seamless branded experience without arbitrary CSS overwriting the page.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import from Website */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Import from Website</CardTitle>
          <CardDescription>Scrape branding assets from an existing website to pre-fill colors, logos, and fonts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 max-w-xl">
            <Input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://example.co.za"
              type="url"
            />
            <Button onClick={handleImport} disabled={importing || !importUrl} variant="secondary">
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
              {importing ? "Scraping..." : "Import"}
            </Button>
          </div>

          {/* Origin URL — "Back to site" link */}
          <div className="space-y-2 max-w-xl">
            <Label>Tenant Website URL</Label>
            <Input
              value={originUrl}
              onChange={(e) => setOriginUrl(e.target.value)}
              placeholder="https://www.postnet.co.za"
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              Shown as a "Back to site" link in the customer portal header.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Brand Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Brand Colors</CardTitle>
          <CardDescription>Applied to the portal header, sidebar, buttons, and accents</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          {[
            { label: "Primary Color", value: primaryColor, set: setPrimaryColor },
            { label: "Secondary Color", value: secondaryColor, set: setSecondaryColor },
            { label: "Accent Color", value: accentColor, set: setAccentColor },
          ].map(({ label, value, set }) => (
            <div key={label} className="space-y-2">
              <Label>{label}</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={value} onChange={(e) => set(e.target.value)} className="h-10 w-10 cursor-pointer rounded border border-input" />
                <Input value={value} onChange={(e) => set(e.target.value)} className="font-mono" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Type className="h-5 w-5" /> Identity</CardTitle>
          <CardDescription>Name, tagline, and CTA shown on the portal and landing page</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Portal Name</Label>
            <Input value={portalName} onChange={(e) => setPortalName(e.target.value)} placeholder="e.g. My Print Shop" />
          </div>
          <div className="space-y-2">
            <Label>Tagline</Label>
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Professional printing, delivered." />
          </div>
          <div className="space-y-2">
            <Label>CTA Button Text</Label>
            <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Start Printing" />
          </div>
        </CardContent>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Image className="h-5 w-5" /> Images</CardTitle>
          <CardDescription>Logo and hero image for the portal header and landing page. Upload a file or paste a URL.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <ImageUploadField
            label="Logo"
            value={logoUrl}
            onChange={setLogoUrl}
            tenantId={tenantId}
            fileKey="logo"
            previewClass="h-12 w-auto object-contain"
          />
          <ImageUploadField
            label="Hero Image"
            value={heroImageUrl}
            onChange={setHeroImageUrl}
            tenantId={tenantId}
            fileKey="hero"
            previewClass="h-20 w-auto object-cover"
          />
        </CardContent>
      </Card>

      {/* Typography */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Type className="h-5 w-5" /> Typography</CardTitle>
          <CardDescription>Font families for headings and body text in the portal</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Heading Font</Label>
            <Input value={fontHeading} onChange={(e) => setFontHeading(e.target.value)} placeholder="e.g. Inter, Roboto" />
          </div>
          <div className="space-y-2">
            <Label>Body Font</Label>
            <Input value={fontBody} onChange={(e) => setFontBody(e.target.value)} placeholder="e.g. Inter, Open Sans" />
          </div>
        </CardContent>
      </Card>

      {/* Layout */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Layout className="h-5 w-5" /> Landing Page Layout</CardTitle>
          <CardDescription>Choose a template for the public storefront landing page</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md">
          <Select value={landingLayout} onValueChange={setLandingLayout}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hero_centered">Centered Hero</SelectItem>
              <SelectItem value="hero_split">Split Hero</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Reference: Scraped Header/Footer (not rendered live) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground"><Globe className="h-5 w-5" /> Reference: Website Header & Footer</CardTitle>
          <CardDescription>
            Scrape the tenant's website header/footer for reference. This HTML is stored but <strong>not rendered live</strong> on customer pages — branding is applied through the controlled portal components above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleScrapeFacsimile} disabled={scrapingFacsimile || (!originUrl && !importUrl)} variant="outline" size="sm">
            {scrapingFacsimile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
            {scrapingFacsimile ? "Scraping..." : "Scrape for Reference"}
          </Button>

          {scrapeStats && (
            <div className="rounded-md border border-muted px-4 py-3 text-sm text-muted-foreground">
              <p>Header: {scrapeStats.header_length.toLocaleString()} chars · Footer: {scrapeStats.footer_length.toLocaleString()} chars · {scrapeStats.external_css_count} stylesheets</p>
            </div>
          )}

          {headerHtml && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">Header HTML (reference only)</Label>
                <Button variant="ghost" size="sm" onClick={() => setShowHeaderSource(!showHeaderSource)} className="gap-1 text-xs">
                  {showHeaderSource ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showHeaderSource ? "Hide" : "Show source"}
                </Button>
              </div>
              {showHeaderSource && (
                <Textarea
                  value={headerHtml}
                  onChange={(e) => setHeaderHtml(e.target.value)}
                  className="font-mono text-xs min-h-[100px]"
                />
              )}
            </div>
          )}

          {footerHtml && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">Footer HTML (reference only)</Label>
                <Button variant="ghost" size="sm" onClick={() => setShowFooterSource(!showFooterSource)} className="gap-1 text-xs">
                  {showFooterSource ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showFooterSource ? "Hide" : "Show source"}
                </Button>
              </div>
              {showFooterSource && (
                <Textarea
                  value={footerHtml}
                  onChange={(e) => setFooterHtml(e.target.value)}
                  className="font-mono text-xs min-h-[100px]"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={bulkUpsert.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save Changes
        </Button>
      </div>
    </div>
  );
}
