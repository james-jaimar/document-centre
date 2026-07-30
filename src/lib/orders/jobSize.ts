/**
 * Helpers for surfacing the finished/trim size of a job in admin views.
 * Purely presentational — reads what is already stored in the job snapshot.
 */

export interface ResolvedJobSize {
  /** Human label as stored, e.g. "A5 (148×210mm)". */
  label: string;
  /** Parsed millimetre dimensions when the label contains them. */
  width_mm: number;
  height_mm: number;
}

const SIZE_LABEL_RE = /^(document\s+size|finished\s+size|trim\s+size|size|paper\s+size|flat\s+size)$/i;

/** True when a spec row label refers to the document size. */
export function isSizeLabel(label: string | null | undefined): boolean {
  return SIZE_LABEL_RE.test((label ?? "").toString().trim());
}

/** Pull "148 × 210" style dimensions out of a size label. */
export function parseDimensions(value: string | null | undefined): { width_mm: number; height_mm: number } {
  const m = (value ?? "").toString().match(/(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return { width_mm: 0, height_mm: 0 };
  const w = Number(m[1].replace(",", "."));
  const h = Number(m[2].replace(",", "."));
  return { width_mm: Number.isFinite(w) ? w : 0, height_mm: Number.isFinite(h) ? h : 0 };
}

/**
 * Resolve the job's document size from the snapshot, in priority order:
 * summary primary specs → configuration section items → job columns.
 */
export function resolveJobSize(job: any, config: any): ResolvedJobSize | null {
  const summary = config?.summary ?? {};

  for (const n of [1, 2, 3]) {
    const label = summary[`primary_spec_${n}_label`];
    const value = summary[`primary_spec_${n}_value`];
    if (isSizeLabel(label) && value) {
      return { label: String(value), ...parseDimensions(value) };
    }
  }

  const sections: any[] = Array.isArray(config?.sections) ? config.sections : [];
  for (const section of sections) {
    for (const item of section?.items ?? []) {
      if (isSizeLabel(item?.label) && item?.value) {
        return { label: String(item.value), ...parseDimensions(item.value) };
      }
    }
  }

  const w = Number(job?.width_mm) || 0;
  const h = Number(job?.height_mm) || 0;
  if (w > 0 && h > 0) {
    return { label: `${w}×${h}mm`, width_mm: w, height_mm: h };
  }

  return null;
}

/** Portrait / Landscape / Square, when dimensions are known. */
export function orientationOf(size: { width_mm: number; height_mm: number } | null): string | null {
  if (!size || !(size.width_mm > 0 && size.height_mm > 0)) return null;
  if (Math.abs(size.width_mm - size.height_mm) < 0.5) return "Square";
  return size.width_mm > size.height_mm ? "Landscape" : "Portrait";
}

/** Orientation-agnostic size comparison with a ±1mm tolerance. */
export function sizesMatch(
  aW: number,
  aH: number,
  bW: number,
  bH: number,
  tolerance = 1.0,
): boolean {
  if (!(aW > 0 && aH > 0 && bW > 0 && bH > 0)) return false;
  const portrait = Math.abs(aW - bW) <= tolerance && Math.abs(aH - bH) <= tolerance;
  const landscape = Math.abs(aW - bH) <= tolerance && Math.abs(aH - bW) <= tolerance;
  return portrait || landscape;
}
