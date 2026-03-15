import { useState, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

  const { uploads, uploadFiles } = useDocumentUpload(orderItem?.id);
  const addSection = useAddSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      await uploadFiles(files);
    },
    [uploadFiles]
  );

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Upload &amp; Organise Files
          </h1>
          <p className="text-muted-foreground mt-1">
            Step 1 of 2 — Upload your PDFs and assign them to document sections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard/orders/new")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button
            disabled={!canContinue}
            onClick={() => navigate(`/dashboard/orders/${orderId}/build`)}
          >
            Configure Options
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px_1fr] gap-4 items-start">
        {/* Left: Uploaded Files */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Uploaded Files
          </h2>
          <FileUploader onFiles={handleFiles} />
          <FileList
            documents={documents}
            uploads={uploads}
            selectedDocId={selectedDocId}
            onSelect={setSelectedDocId}
          />
        </div>

        {/* Middle: Actions */}
        <div className="hidden lg:block pt-8">
          <SectionActions
            hasSelectedFile={!!selectedDocId}
            onAddAs={handleAddAs}
            hasSelectedSection={!!selectedSectionId}
            onRemoveSection={handleRemoveSection}
          />
        </div>

        {/* Right: Document Sections */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your Document
          </h2>
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

      {/* Mobile actions (visible on small screens) */}
      <div className="lg:hidden">
        <SectionActions
          hasSelectedFile={!!selectedDocId}
          onAddAs={handleAddAs}
          hasSelectedSection={!!selectedSectionId}
          onRemoveSection={handleRemoveSection}
        />
      </div>
    </div>
  );
}
