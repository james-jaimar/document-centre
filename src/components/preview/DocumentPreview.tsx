import { useState, useEffect, useCallback, useRef } from "react";
import { batchSignUrls, clearSignedUrlCache } from "@/lib/thumbnailUtils";
import type { ProductPreviewType } from "./previewTypes";
import { getBindingType } from "./previewTypes";
import FlipBook from "./FlipBook";
import RingBinderPreview from "./RingBinderOpenSpread";
import FoldPreview from "./FoldPreview";
import LooseSheetsPreview from "./LooseSheetsPreview";
import { Loader2 } from "lucide-react";

import type { PreviewEffects, TabPosition } from "./previewTypes";

export interface DocumentPreviewProps {
  thumbnailPaths: string[];
  productType?: ProductPreviewType;
  width: number;
  height: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  colorFlags?: boolean[];
  pageAspectRatio?: number;
  effects?: PreviewEffects;
  sectionTypes?: string[];
  pageRoles?: string[];
  bleedFlags?: boolean[];
  pageLabels?: string[];
  pageColors?: string[];
  tabPositions?: TabPosition[];
  displayPageNumbers?: number[];
  faceLabels?: string[];
  /** Binding edge: left (default) or top (for landscape presentations) */
  bindingEdge?: "left" | "top";
  /** When true and bindingEdge==="top", use rotated long-edge artwork. */
  landscapeLongEdge?: boolean;
  /** Selected binding option's method + colour, drives spine artwork. */
  bindingArt?: { method: "spiral" | "comb" | "twin_loop"; color: string };
}

const BOUND_TYPES = new Set([
  "wire_bound", "comb_bound", "saddle_stitched", "perfect_bound", "ring_binder",
]);
const FOLD_TYPES = new Set(["bi_fold", "tri_fold", "z_fold", "gate_fold"]);

export default function DocumentPreview({
  thumbnailPaths,
  productType = "loose_sheets",
  width,
  height,
  currentPage: controlledPage,
  onPageChange: controlledOnPageChange,
  colorFlags,
  pageAspectRatio,
  effects,
  sectionTypes,
  pageRoles,
  bleedFlags,
  pageLabels,
  pageColors,
  tabPositions,
  displayPageNumbers,
  faceLabels,
  bindingEdge,
  bindingArt,
}: DocumentPreviewProps) {
  const [internalPage, setInternalPage] = useState(0);
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const retryRef = useRef(false);

  const page = controlledPage ?? internalPage;
  const setPage = controlledOnPageChange ?? setInternalPage;

  // Batch sign all URLs on mount / when paths change
  // Data URLs (from canvas composition) and already-signed https URLs are passed through directly.
  useEffect(() => {
    if (thumbnailPaths.length === 0) {
      setUrls([]);
      setLoading(false);
      return;
    }

    const needsSigning: string[] = [];
    const directUrls = new Map<number, string>();

    thumbnailPaths.forEach((p, i) => {
      if (p.startsWith("data:") || p.startsWith("http://") || p.startsWith("https://")) {
        directUrls.set(i, p);
      } else if (p) {
        needsSigning.push(p);
      }
    });

    if (needsSigning.length === 0) {
      // All paths are direct URLs or empty — no signing needed
      setUrls(thumbnailPaths.map((p, i) => directUrls.get(i) || ""));
      setLoading(false);
      return;
    }

    let cancelled = false;
    retryRef.current = false;
    setLoading(true);

    const signAndResolve = (isRetry: boolean) => {
      batchSignUrls(needsSigning).then((map) => {
        if (cancelled) return;
        const resolved = thumbnailPaths.map((p, i) => {
          if (directUrls.has(i)) return directUrls.get(i)!;
          return map.get(p) || "";
        });

        // Check for failed signings (non-empty path → empty URL)
        const failedPaths = thumbnailPaths.filter(
          (p, i) => p && !directUrls.has(i) && !resolved[i]
        );

        if (failedPaths.length > 0 && !isRetry) {
          // Clear cache for failed paths and retry once
          console.warn("[DocumentPreview] Failed to sign", failedPaths.length, "paths, retrying…");
          clearSignedUrlCache(failedPaths);
          retryRef.current = true;
          signAndResolve(true);
          return;
        }

        setUrls(resolved);
        setLoading(false);
      });
    };

    signAndResolve(false);
    return () => { cancelled = true; };
  }, [thumbnailPaths]);

  const handlePageChange = useCallback(
    (p: number) => setPage(Math.max(0, Math.min(p, thumbnailPaths.length - 1))),
    [setPage, thumbnailPaths.length]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  const commonProps = {
    urls,
    currentPage: page,
    onPageChange: handlePageChange,
    width,
    height,
    colorFlags,
    pageAspectRatio,
    effects,
    sectionTypes,
    pageRoles,
    bleedFlags,
    pageLabels,
    pageColors,
    tabPositions,
  };

  // Ring binders use a completely separate renderer — never route through FlipBook
  if (productType === "ring_binder") {
    return (
      <RingBinderPreview
        {...commonProps}
        tabPositions={tabPositions}
        rawPaths={thumbnailPaths}
      />
    );
  }

  if (BOUND_TYPES.has(productType)) {
    return <FlipBook {...commonProps} bindingType={getBindingType(productType)} tabPositions={tabPositions} displayPageNumbers={displayPageNumbers} faceLabels={faceLabels} bindingEdge={bindingEdge} bindingArt={bindingArt} rawPaths={thumbnailPaths} />;
  }

  // Business cards use the same LooseSheetsPreview renderer
  if (productType === "business_cards") {
    return <LooseSheetsPreview {...commonProps} />;
  }

  if (FOLD_TYPES.has(productType)) {
    return (
      <FoldPreview
        {...commonProps}
        foldType={productType as "bi_fold" | "tri_fold" | "z_fold" | "gate_fold"}
      />
    );
  }

  return <LooseSheetsPreview {...commonProps} />;
}
