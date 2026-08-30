import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenants } from "@/hooks/useTenants";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import {
  useSaveStorefrontPages,
  useStorefrontPages,
  STOREFRONT_PAGES_DEFAULTS,
  type StorefrontPagesConfig,
} from "@/hooks/useStorefrontPages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ExternalLink, Plus, Trash2, Upload } from "lucide-react";
import { familyImage } from "@/lib/storefront/productImages";
import ProductGalleryManager from "@/components/admin/ProductGalleryManager";


const ICON_CHOICES = ["truck", "shield", "clock", "star", "package", "card"];

const PAGE_LABELS: { key: keyof StorefrontPagesConfig["pages"]; label: string; hint: string }[] = [
  { key: "landing", label: "Landing page", hint: "Ecommerce home instead of the dashboard" },
  { key: "shop", label: "Shop page", hint: "Filterable product grid at /shop" },
  { key: "product", label: "Product pages", hint: "Detail page with price breaks" },
  { key: "editor", label: "Editor entry points", hint: "Design-online CTAs on cards" },
];

async function uploadImage(file: File, tenantId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tenantId}/storefront/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from("tenant-assets")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("tenant-assets").getPublicUrl(path).data.publicUrl;
}

function ImageUploadButton({
  tenantId,
  onUploaded,
  label = "Upload image",
}: {
  tenantId: string;
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            onUploaded(await uploadImage(file, tenantId));
            toast.success("Image uploaded");
          } catch (err: any) {
            toast.error(err.message ?? "Upload failed");
          } finally {
            setBusy(false);
            if (ref.current) ref.current.value = "";
          }
        }}
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        {busy ? "Uploading…" : label}
      </Button>
    </>
  );
}

