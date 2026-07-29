import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";
import { useCreateOrder, useUpdateOrderItemSpec, useOrderData } from "@/hooks/useOrderBuilder";
import { useAddItemToCart } from "@/hooks/useCart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ImagePlus, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {
  CANVAS_PRESETS,
  DEFAULT_BLEED_MM,
  DEFAULT_DPI,
  DEFAULT_WRAP_MM,
  WRAP_DEPTH_PRESETS_MM,
  findPreset,
} from "@/lib/canvasPrints/presets";
import type { CanvasTransformState, WrapMode } from "@/lib/canvasPrints/types";
import { WRAP_MODE_OPTIONS } from "@/lib/canvasPrints/types";
import { sampleEdgeColourFromImage } from "@/lib/canvasPrints/renderWrap";
import CanvasEditor from "@/components/canvas/CanvasEditor";
import FlatProofPreview from "@/components/canvas/FlatProofPreview";
import AngledPreview from "@/components/canvas/AngledPreview";
import ResolutionBadge from "@/components/canvas/ResolutionBadge";

const CANVAS_FAMILY_SLUG_DEFAULT = "canvas-prints";

type PrintingRulesWithCanvas = {
  allowed_finished_sizes?: string[];
  canvas_wrap_depths_mm?: number[];
  canvas_default_wrap_mm?: number;
};

