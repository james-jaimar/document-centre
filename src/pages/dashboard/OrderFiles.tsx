import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useOrderData,
  useAddSection,
  useUpdateSection,
  useDeleteSection,
} from "@/hooks/useOrderBuilder";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";
import FileUploader from "@/components/order/FileUploader";
import FileList from "@/components/order/FileList";
import SectionActions from "@/components/order/SectionActions";
import SectionList from "@/components/order/SectionList";
import TabManager from "@/components/order/TabManager";
import { useSignedThumbnailUrl } from "@/lib/thumbnailUtils";
import { useProductOptions } from "@/hooks/useProductOptions";
import { isStructuredValues, type StructuredOptionValue } from "@/lib/productOptionTypes";
import type { ItemSpec } from "@/lib/calculatePrice";
import { FileText, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import PreviewLightbox from "@/components/order/PreviewLightbox";
import UploadProgressModal from "@/components/order/UploadProgressModal";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function OrderFiles() {
  const { id: orderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    order,
    orderItem,
    documents,
    sections,
    loading,
    refetchDocuments,
    refetchSections,
  } = useOrderData(orderId);

  const { uploads, uploadFiles, reprocessDocument, clearUploads } = useDocumentUpload(orderItem?.id);
  const addSection = useAddSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();

  // Fetch product options to detect active tab dividers
  const productFamilyId = orderItem?.product_family_id ?? null;
  const { data: productOptions = [] } = useProductOptions(productFamilyId);
  const spec = orderItem?.spec as unknown as ItemSpec | null;

  // Derive tab info from selected options
  const tabInfo = useMemo(() => {
    const tabOption = productOptions.find((o) => o.name.toLowerCase().includes("tab"));
    if (!tabOption || !isStructuredValues(tabOption.values)) return null;
    const selectedSlug = spec?.selected_options?.[tabOption.name];
    if (!selectedSlug) return null;
    const selectedValue = (tabOption.values as StructuredOptionValue[]).find(
      (v) => v.slug === selectedSlug
    );
    if (!selectedValue) return null;
    const meta = selectedValue.metadata as Record<string, any> | undefined;
    const tabCount = meta?.tab_count as number | undefined;
    if (!tabCount || tabCount <= 0) return null;
    const isMultiColor = selectedValue.slug.includes("multi") || !!meta?.multi_color;
    return { tabCount, isMultiColor };
  }, [productOptions, spec]);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Determine which document to show in the middle preview
  const previewDoc = useMemo(() => {
    if (selectedDocId) return documents.find((d) => d.id === selectedDocId) ?? null;
    if (selectedSectionId) {
      const section = sections.find((s) => s.id === selectedSectionId);
      if (section?.document_id) return documents.find((d) => d.id === section.document_id) ?? null;
    }
    return null;
  }, [selectedDocId, selectedSectionId, documents, sections]);

  const lightboxThumbnails = useMemo(() => {
    if (!previewDoc) return [];
    return Array.isArray(previewDoc.thumbnail_urls) ? (previewDoc.thumbnail_urls as string[]) : [];
  }, [previewDoc]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setUploadModalOpen(true);
      await uploadFiles(files);
    },
    [uploadFiles]
  );

  const handleUploadContinue = useCallback(() => {
    setUploadModalOpen(false);
    clearUploads();
    refetchDocuments();
  }, [clearUploads, refetchDocuments]);

  const handleAddAs = useCallback(
    async (type: "front_cover" | "back_cover" | "body" | "insert" | "tab") => {
      if (!selectedDocId || !orderItem) return;
      try {
        await addSection.mutateAsync({
          order_item_id: orderItem.id,
          document_id: selectedDocId,
          section_type: type,
          sort_order: sections.length,
        });
        toast.success(`Added as ${type.replace("_", " ")}`);
      } catch (err: any) {
        toast.error("Failed to add section", { description: err.message });
      }
    },
    [selectedDocId, orderItem, sections.length, addSection]
  );

  const handleRemoveSection = useCallback(async () => {
    if (!selectedSectionId || !orderItem) return;
    try {
      await deleteSection.mutateAsync({
        id: selectedSectionId,
        orderItemId: orderItem.id,
      });
      setSelectedSectionId(null);
      toast.success("Section removed");
    } catch (err: any) {
      toast.error("Failed to remove", { description: err.message });
    }
  }, [selectedSectionId, orderItem, deleteSection]);

  const handleToggleColor = useCallback(
    async (section: (typeof sections)[0]) => {
      await updateSection.mutateAsync({
        id: section.id,
        is_color: !section.is_color,
      });
    },
    [updateSection]
  );

  const handleToggleDuplex = useCallback(
    async (section: (typeof sections)[0]) => {
      await updateSection.mutateAsync({
        id: section.id,
        is_duplex: !section.is_duplex,
      });
    },
    [updateSection]
  );

  const handleMoveSection = useCallback(
    async (sectionId: string, direction: "up" | "down") => {
      const idx = sections.findIndex((s) => s.id === sectionId);
      if (idx < 0) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sections.length) return;

      await Promise.all([
        updateSection.mutateAsync({
          id: sections[idx].id,
          sort_order: sections[swapIdx].sort_order,
        }),
        updateSection.mutateAsync({
          id: sections[swapIdx].id,
          sort_order: sections[idx].sort_order,
        }),
      ]);
    },
    [sections, updateSection]
  );

  // Tab management handlers
  const handleAddTab = useCallback(
    async (sortOrder: number) => {
      if (!orderItem) return;
      await addSection.mutateAsync({
        order_item_id: orderItem.id,
        document_id: null,
        section_type: "tab",
        sort_order: sortOrder,
      });
    },
    [orderItem, addSection]
  );

  const handleDeleteTab = useCallback(
    async (sectionId: string) => {
      if (!orderItem) return;
      await deleteSection.mutateAsync({ id: sectionId, orderItemId: orderItem.id });
    },
    [orderItem, deleteSection]
  );

  const handleMoveTab = useCallback(
    async (sectionId: string, newSortOrder: number) => {
      await updateSection.mutateAsync({ id: sectionId, sort_order: newSortOrder });
    },
    [updateSection]
  );

  const canContinue = sections.length > 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Upload &amp; Organise Files
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Step 1 of 2 — Upload your PDFs and assign them to document sections
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard/orders/new")}
              className="soft-button flex items-center gap-1.5 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              disabled={!canContinue}
              onClick={() => navigate(`/dashboard/orders/${orderId}/build`)}
              className="soft-button soft-button-primary flex items-center gap-1.5 text-sm rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Configure Options
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_auto_1fr] gap-5 items-start">
        {/* Left: Uploaded Files */}
        <div className="glass-card p-5 space-y-4">
          <h2 className="section-header">Uploaded Files</h2>
          <FileUploader onFiles={handleFiles} />
          <FileList
            documents={documents}
            selectedDocId={selectedDocId}
            onSelect={setSelectedDocId}
            onReprocess={reprocessDocument}
          />
        </div>

        {/* Middle: Preview + Actions */}
        <div className="hidden lg:block">
          <div className="glass-card p-4 sticky top-24 space-y-4">
            <InlinePreviewThumb
              document={previewDoc}
              onClick={() => lightboxThumbnails.length > 0 && setLightboxOpen(true)}
            />
            <div className="border-t border-border/60" />
            <SectionActions
              hasSelectedFile={!!selectedDocId}
              onAddAs={handleAddAs}
              hasSelectedSection={!!selectedSectionId}
              onRemoveSection={handleRemoveSection}
            />
          </div>
        </div>

        {/* Right: Document Sections */}
        <div className="section-card p-5 space-y-4">
          <h2 className="section-header">Your Document</h2>
          <SectionList
            sections={sections}
            documents={documents}
            selectedSectionId={selectedSectionId}
            onSelect={setSelectedSectionId}
            onToggleColor={handleToggleColor}
            onToggleDuplex={handleToggleDuplex}
            onMove={handleMoveSection}
          />
        </div>
      </div>

      {/* Mobile actions */}
      <div className="lg:hidden glass-card p-4">
        <SectionActions
          hasSelectedFile={!!selectedDocId}
          onAddAs={handleAddAs}
          hasSelectedSection={!!selectedSectionId}
          onRemoveSection={handleRemoveSection}
        />
      </div>

      {/* Lightbox */}
      {lightboxOpen && lightboxThumbnails.length > 0 && (
        <PreviewLightbox
          thumbnailPaths={lightboxThumbnails}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Upload Progress Modal */}
      <UploadProgressModal
        open={uploadModalOpen}
        uploads={uploads}
        onContinue={handleUploadContinue}
      />
    </div>
  );
}

