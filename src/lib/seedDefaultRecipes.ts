import { supabase } from "@/integrations/supabase/client";
import type { ProductRecipe } from "@/hooks/useProductRecipe";

interface SeedResult {
  created: string[]; // family slugs
  skipped: string[];
}

interface PaperRow {
  code: string;
  weight_gsm: number;
  finish: string;
  size: string;
}

interface FinishingRow {
  code: string;
  category: string;
}

/**
 * Build a sensible default recipe for a product family based on its slug.
 * Heuristics map common print-shop families to the relevant rate-card rows.
 */
function deriveRecipe(
  slug: string,
  papers: PaperRow[],
  finishing: FinishingRow[],
): ProductRecipe {
  const s = slug.toLowerCase();

  if (s.includes("photo")) {
    return { engine: "photo_prints" };
  }

  const allPaperCodes = papers.map((p) => p.code);
  const heavy = papers.filter((p) => Number(p.weight_gsm) >= 250).map((p) => p.code);
  const standard = papers.filter((p) => Number(p.weight_gsm) <= 200).map((p) => p.code);
  const silk = papers.filter((p) => /silk|gloss|matte/i.test(p.finish || "")).map((p) => p.code);

  const finCodes = (predicate: (f: FinishingRow) => boolean) =>
    finishing.filter(predicate).map((f) => ({ code: f.code, required: false }));

  // Bound documents / notebooks / manuals
  if (s.includes("bound") || s.includes("notebook") || s.includes("manual") || s.includes("book")) {
    return {
      engine: "click_charges",
      uses_click_charges: true,
      available_papers: standard.length ? standard : allPaperCodes,
      default_paper_code: standard[0] ?? allPaperCodes[0] ?? null,
      finishing: finCodes(
        (f) => /bind|comb|wire|spiral|saddle|stitch|lamin/i.test(f.category) ||
               /bind|comb|wire|spiral|saddle|stitch|lamin/i.test(f.code),
      ),
    };
  }

  // Business cards
  if (s.includes("business-card") || s.includes("business_card")) {
    return {
      engine: "click_charges",
      uses_click_charges: true,
      available_papers: heavy.length ? heavy : allPaperCodes,
      default_paper_code: heavy[0] ?? null,
      finishing: finCodes((f) => /lamin|round|cut/i.test(f.category + " " + f.code)),
    };
  }

  // Brochures
  if (s.includes("brochure")) {
    return {
      engine: "click_charges",
      uses_click_charges: true,
      available_papers: silk.length ? silk : allPaperCodes,
      default_paper_code: silk[0] ?? allPaperCodes[0] ?? null,
      finishing: finCodes((f) => /fold|trim|cut/i.test(f.category + " " + f.code)),
    };
  }

  // Posters / large format
  if (s.includes("poster")) {
    return {
      engine: "click_charges",
      uses_click_charges: true,
      available_papers: allPaperCodes,
      default_paper_code: allPaperCodes[0] ?? null,
      finishing: finCodes((f) => /lamin|trim/i.test(f.category + " " + f.code)),
    };
  }

  // Flyers / loose sheets / letterheads
  if (s.includes("flyer") || s.includes("loose") || s.includes("letterhead") || s.includes("sheet")) {
    return {
      engine: "click_charges",
      uses_click_charges: true,
      available_papers: standard.length ? standard : allPaperCodes,
      default_paper_code: standard[0] ?? allPaperCodes[0] ?? null,
      finishing: finCodes((f) => /trim|cut|lamin/i.test(f.category + " " + f.code)),
    };
  }

  // Default: every paper, no required finishing
  return {
    engine: "click_charges",
    uses_click_charges: true,
    available_papers: allPaperCodes,
    default_paper_code: allPaperCodes[0] ?? null,
    finishing: [],
  };
}

/**
 * Auto-seed product_recipes for every master product family that doesn't
 * already have one. Idempotent.
 */
export async function seedDefaultRecipes(): Promise<SeedResult> {
  // Master papers + finishing
  const { data: papers, error: paperErr } = await supabase
    .from("rate_card_papers" as any)
    .select("code,weight_gsm,finish,size")
    .eq("scope_type", "master")
    .eq("is_active", true);
  if (paperErr) throw paperErr;

  const { data: finishing, error: finErr } = await supabase
    .from("rate_card_finishing" as any)
    .select("code,category")
    .eq("scope_type", "master")
    .eq("is_active", true);
  if (finErr) throw finErr;

  const { data: families, error: famErr } = await supabase
    .from("product_families")
    .select("id,slug")
    .is("tenant_id", null);
  if (famErr) throw famErr;

  const { data: existing, error: recErr } = await supabase
    .from("product_recipes" as any)
    .select("product_family_id");
  if (recErr) throw recErr;

  const existingIds = new Set(
    ((existing ?? []) as { product_family_id: string }[]).map((r) => r.product_family_id),
  );

  const created: string[] = [];
  const skipped: string[] = [];

  for (const f of families ?? []) {
    if (existingIds.has(f.id)) {
      skipped.push(f.slug);
      continue;
    }
    const recipe = deriveRecipe(
      f.slug,
      (papers ?? []) as PaperRow[],
      (finishing ?? []) as FinishingRow[],
    );
    const { error } = await supabase
      .from("product_recipes" as any)
      .insert({ product_family_id: f.id, recipe } as any);
    if (error) {
      console.error("seedDefaultRecipes insert failed", f.slug, error);
      skipped.push(f.slug);
      continue;
    }
    created.push(f.slug);
  }

  return { created, skipped };
}
