import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save, Palette, Globe, Loader2, Type, Image, Layout } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function BrandingTab() {
  const { settingsMap, isLoading } = useTenantSettingsMap("branding");
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

  // Import state
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

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

      toast.success("Branding imported! Review and save.");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to import branding");
    } finally {
      setImporting(false);
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
      ]);
      toast.success("Branding settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Import from Website */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Import from Website</CardTitle>
          <CardDescription>Scrape branding assets from an existing website to pre-fill colors, logos, and fonts</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Brand Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Brand Colors</CardTitle>
          <CardDescription>Colors used on the customer-facing storefront and emails</CardDescription>
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
          <CardDescription>Name, tagline, and CTA shown on the landing page</CardDescription>
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
          <CardDescription>Logo and hero image URLs for the landing page</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Logo URL</Label>
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
            {logoUrl && <img src={logoUrl} alt="Logo preview" className="h-10 w-auto mt-2 object-contain rounded border p-1" />}
          </div>
          <div className="space-y-2">
            <Label>Hero Image URL</Label>
            <Input value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)} placeholder="https://..." />
            {heroImageUrl && <img src={heroImageUrl} alt="Hero preview" className="h-20 w-auto mt-2 object-cover rounded border" />}
          </div>
        </CardContent>
      </Card>

      {/* Typography */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Type className="h-5 w-5" /> Typography</CardTitle>
          <CardDescription>Font families for headings and body text</CardDescription>
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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={bulkUpsert.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save Changes
        </Button>
      </div>
    </div>
  );
}