/* Inline preview thumbnail replacing the old DocumentPreviewThumb component */
function ThumbImage({ storagePath }: { storagePath: string }) {
  const url = useSignedThumbnailUrl(storagePath);
  if (!url) return <FileText className="h-8 w-8 text-muted-foreground/30" />;
  return <img src={url} alt="Page preview" className="h-full w-full object-contain" />;
}


function InlinePreviewThumb({
  document,
  onClick,
}: {
  document: { file_name: string; page_count: number | null; page_width_mm: number | null; page_height_mm: number | null; thumbnail_urls: unknown } | null;
  onClick: () => void;
}) {
  const thumbnails = document
    ? Array.isArray(document.thumbnail_urls)
      ? (document.thumbnail_urls as string[])
      : []
    : [];
  const firstThumb = thumbnails.length > 0 ? thumbnails[0] : null;

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/50">
        <FileText className="h-10 w-10 mb-2 opacity-30" />
        <p className="text-xs text-center">Select a file to preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className={cn(
          "relative group w-[140px] aspect-[210/297] bg-muted/30 border border-border/60",
          "flex items-center justify-center overflow-hidden",
          "hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
        )}
      >
        {firstThumb ? (
          <ThumbImage storagePath={firstThumb} />
        ) : (
          <FileText className="h-8 w-8 text-muted-foreground/30" />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <Search className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
      <div className="text-center space-y-0.5">
        <p className="text-xs font-medium text-foreground truncate max-w-[160px]">
          {document.file_name}
        </p>
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          {document.page_count && (
            <span>{document.page_count} {document.page_count === 1 ? "page" : "pages"}</span>
          )}
          {document.page_width_mm && document.page_height_mm && (
            <span>
              {Math.round(Number(document.page_width_mm))}×{Math.round(Number(document.page_height_mm))}mm
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