export default function CanvasPrintsBuilder() {
  const { id: orderIdParam } = useParams<{ id?: string }>();
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const { tenantId } = useTenantContext();
  const { activeBranch } = useBranch();

  const createOrder = useCreateOrder();
  const updateSpec = useUpdateOrderItemSpec();
  const addItemToCart = useAddItemToCart();
  const { order, orderItem } = useOrderData(orderIdParam);

  // ── Look up the canvas-prints product family (kind = canvas_wrap) for
  // the current tenant so admins can configure wrap depth presets per product.
  const { data: family } = useQuery({
    queryKey: ["canvas_family", tenantId],
    queryFn: async () => {
      const query: any = supabase
        .from("product_families")
        .select("*")
        .eq("kind", "canvas_wrap");
      const filtered = tenantId
        ? query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
        : query.is("tenant_id", null);
      const { data, error } = await filtered;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return rows.find((r) => r.tenant_id === tenantId) ?? rows[0] ?? null;
    },
  });

  const familyId: string | null = family?.id ?? null;
  const allowedDepths: number[] = useMemo(() => {
    const rules = (family?.printing_rules ?? {}) as PrintingRulesWithCanvas;
    const arr = Array.isArray(rules.canvas_wrap_depths_mm) && rules.canvas_wrap_depths_mm.length > 0
      ? rules.canvas_wrap_depths_mm.filter((d) => WRAP_DEPTH_PRESETS_MM.includes(d as any))
      : (WRAP_DEPTH_PRESETS_MM as unknown as number[]);
    return arr;
  }, [family]);
  const defaultWrap = useMemo(() => {
    const rules = (family?.printing_rules ?? {}) as PrintingRulesWithCanvas;
    return allowedDepths.includes(rules.canvas_default_wrap_mm ?? DEFAULT_WRAP_MM)
      ? (rules.canvas_default_wrap_mm ?? DEFAULT_WRAP_MM)
      : allowedDepths[0];
  }, [family, allowedDepths]);

  // ── State ────────────────────────────────────────────────────────────────
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [state, setState] = useState<CanvasTransformState>({
    presetId: "sq-600",
    frontWidthMm: 600,
    frontHeightMm: 600,
    wrapMm: DEFAULT_WRAP_MM,
    bleedMm: DEFAULT_BLEED_MM,
    dpi: DEFAULT_DPI,
    wrapMode: "gallery_wrap",
    imageScale: 1,
    imageX: 0,
    imageY: 0,
    imageRotation: 0,
    imageNaturalWidth: 0,
    imageNaturalHeight: 0,
  });

  // Sync wrap when family loads.
  useEffect(() => {
    if (!allowedDepths.includes(state.wrapMm)) {
      setState((s) => ({ ...s, wrapMm: defaultWrap }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultWrap, allowedDepths.join(",")]);

  // Load previously saved spec if returning to an existing order.
  useEffect(() => {
    const spec = (orderItem?.spec ?? null) as any;
    if (spec?.canvas_transform) {
      setState((s) => ({ ...s, ...spec.canvas_transform }));
    }
  }, [orderItem?.id]);

  const patch = (p: Partial<CanvasTransformState>) => setState((s) => ({ ...s, ...p }));

  // ── File handling ────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (f: File) => {
    setImageFile(f);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      setImageEl(img);
      const wrapColorHex = sampleEdgeColourFromImage(img);
      patch({
        imageNaturalWidth: img.naturalWidth,
        imageNaturalHeight: img.naturalHeight,
        wrapColorHex,
        imageScale: 1,
        imageX: 0,
        imageY: 0,
        imageRotation: 0,
      });
    };
    img.src = url;
  };

  // ── Size selection ───────────────────────────────────────────────────────
  const setPreset = (id: string) => {
    const p = findPreset(id);
    if (!p) return;
    patch({ presetId: id, frontWidthMm: p.frontWidthMm, frontHeightMm: p.frontHeightMm });
  };

  // ── Save + continue ──────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  async function handleAddToCart() {
    if (!imageEl || !imageFile) { toast.error("Please upload an image first."); return; }
    if (!familyId) { toast.error("Canvas Prints product isn't configured yet."); return; }
    setSaving(true);
    try {
      let orderId = orderIdParam;
      let itemId = orderItem?.id;
      if (!orderId) {
        const created = await createOrder.mutateAsync({
          productFamilyId: familyId,
          branchId: activeBranch?.id ?? null,
        });
        orderId = created.id;
        // Look up the freshly-created order item.
        const { data: newItem } = await supabase
          .from("order_items")
          .select("id")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        itemId = newItem?.id;
      }
      if (!itemId) throw new Error("Could not locate order item");

      const spec = {
        page_count: 1,
        quantity: 1,
        is_color: true,
        is_duplex: false,
        selected_options: {},
        canvas_transform: state,
        size_slug: state.presetId,
      } as any;

      await updateSpec.mutateAsync({ id: itemId, spec });

      await addItemToCart.mutateAsync({
        orderItemId: itemId,
        draftOrderId: orderId!,
        title: `Canvas Print · ${state.frontWidthMm}×${state.frontHeightMm}mm`,
        unitPrice: 0,
        quantity: 1,
        totalPrice: 0,
        spec,
      });
      toast.success("Added to cart");
      navigate(tenantPath("cart"));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save canvas");
    } finally {
      setSaving(false);
    }
  }

  const currentDepthOptions = allowedDepths;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-2xl font-semibold">Canvas Prints</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* ── Left: controls ────────────────────────────────────────────── */}
        <div className="space-y-5">
          <Card className="p-4 space-y-3">
            <Label className="font-semibold">1. Upload your image</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4 mr-2" />
              {imageFile ? "Replace image" : "Upload image"}
            </Button>
            {imageFile && (
              <p className="text-xs text-muted-foreground truncate">
                {imageFile.name} · {state.imageNaturalWidth} × {state.imageNaturalHeight} px
              </p>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <Label className="font-semibold">2. Canvas size</Label>
            <Select value={state.presetId} onValueChange={setPreset}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANVAS_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          <Card className="p-4 space-y-3">
            <Label className="font-semibold">3. Wrap depth</Label>
            <RadioGroup
              value={String(state.wrapMm)}
              onValueChange={(v) => patch({ wrapMm: Number(v) })}
              className="grid grid-cols-3 gap-2"
            >
              {currentDepthOptions.map((d) => (
                <label
                  key={d}
                  className={`border rounded-md p-2 text-center cursor-pointer text-sm ${state.wrapMm === d ? "border-primary bg-primary/5 font-medium" : "hover:border-primary/50"}`}
                >
                  <RadioGroupItem value={String(d)} className="sr-only" />
                  {d} mm
                </label>
              ))}
            </RadioGroup>
          </Card>

          <Card className="p-4 space-y-3">
            <Label className="font-semibold">4. Wrap style</Label>
            <div className="space-y-2">
              {WRAP_MODE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`block border rounded-md p-2.5 cursor-pointer text-sm transition ${state.wrapMode === opt.value ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      className="accent-primary"
                      checked={state.wrapMode === opt.value}
                      onChange={() => patch({ wrapMode: opt.value as WrapMode })}
                    />
                    <span className="font-medium">{opt.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">{opt.help}</p>
                </label>
              ))}
            </div>
            {state.wrapMode === "colour_wrap" && (
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-xs">Side colour</Label>
                <Input
                  type="color"
                  value={state.wrapColorHex ?? "#ffffff"}
                  onChange={(e) => patch({ wrapColorHex: e.target.value })}
                  className="h-8 w-14 p-1"
                />
                <span className="text-xs text-muted-foreground">Auto-picked from your image edges — override any time.</span>
              </div>
            )}
          </Card>

          {imageEl && <ResolutionBadge state={state} />}

          <Button
            className="w-full"
            size="lg"
            onClick={handleAddToCart}
            disabled={!imageEl || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
            Add to cart
          </Button>
        </div>

        {/* ── Right: previews ──────────────────────────────────────────── */}
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Position your image</h2>
            <CanvasEditor image={imageEl} state={state} onChange={patch} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Production proof</h2>
            <FlatProofPreview image={imageEl} state={state} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">How it will look on the wall</h2>
            <AngledPreview image={imageEl} state={state} />
          </div>
        </div>
      </div>
    </div>
  );
}
