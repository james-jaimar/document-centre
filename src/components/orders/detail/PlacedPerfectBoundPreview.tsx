import { useEffect, useState } from "react";
import { Box, BookOpen, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import PerfectBoundBook3D from "@/components/preview/PerfectBoundBook3D";
import PerfectBoundFlatWrap from "@/components/preview/PerfectBoundFlatWrap";
import { useCoverRaster } from "@/hooks/useCoverRaster";
import { getAsset } from "@/lib/documentCentreApi";
import { coverHasRealBleed, type PdfBoxes, type PerfectBoundCover } from "@/lib/perfectBinding/workflow";

type FrozenSource = { asset_id?: string | null; storage_path?: string | null; page: number };
type FrozenFile = { path: string | null; boxes?: PdfBoxes };

/** Resolve a placed order's frozen cover file (asset or stored path) for browser rasterising. */
function useFrozenFile(source?: FrozenSource): FrozenFile {
  const [file, setFile] = useState<FrozenFile>({ path: source?.storage_path ?? null });
  useEffect(() => {
    if (!source?.asset_id) { setFile({ path: source?.storage_path ?? null }); return; }
    let alive = true;
    getAsset(source.asset_id)
      .then((a) => alive && setFile({ path: a.normalized_storage_path || a.source_storage_path, boxes: (a.boxes ?? undefined) as PdfBoxes | undefined }))
      .catch(() => alive && setFile({ path: null }));
    return () => { alive = false; };
  }, [source?.asset_id, source?.storage_path]);
  return file;
}

/** Customer view of a placed perfect-bound book: 3D cover, flat wrap, or the inside pages. */
export default function PlacedPerfectBoundPreview({ cover, insidePages, onClose }: {
  cover: PerfectBoundCover & { front?: FrozenSource; back?: FrozenSource; wrap?: FrozenSource };
  insidePages: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"3d" | "flat">("3d");
  const guided = cover.mode !== "wrap";
  const front = useFrozenFile(guided ? cover.front : undefined);
  const back = useFrozenFile(guided && !cover.back_blank ? cover.back : undefined);
  const wrap = useFrozenFile(guided ? undefined : cover.wrap);
  const frontRaster = useCoverRaster(front.path, cover.front?.page ?? 0, coverHasRealBleed(front.boxes));
  const backRaster = useCoverRaster(back.path, cover.back?.page ?? 0, coverHasRealBleed(back.boxes));
  const wrapRaster = useCoverRaster(wrap.path, cover.wrap?.page ?? 0, false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const props = {
    frontPath: guided ? frontRaster : undefined, backPath: guided ? backRaster : undefined, wrapPath: guided ? undefined : wrapRaster,
    frontPlacement: cover.front?.placement, backPlacement: cover.back?.placement,
    backBlank: guided ? cover.back_blank : undefined, backColor: cover.back_colour ?? "#FFFFFF", spineFont: cover.spine_font,
    spine: cover.spine, trimMm: cover.trim, title: [cover.title, cover.author].filter(Boolean).join(" · "),
    spineColor: cover.spine_colour, textColor: cover.text_colour, bleedMm: cover.bleed_mm,
  };
  return <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4 backdrop-blur-sm" role="dialog" aria-label="Book preview">
    <div className="flex items-center justify-center gap-2">
      <Button size="sm" variant={view === "3d" ? "default" : "outline"} onClick={() => setView("3d")}><Box className="mr-2 h-4 w-4" />3D book</Button>
      <Button size="sm" variant={view === "flat" ? "default" : "outline"} onClick={() => setView("flat")}><Layers className="mr-2 h-4 w-4" />Flat cover</Button>
      <Button size="sm" variant="outline" onClick={insidePages}><BookOpen className="mr-2 h-4 w-4" />Inside pages</Button>
      <Button size="icon" variant="ghost" className="absolute right-4 top-4" aria-label="Close preview" onClick={onClose}><X className="h-5 w-5" /></Button>
    </div>
    <div className="mx-auto mt-4 min-h-0 w-full max-w-5xl flex-1 rounded-lg p-4 shadow-inner" style={{ background: "radial-gradient(ellipse at center, hsl(var(--studio-backdrop) / 0.55), hsl(var(--studio-backdrop)))" }}>
      {view === "3d" ? <PerfectBoundBook3D {...props} /> : <PerfectBoundFlatWrap {...props} />}
    </div>
  </div>;
}
