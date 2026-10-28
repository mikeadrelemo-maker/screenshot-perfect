import {
  Download,
  RotateCcw,
  Save,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Upload,
  Eye,
  FileText,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InvoiceLayout } from "@/lib/invoice/layout-types";
import type { InvoiceType } from "@/lib/invoice/types";
import { cn } from "@/lib/utils";

interface LayoutToolbarProps {
  layout: InvoiceLayout;
  onSelectType: (type: InvoiceType) => void;
  onToggleOrientation: () => void;
  onSaveLayout: () => void;
  onSaveAsPreset: () => void;
  onResetLayout: () => void;
  onRestoreDefault: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomChange: (newZoom: number) => void;
  snapToGrid: boolean;
  onToggleSnap: () => void;
  onToggleBackground: () => void;
  onOpacityChange: (opacity: number) => void;
  onExportJson: () => void;
  onImportJson: () => void;
  viewMode: "canvas" | "pdf";
  onViewModeChange: (mode: "canvas" | "pdf") => void;
}

export function LayoutToolbar({
  layout,
  onSelectType,
  onToggleOrientation,
  onSaveLayout,
  onSaveAsPreset,
  onResetLayout,
  onRestoreDefault,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomChange,
  snapToGrid,
  onToggleSnap,
  onToggleBackground,
  onOpacityChange,
  onExportJson,
  onImportJson,
  viewMode,
  onViewModeChange,
}: LayoutToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
      {/* Left side: Invoice type & view mode */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Template Type Selector */}
        <div className="flex rounded-md border p-0.5 bg-muted/40">
          {(["charge", "cash"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onSelectType(t)}
              className={cn(
                "rounded px-3 py-1 text-xs font-semibold transition-colors",
                layout.invoiceType === t
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "charge" ? "Charge Invoice" : "Cash Invoice"}
            </button>
          ))}
        </div>

        {/* View Mode Switcher (Visual Canvas vs Real PDF) */}
        <div className="flex rounded-md border p-0.5 bg-muted/40">
          <button
            type="button"
            onClick={() => onViewModeChange("canvas")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              viewMode === "canvas"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sliders className="h-3.5 w-3.5" /> Layout Designer
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("pdf")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              viewMode === "pdf"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileText className="h-3.5 w-3.5" /> Print PDF Preview
          </button>
        </div>

        {/* Orientation Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleOrientation}
          className="h-7 text-xs font-normal"
          title="Toggle Portrait / Landscape orientation"
        >
          {layout.orientation === "portrait"
            ? "Letter Portrait (8.5 × 11 in)"
            : "Letter Landscape (11 × 8.5 in)"}
        </Button>
      </div>

      {/* Middle: Canvas tools (Undo, Redo, Zoom, Grid, Template) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Grid Snapping */}
        <Button
          variant={snapToGrid ? "default" : "outline"}
          size="icon"
          className="h-7 w-7"
          onClick={onToggleSnap}
          title={snapToGrid ? "Snap to Grid: ON (1 mm)" : "Snap to Grid: OFF"}
        >
          <Grid className="h-3.5 w-3.5" />
        </Button>

        {/* Template Background Toggle & Opacity */}
        <div className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 bg-muted/20">
          <button
            type="button"
            onClick={onToggleBackground}
            title={
              layout.showBackgroundTemplate ? "Hide scanned template" : "Show scanned template"
            }
            className={cn(
              "flex items-center gap-1 text-xs transition-colors",
              layout.showBackgroundTemplate
                ? "text-foreground font-medium"
                : "text-muted-foreground",
            )}
          >
            <Eye className="h-3.5 w-3.5" /> Template
          </button>
          {layout.showBackgroundTemplate && (
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={layout.backgroundOpacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
              className="h-1 w-16 cursor-pointer accent-primary"
              title={`Template Opacity: ${Math.round(layout.backgroundOpacity * 100)}%`}
            />
          )}
        </div>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Zoom Controls */}
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onZoomChange(Math.max(0.5, zoom - 0.1))}
          title="Zoom Out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="w-12 text-center text-xs font-mono font-medium">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onZoomChange(Math.min(2.0, zoom + 0.1))}
          title="Zoom In"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onZoomChange(1.0)}
          title="Reset Zoom to 100%"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Right side: Persistence & Layout Presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onResetLayout}
          title="Reset unsaved changes to last saved state"
        >
          <RotateCcw className="mr-1 h-3 w-3" /> Reset
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onRestoreDefault}
          title="Restore factory default coordinates and layout"
        >
          Reset to Default Layout
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onSaveAsPreset}
          title="Save as named preset"
        >
          Save As...
        </Button>

        <Button size="sm" className="h-7 gap-1.5 px-3 text-xs" onClick={onSaveLayout}>
          <Save className="h-3.5 w-3.5" /> Save Layout
        </Button>

        <div className="mx-1 h-4 w-px bg-border" />

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onExportJson}
          title="Export Layout as JSON"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onImportJson}
          title="Import Layout JSON"
        >
          <Upload className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