export default function PlatformStorefrontDetail() {
  const { tenantId = "" } = useParams();
  const { data: tenants } = useTenants();
  const tenant = tenants?.find((t) => t.id === tenantId);
  const { config, isFetched } = useStorefrontPages(tenantId);
  const save = useSaveStorefrontPages(tenantId);
  const { data: families } = useProductFamilies(tenantId);
  const [draft, setDraft] = useState<StorefrontPagesConfig>(STOREFRONT_PAGES_DEFAULTS);

  useEffect(() => {
    if (isFetched) setDraft(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetched, tenantId]);

  const set = <K extends keyof StorefrontPagesConfig>(key: K, value: StorefrontPagesConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = () =>
    save.mutate(draft, {
      onSuccess: () => toast.success("Storefront saved"),
      onError: (e: any) => toast.error(e.message ?? "Could not save"),
    });

  const text = (key: keyof StorefrontPagesConfig, label: string, multiline = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {multiline ? (
        <Textarea
          rows={2}
          value={String(draft[key] ?? "")}
          onChange={(e) => set(key, e.target.value as any)}
        />
      ) : (
        <Input
          value={String(draft[key] ?? "")}
          onChange={(e) => set(key, e.target.value as any)}
        />
      )}
    </div>
  );

  const stringList = (
    key: "trade_benefits" | "footer_items",
    label: string,
    placeholder: string,
  ) => (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {(draft[key] ?? []).map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={item}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...draft[key]];
              next[i] = e.target.value;
              set(key, next);
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove"
            onClick={() => set(key, draft[key].filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => set(key, [...draft[key], ""])}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/platform/storefronts">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> All storefronts
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {tenant?.name ?? "Storefront"}
          </h1>
          <p className="text-sm text-muted-foreground">/t/{tenant?.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          {tenant?.slug && (
            <Button asChild variant="outline">
              <a href={`/t/${tenant.slug}`} target="_blank" rel="noreferrer">
                Preview <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="landing">Landing</TabsTrigger>
          <TabsTrigger value="shop">Shop &amp; product</TabsTrigger>
          <TabsTrigger value="imagery">Imagery</TabsTrigger>
        </TabsList>

        {/* ---------------- Pages ---------------- */}
        <TabsContent value="pages" className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-sm font-semibold">Custom storefront pages</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Master switch. When off, this tenant sees the standard customer portal.
              </p>
            </div>
            <Switch checked={draft.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>

          <div className="rounded-lg border">
            {PAGE_LABELS.map((p) => (
              <div key={p.key} className="flex items-center justify-between border-b p-4 last:border-b-0">
                <div>
                  <Label className="text-sm">{p.label}</Label>
                  <p className="text-xs text-muted-foreground">{p.hint}</p>
                </div>
                <Switch
                  checked={draft.pages[p.key]}
                  disabled={!draft.enabled}
                  onCheckedChange={(v) => set("pages", { ...draft.pages, [p.key]: v })}
                />
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ---------------- Landing ---------------- */}
        <TabsContent value="landing" className="mt-4 space-y-6">
          <section className="space-y-3 rounded-lg border p-4">
            <Label className="text-sm font-semibold">Hero</Label>
            <div className="grid gap-3 md:grid-cols-2">
              {text("hero_eyebrow", "Eyebrow")}
              {text("hero_heading", "Heading")}
              {text("hero_cta_primary", "Primary CTA label")}
              {text("hero_cta_secondary", "Secondary CTA label")}
            </div>
            {text("hero_subcopy", "Sub-copy", true)}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Full-width hero image</Label>
                <p className="text-xs text-muted-foreground">
                  Image spans the whole hero with the copy overlaid. Off = image on the right half.
                </p>
              </div>
              <Switch
                checked={draft.hero_layout === "full"}
                onCheckedChange={(v) => set("hero_layout", v ? "full" : "split")}
              />
            </div>
            <div className="flex items-center gap-3">
              <ImageUploadButton
                tenantId={tenantId}
                label="Upload hero image"
                onUploaded={(url) => set("hero_image_url", url)}
              />
              {draft.hero_image_url && (
                <>
                  <img
                    src={draft.hero_image_url}
                    alt="Hero"
                    className="h-12 w-20 rounded border object-cover"
                  />
                  <Button variant="ghost" size="sm" onClick={() => set("hero_image_url", "")}>
                    Remove
                  </Button>
                </>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <Label className="text-sm font-semibold">Assurance bar</Label>
            {draft.assurance_items.map((item, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[130px_1fr_1fr_40px]">
                <Select
                  value={item.icon}
                  onValueChange={(v) => {
                    const next = [...draft.assurance_items];
                    next[i] = { ...item, icon: v };
                    set("assurance_items", next);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICON_CHOICES.map((ic) => (
                      <SelectItem key={ic} value={ic}>{ic}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={item.title}
                  placeholder="Title"
                  onChange={(e) => {
                    const next = [...draft.assurance_items];
                    next[i] = { ...item, title: e.target.value };
                    set("assurance_items", next);
                  }}
                />
                <Input
                  value={item.subtitle}
                  placeholder="Subtitle"
                  onChange={(e) => {
                    const next = [...draft.assurance_items];
                    next[i] = { ...item, subtitle: e.target.value };
                    set("assurance_items", next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove item"
                  onClick={() =>
                    set("assurance_items", draft.assurance_items.filter((_, j) => j !== i))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                set("assurance_items", [
                  ...draft.assurance_items,
                  { icon: "shield", title: "", subtitle: "" },
                ])
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add item
            </Button>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <Label className="text-sm font-semibold">Product strip</Label>
            <div className="grid gap-3 md:grid-cols-2">
              {text("strip_heading", "Heading")}
              {text("strip_subcopy", "Sub-copy")}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <Label className="text-sm font-semibold">How it works</Label>
            {text("how_it_works_heading", "Heading")}
            {draft.how_it_works.map((step, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[1fr_2fr_40px]">
                <Input
                  value={step.title}
                  placeholder="Step title"
                  onChange={(e) => {
                    const next = [...draft.how_it_works];
                    next[i] = { ...step, title: e.target.value };
                    set("how_it_works", next);
                  }}
                />
                <Input
                  value={step.body}
                  placeholder="Step body"
                  onChange={(e) => {
                    const next = [...draft.how_it_works];
                    next[i] = { ...step, body: e.target.value };
                    set("how_it_works", next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove step"
                  onClick={() => set("how_it_works", draft.how_it_works.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => set("how_it_works", [...draft.how_it_works, { title: "", body: "" }])}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add step
            </Button>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <Label className="text-sm font-semibold">Trade band</Label>
            <div className="grid gap-3 md:grid-cols-2">
              {text("trade_heading", "Heading")}
              {text("trade_cta", "CTA label")}
            </div>
            {text("trade_body", "Body", true)}
            {stringList("trade_benefits", "Benefits", "Volume pricing")}
          </section>
        </TabsContent>

        {/* ---------------- Shop & product ---------------- */}
        <TabsContent value="shop" className="mt-4 space-y-6">
          <section className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
            {text("shop_heading", "Shop heading")}
            {text("shop_subcopy", "Shop sub-copy")}
            {text("pricing_note", "Pricing note")}
            {text("turnaround_note", "Turnaround note")}
            {text("delivery_note", "Delivery line")}
            {text("collect_note", "Collection line")}
          </section>
          <section className="space-y-3 rounded-lg border p-4">
            <Label className="text-sm font-semibold">Footer strip</Label>
            {stringList("footer_items", "Footer items", "Secure checkout")}
            {text("footer_note", "Footer note", true)}
          </section>
        </TabsContent>

        {/* ---------------- Imagery ---------------- */}
        <TabsContent value="imagery" className="mt-4 space-y-3">
          <ProductGalleryManager
            tenantId={tenantId}
            families={(families ?? []) as any}
            images={draft.images}
            onChange={(updater) =>
              setDraft((d) => ({ ...d, images: updater(d.images) }))
            }
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
