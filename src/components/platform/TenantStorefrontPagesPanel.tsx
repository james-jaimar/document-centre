import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  useSaveStorefrontPages,
  useStorefrontPages,
  STOREFRONT_PAGES_DEFAULTS,
  type StorefrontPagesConfig,
} from "@/hooks/useStorefrontPages";

const PAGE_LABELS: { key: keyof StorefrontPagesConfig["pages"]; label: string; hint: string }[] = [
  { key: "landing", label: "Landing page", hint: "Ecommerce home page instead of the dashboard" },
  { key: "shop", label: "Shop page", hint: "Filterable product grid at /shop" },
  { key: "product", label: "Product pages", hint: "Detail page with price breaks" },
  { key: "editor", label: "Editor entry points", hint: "Design-online CTAs on cards" },
];

export default function TenantStorefrontPagesPanel({ tenantId }: { tenantId: string }) {
  const { config, isFetched } = useStorefrontPages(tenantId);
  const save = useSaveStorefrontPages(tenantId);
  const [draft, setDraft] = useState<StorefrontPagesConfig>(STOREFRONT_PAGES_DEFAULTS);

  useEffect(() => {
    if (isFetched) setDraft(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetched, tenantId]);

  const set = <K extends keyof StorefrontPagesConfig>(key: K, value: StorefrontPagesConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = () =>
    save.mutate(draft, {
      onSuccess: () => toast.success("Storefront pages saved"),
      onError: (e: any) => toast.error(e.message ?? "Could not save"),
    });

  const text = (
    key: keyof StorefrontPagesConfig,
    label: string,
    multiline = false,
  ) => (
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

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-semibold">Custom storefront pages</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Platform-admin only. Turns on the ecommerce landing, shop and product pages for this
            tenant's customer portal.
          </p>
        </div>
        <Switch checked={draft.enabled} onCheckedChange={(v) => set("enabled", v)} />
      </div>

      {draft.enabled && (
        <>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            {PAGE_LABELS.map(({ key, label, hint }) => (
              <div key={key} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <Switch
                  checked={draft.pages[key]}
                  onCheckedChange={(v) => set("pages", { ...draft.pages, [key]: v })}
                />
              </div>
            ))}
          </div>

          <Accordion type="multiple">
            <AccordionItem value="hero">
              <AccordionTrigger className="text-sm">Hero copy</AccordionTrigger>
              <AccordionContent className="space-y-3">
                {text("hero_eyebrow", "Eyebrow")}
                {text("hero_heading", "Heading")}
                {text("hero_subcopy", "Sub-copy", true)}
                <div className="grid gap-3 sm:grid-cols-2">
                  {text("hero_cta_primary", "Primary button")}
                  {text("hero_cta_secondary", "Secondary button")}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="assurance">
              <AccordionTrigger className="text-sm">Assurance strip</AccordionTrigger>
              <AccordionContent className="space-y-3">
                {draft.assurance_items.map((item, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-3">
                    <Input
                      value={item.icon}
                      placeholder="icon (truck, shield, clock, star, package, card)"
                      onChange={(e) => {
                        const next = [...draft.assurance_items];
                        next[i] = { ...item, icon: e.target.value };
                        set("assurance_items", next);
                      }}
                    />
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
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="how">
              <AccordionTrigger className="text-sm">How it works</AccordionTrigger>
              <AccordionContent className="space-y-3">
                {text("how_it_works_heading", "Section heading")}
                {draft.how_it_works.map((step, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-2">
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
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="trade">
              <AccordionTrigger className="text-sm">Trade band & footer</AccordionTrigger>
              <AccordionContent className="space-y-3">
                {text("trade_heading", "Heading")}
                {text("trade_body", "Body", true)}
                {text("trade_cta", "Button label")}
                {text("footer_note", "Footer note")}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save storefront pages"}
        </Button>
      </div>
    </div>
  );
}
