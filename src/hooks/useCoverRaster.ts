import { useEffect, useState } from "react";
import { getDownloadUrls } from "@/lib/s3Storage";
import { getPdfBlob } from "@/lib/pdfBlobCache";
import { rasterisePdfPages } from "@/lib/artworkTemplates/pdfPages";

const cache = new Map<string, Promise<string | undefined>>();

/**
 * Proof-only raster of one cover page cropped to its artwork box (TrimBox, or
 * BleedBox when it carries real bleed) — the same box the print server places.
 * Mirrors how calendars/desk pads preview templates; server thumbnails are not
 * reliable for covers saved as part of a larger sheet.
 */
export function useCoverRaster(pdfPath: string | null | undefined, page: number, withBleed: boolean): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    setUrl(undefined);
    if (!pdfPath) return;
    let alive = true;
    const key = `${pdfPath}#${page}#${withBleed ? "b" : "t"}`;
    let job = cache.get(key);
    if (!job) {
      job = (async () => {
        const signed = (await getDownloadUrls([pdfPath]))[pdfPath];
        if (!signed) return undefined;
        const buf = await getPdfBlob(pdfPath, signed);
        let out: string | undefined;
        let i = 0;
        await rasterisePdfPages(buf.slice(0), {
          targetLongPx: 1600, maxPages: page + 1, cropTo: withBleed ? "bleed" : "trim", bleedMm: 0, knockoutTolerance: 0,
          onPage: (p) => { if (i++ === page) out = p.dataUrl; },
        });
        return out;
      })().catch(() => { cache.delete(key); return undefined; });
      cache.set(key, job);
    }
    void job.then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [pdfPath, page, withBleed]);
  return url;
}
