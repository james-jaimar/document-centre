import { useState, useEffect, useMemo, useCallback } from "react";
import { batchSignUrls } from "@/lib/thumbnailUtils";
import type { ProductPreviewType } from "./previewTypes";
import { getBindingType } from "./previewTypes";
import FlipBook from "./FlipBook";
import FoldPreview from "./FoldPreview";
import LooseSheetsPreview from "./LooseSheetsPreview";
import { Loader2 } from "lucide-react";

import type { PreviewEffects } from "./previewTypes";

interface DocumentPreviewProps {
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
}: DocumentPreviewProps) {
  const [internalPage, setInternalPage] = useState(0);
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const page = controlledPage ?? internalPage;
  const setPage = controlledOnPageChange ?? setInternalPage;

  // Batch sign all URLs on mount / when paths change
  useEffect(() => {
    if (thumbnailPaths.length === 0) {
      setUrls([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    batchSignUrls(thumbnailPaths).then((map) => {
      if (cancelled) return;
      const resolved = thumbnailPaths.map((p) => map.get(p) || "");
      setUrls(resolved);
      setLoading(false);
    });
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
  };

  if (BOUND_TYPES.has(productType)) {
    return <FlipBook {...commonProps} bindingType={getBindingType(productType)} />;
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
