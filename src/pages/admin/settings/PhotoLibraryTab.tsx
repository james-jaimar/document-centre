import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { PHOTO_LIBRARY_DEFAULTS, PHOTO_LIBRARY_CATEGORY } from "@/hooks/usePhotoLibrarySettings";
import { toast } from "sonner";
import { Save, Images } from "lucide-react";

/**
 * Tenant-level controls for the Pexels photo library shown inside the artwork
 * builders. Every value maps to a `tenant_settings` row in the
 * `photo_library` category (branches can override the same keys).
 */
export function PhotoLibraryTab() {
  const { settingsMap, isLoading } = useTenantSettingsMap(PHOTO_LIBRARY_CATEGORY);
  const bulkUpsert = useBulkUpsertTenantSettings();

  const d = PHOTO_LIBRARY_DEFAULTS;
  const [enabled, setEnabled] = useState(d.enabled);
  const [categories, setCategories] = useState(d.categories.join(", "));
  const [defaultQuery, setDefaultQuery] = useState(d.defaultQuery);
  const [orientationMode, setOrientationMode] = useState<string>(d.orientationMode);
  const [locale, setLocale] = useState(d.locale);
  const [colour, setColour] = useState(d.colour);
  const [size, setSize] = useState<string>(d.size);
  const [perPage, setPerPage] = useState(String(d.perPage));
  const [excellentDpi, setExcellentDpi] = useState(String(d.excellentDpi));
  const [goodDpi, setGoodDpi] = useState(String(d.goodDpi));
  const [hideBelow, setHideBelow] = useState(d.hideBelowMinimum);

  useEffect(() => {
    if (isLoading || !settingsMap) return;
    const m = settingsMap as Record<string, any>;
    if (m.enabled !== undefined) setEnabled(m.enabled !== false);
    if (Array.isArray(m.categories)) setCategories(m.categories.join(", "));
    if (typeof m.default_query === "string") setDefaultQuery(m.default_query);
    if (m.orientation_mode) setOrientationMode(String(m.orientation_mode));
    if (typeof m.locale === "string") setLocale(m.locale);
    if (typeof m.colour === "string") setColour(m.colour);
    if (m.size) setSize(String(m.size));
    if (m.per_page) setPerPage(String(m.per_page));
    if (m.excellent_dpi) setExcellentDpi(String(m.excellent_dpi));
    if (m.good_dpi) setGoodDpi(String(m.good_dpi));
    if (m.hide_below_minimum !== undefined) setHideBelow(m.hide_below_minimum !== false);
  }, [isLoading, settingsMap]);

  const handleSave = async () => {
    const cats = categories
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const excellent = parseInt(excellentDpi, 10);
    const good = parseInt(goodDpi, 10);
    if (!Number.isFinite(excellent) || !Number.isFinite(good) || good > excellent) {
      toast.error("The 'Good' quality level must be lower than the 'Excellent' level");
      return;
    }
    try {
      await bulkUpsert.mutateAsync([
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "enabled", setting_value: enabled, value_type: "boolean" },
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "categories", setting_value: cats, value_type: "json" },
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "default_query", setting_value: defaultQuery.trim(), value_type: "string" },
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "orientation_mode", setting_value: orientationMode, value_type: "string" },
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "locale", setting_value: locale.trim(), value_type: "string" },
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "colour", setting_value: colour.trim(), value_type: "string" },
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "size", setting_value: size, value_type: "string" },
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "per_page", setting_value: Math.min(40, Math.max(8, parseInt(perPage, 10) || 24)), value_type: "number" },
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "excellent_dpi", setting_value: excellent, value_type: "number" },
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "good_dpi", setting_value: good, value_type: "number" },
        { category: PHOTO_LIBRARY_CATEGORY, setting_key: "hide_below_minimum", setting_value: hideBelow, value_type: "boolean" },
      ]);
      toast.success("Photo library settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Images className="h-5 w-5" /> Photo library
          </CardTitle>
          <CardDescription>
            Lets customers choose a free Pexels photo instead of uploading their own artwork.
            Photographers are always credited on the order, as the Pexels licence requires.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-2xl">
          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>Photo library available to customers</Label>
          </div>
          <div className="space-y-2">
            <Label>Quick search buttons</Label>
            <Textarea
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              rows={2}
              placeholder="Landscapes, Wildlife, Cape Town"
            />
            <p className="text-xs text-muted-foreground">
              Comma separated. Shown as one-tap buttons above the search results.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Search shown when the library opens</Label>
            <Input
              value={defaultQuery}
              onChange={(e) => setDefaultQuery(e.target.value)}
              placeholder="Leave blank for Pexels' curated selection"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search options</CardTitle>
          <CardDescription>What the library asks Pexels for</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <div className="space-y-2">
            <Label>Photo shape</Label>
            <Select value={orientationMode} onValueChange={setOrientationMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Match the picture area</SelectItem>
                <SelectItem value="any">Show all shapes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Minimum photo size</Label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="large">Large (best for print)</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="small">Small</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Language / region</Label>
            <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-US" />
            <p className="text-xs text-muted-foreground">Pexels locale code. Blank uses their default.</p>
          </div>
          <div className="space-y-2">
            <Label>Colour filter</Label>
            <Input value={colour} onChange={(e) => setColour(e.target.value)} placeholder="e.g. blue or #4A90E2" />
            <p className="text-xs text-muted-foreground">Blank shows every colour.</p>
          </div>
          <div className="space-y-2">
            <Label>Photos per page</Label>
            <Input type="number" min={8} max={40} value={perPage} onChange={(e) => setPerPage(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Print quality</CardTitle>
          <CardDescription>
            Measured against the real size of the picture area on the artwork.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <div className="space-y-2">
            <Label>"Excellent" from (DPI)</Label>
            <Input type="number" value={excellentDpi} onChange={(e) => setExcellentDpi(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>"Good" from (DPI)</Label>
            <Input type="number" value={goodDpi} onChange={(e) => setGoodDpi(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={hideBelow} onCheckedChange={setHideBelow} />
            <Label>Hide photos that fall below the "Good" level</Label>
          </div>
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
