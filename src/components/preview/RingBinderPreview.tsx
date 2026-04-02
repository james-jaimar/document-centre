import { useState } from "react";
import type { PreviewComponentProps } from "./previewTypes";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

/**
 * Ring Binder Preview — placeholder shell awaiting actual binder background image.
 * Shows a stylised binder outline with pages overlaid at A4 aspect ratio.
 */

const BINDER_ASPECT = 270 / 320; // ~0.84375
const PAGE_ASPECT = 210 / 297;   // ~0.707 (A4 inside binder)

export default function RingBinderPreview({
  urls,
  currentPage,
  onPageChange,
  width,
  height,
  colorFlags,
}: PreviewComponentProps) {
  // Scale binder to fit container
  const binderHeight = Math.min(height * 0.85, width * 0.6 / BINDER_ASPECT);
  const binderWidth = binderHeight * BINDER_ASPECT;

  // Inner page area (A4 centered inside binder, with padding)
  const pagePadding = binderWidth * 0.06;
  const pageAreaWidth = binderWidth - pagePadding * 2;
  const pageAreaHeight = pageAreaWidth / PAGE_ASPECT;
  const pageTop = (binderHeight - pageAreaHeight) * 0.55; // slight top offset

  const total = urls.length;
  const page = Math.min(currentPage, total - 1);

  return (
    <div className="flex flex-col items-center justify-center gap-3" style={{ width, height }}>
      {/* Binder container */}
      <div
        className="relative"
        style={{ width: binderWidth, height: binderHeight }}
      >
        {/* Binder outline — placeholder until real image is supplied */}
        <div
          className="absolute inset-0 rounded-lg border-2 border-muted-foreground/30"
          style={{
            background: "linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--card)) 100%)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          }}
        />

        {/* Ring mechanism (3 D-rings) */}
        <div
          className="absolute flex flex-col justify-evenly items-center"
          style={{
            left: -6,
            top: binderHeight * 0.15,
            height: binderHeight * 0.7,
            width: 14,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-full border-2 border-muted-foreground/50"
              style={{
                width: 14,
                height: 20,
                background: "linear-gradient(90deg, hsl(var(--muted-foreground) / 0.15), hsl(var(--muted-foreground) / 0.3))",
              }}
            />
          ))}
        </div>

        {/* Page area */}
        <div
          className="absolute bg-card border border-border/60 overflow-hidden"
          style={{
            left: pagePadding,
            top: pageTop,
            width: pageAreaWidth,
            height: pageAreaHeight,
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          {urls[page] ? (
            <img
              src={urls[page]}
              alt={`Page ${page + 1}`}
              className="w-full h-full object-contain"
              style={{ filter: colorFlags?.[page] === false ? "grayscale(100%)" : "none" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FileText className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* 4-hole punch marks on left side of page */}
        <div
          className="absolute flex flex-col justify-evenly items-center pointer-events-none"
          style={{
            left: pagePadding + 4,
            top: pageTop + 10,
            height: pageAreaHeight - 20,
            width: 8,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-full bg-muted-foreground/15"
              style={{ width: 5, height: 5 }}
            />
          ))}
        </div>
      </div>

      {/* Navigation */}
      {total > 1 && (
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page >= total - 1}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
