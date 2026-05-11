import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useProductRecipe,
  useUpsertProductRecipe,
  EMPTY_RECIPE,
  type ProductRecipe,
} from "@/hooks/useProductRecipe";
import {
  useRateCardPapers,
  useRateCardFinishing,
} from "@/hooks/useRateCard";

interface Props {
  productFamilyId: string;
}

export default function ProductRecipeTab({ productFamilyId }: Props) {
  const { data: existing, isLoading } = useProductRecipe(productFamilyId);
  const { data: papers = [] } = useRateCardPapers({ scope: "master" });
  const { data: finishing = [] } = useRateCardFinishing({ scope: "master" });
  const upsert = useUpsertProductRecipe();

  const [recipe, setRecipe] = useState<ProductRecipe>(EMPTY_RECIPE);

  useEffect(() => {
    setRecipe(existing ?? EMPTY_RECIPE);
  }, [existing]);

  const togglePaper = (code: string, on: boolean) => {
    const set = new Set(recipe.available_papers ?? []);
    if (on) set.add(code);
    else set.delete(code);
    setRecipe({ ...recipe, available_papers: Array.from(set) });
  };

  const toggleFinishing = (code: string, on: boolean) => {
    const list = recipe.finishing ?? [];
    if (on) {
      if (!list.find((f) => f.code === code))
        setRecipe({ ...recipe, finishing: [...list, { code, required: false }] });
    } else {
      setRecipe({ ...recipe, finishing: list.filter((f) => f.code !== code) });
    }
  };

  const setFinishingRequired = (code: string, required: boolean) => {
    setRecipe({
      ...recipe,
      finishing: (recipe.finishing ?? []).map((f) =>
        f.code === code ? { ...f, required } : f
      ),
    });
  };

  const onSave = async () => {
    try {
      await upsert.mutateAsync({ productFamilyId, recipe });
      toast.success("Recipe saved");
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading recipe…
      </div>
    );
  }

  const finishingByCategory = finishing.reduce<Record<string, typeof finishing>>(
    (acc, f) => {
      (acc[f.category] ??= []).push(f);
      return acc;
    },
    {}
  );

  const selectedFinishing = new Set((recipe.finishing ?? []).map((f) => f.code));
  const selectedPapers = new Set(recipe.available_papers ?? []);

  const engine = recipe.engine ?? "click_charges";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pricing engine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={engine}
            onValueChange={(v) =>
              setRecipe({ ...recipe, engine: v as "click_charges" | "photo_prints" })
            }
          >
            <SelectTrigger className="w-full md:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="click_charges">Click charges (printed pages)</SelectItem>
              <SelectItem value="photo_prints">Photo prints (per-print rate card)</SelectItem>
            </SelectContent>
          </Select>
          {engine === "click_charges" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={recipe.uses_click_charges !== false}
                onCheckedChange={(v) =>
                  setRecipe({ ...recipe, uses_click_charges: !!v })
                }
              />
              Charge per printed page (click charges)
            </label>
          )}
          {engine === "photo_prints" && (
            <p className="text-xs text-muted-foreground">
              Pricing is read from the <strong>Photo Prints</strong> tab in Master Pricing.
              Paper &amp; finishing pickers below are not used for this engine.
            </p>
          )}
        </CardContent>
      </Card>

      {engine === "click_charges" && (
        <>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Available papers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {papers.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 text-sm border border-border rounded-md p-2"
              >
                <Checkbox
                  checked={selectedPapers.has(p.code)}
                  onCheckedChange={(v) => togglePaper(p.code, !!v)}
                />
                <span className="flex-1">{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.code}</span>
              </label>
            ))}
            {papers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No paper stocks defined yet — add some in Master Pricing.
              </p>
            )}
          </div>

          {selectedPapers.size > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Default paper</Label>
              <Select
                value={recipe.default_paper_code ?? ""}
                onValueChange={(v) =>
                  setRecipe({ ...recipe, default_paper_code: v || null })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a default…" />
                </SelectTrigger>
                <SelectContent>
                  {(recipe.available_papers ?? []).map((code) => {
                    const p = papers.find((x) => x.code === code);
                    return (
                      <SelectItem key={code} value={code}>
                        {p?.label ?? code}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Finishing options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(finishingByCategory).map(([cat, items]) => (
            <div key={cat} className="space-y-1.5">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {cat}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((f) => {
                  const on = selectedFinishing.has(f.code);
                  const reqd =
                    on &&
                    !!(recipe.finishing ?? []).find((x) => x.code === f.code)
                      ?.required;
                  return (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 text-sm border border-border rounded-md p-2"
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) => toggleFinishing(f.code, !!v)}
                      />
                      <span className="flex-1">{f.label}</span>
                      {on && (
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Checkbox
                            checked={reqd}
                            onCheckedChange={(v) =>
                              setFinishingRequired(f.code, !!v)
                            }
                          />
                          Required
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {finishing.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No finishing items defined yet — add some in Master Pricing.
            </p>
          )}
        </CardContent>
      </Card>
        </>
      )}

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={upsert.isPending}>
          {upsert.isPending ? "Saving…" : "Save recipe"}
        </Button>
      </div>
    </div>
  );
}
