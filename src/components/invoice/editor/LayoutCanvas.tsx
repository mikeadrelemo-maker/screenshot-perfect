import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { InvoiceLayout, LayoutField } from "@/lib/invoice/layout-types";
import { cn } from "@/lib/utils";

interface LayoutCanvasProps {
  layout: InvoiceLayout;
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onUpdateField: (field: LayoutField) => void;
  zoom: number; // e.g. 1 = 100%, 0.8 = 80%
  snapToGrid: boolean;
  gridSizeMm?: number;
}

export function LayoutCanvas({
  layout,
  selectedFieldId,
  onSelectField,
  onUpdateField,
  zoom,
  snapToGrid,
  gridSizeMm = 1.0,
}: LayoutCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Conversion: display scale factor (pixels per mm on canvas at 100% zoom)
  // Standard screen density ~ 3.78 px per mm (96 DPI)
  const PX_PER_MM = 3.779527559;
  const scale = PX_PER_MM * zoom;

  const canvasWidthPx = layout.pageWidthMm * scale;
  const canvasHeightPx = layout.pageHeightMm * scale;

  const [dragState, setDragState] = useState<{
    fieldId: string;
    type: "move" | "resize";
    handle?: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const selectedField = layout.fields.find((f) => f.id === selectedFieldId);

  // Snap a coordinate to grid if enabled
  const snap = (val: number) => {
    if (!snapToGrid) return Math.round(val * 10) / 10;
    return Math.round(val / gridSizeMm) * gridSizeMm;
  };

  // Keyboard navigation for selected field
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedField) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      let step = 1.0; // mm
      if (e.shiftKey) step = 5.0;
      if (e.altKey) step = 0.1;

      let dx = 0;
      let dy = 0;

      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;

      e.preventDefault();
      onUpdateField({
        ...selectedField,
        x: Math.max(0, Math.round((selectedField.x + dx) * 10) / 10),
        y: Math.max(0, Math.round((selectedField.y + dy) * 10) / 10),
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedField, onUpdateField]);

  // Pointer drag and resize handlers
  const onPointerDownField = (e: React.PointerEvent, field: LayoutField) => {
    e.stopPropagation();
    onSelectField(field.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    setDragState({
      fieldId: field.id,
      type: "move",
      startX: e.clientX,
      startY: e.clientY,
      origX: field.x,
      origY: field.y,
      origW: field.w,
      origH: field.h,
    });
  };

  const onPointerDownHandle = (
    e: React.PointerEvent,
    field: LayoutField,
    handle: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w",
  ) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    setDragState({
      fieldId: field.id,
      type: "resize",
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: field.x,
      origY: field.y,
      origW: field.w,
      origH: field.h,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    const targetField = layout.fields.find((f) => f.id === dragState.fieldId);
    if (!targetField) return;

    const dxMm = (e.clientX - dragState.startX) / scale;
    const dyMm = (e.clientY - dragState.startY) / scale;

    if (dragState.type === "move") {
      const newX = snap(Math.max(0, dragState.origX + dxMm));
      const newY = snap(Math.max(0, dragState.origY + dyMm));
      onUpdateField({
        ...targetField,
        x: newX,
        y: newY,
      });
    } else if (dragState.type === "resize" && dragState.handle) {
      let newX = targetField.x;
      let newY = targetField.y;
      let newW = targetField.w;
      let newH = targetField.h;

      const h = dragState.handle;
      if (h.includes("e")) {
        newW = snap(Math.max(5, dragState.origW + dxMm));
      }
      if (h.includes("s")) {
        newH = snap(Math.max(3, dragState.origH + dyMm));
      }
      if (h.includes("w")) {
        const potentialW = snap(Math.max(5, dragState.origW - dxMm));
        newX = dragState.origX + (dragState.origW - potentialW);
        newW = potentialW;
      }
      if (h.includes("n")) {
        const potentialH = snap(Math.max(3, dragState.origH - dyMm));
        newY = dragState.origY + (dragState.origH - potentialH);
        newH = potentialH;
      }

      onUpdateField({
        ...targetField,
        x: Math.round(newX * 10) / 10,
        y: Math.round(newY * 10) / 10,
        w: Math.round(newW * 10) / 10,
        h: Math.round(newH * 10) / 10,
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture release fallback
      }
      setDragState(null);
    }
  };

  // Check if field is out of printable bounds
  const isOutOfBounds = (f: LayoutField) => {
    const maxX = layout.pageWidthMm - layout.marginsMm.right;
    const maxY = layout.pageHeightMm - layout.marginsMm.bottom;
    return (
      f.x < layout.marginsMm.left ||
      f.y < layout.marginsMm.top ||
      f.x + f.w > maxX ||
      f.y + f.h > maxY
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-[700px] flex-1 items-center justify-center overflow-auto bg-slate-900/10 p-8 select-none"
      onClick={() => onSelectField(null)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Paper Canvas (US Letter) */}
      <div
        className="relative border border-slate-300 bg-white shadow-2xl transition-all"
        style={{
          width: `${canvasWidthPx}px`,
          height: `${canvasHeightPx}px`,
        }}
        onClick={(e) => {
          // Click on empty canvas deselects field
          if (e.target === e.currentTarget) onSelectField(null);
        }}
      >
        {/* Printable Margins Guidelines */}
        <div
          className="pointer-events-none absolute border border-dashed border-sky-300/60"
          style={{
            top: `${layout.marginsMm.top * scale}px`,
            left: `${layout.marginsMm.left * scale}px`,
            right: `${layout.marginsMm.right * scale}px`,
            bottom: `${layout.marginsMm.bottom * scale}px`,
          }}
        />

        {/* Optional Scanned Template Background */}
        {layout.showBackgroundTemplate && (
          <img
            src={`/templates/${layout.invoiceType}.jpg`}
            alt={`${layout.invoiceType} invoice template background`}
            className="pointer-events-none absolute inset-0 h-full w-full object-fill"
            style={{ opacity: layout.backgroundOpacity }}
          />
        )}

        {/* Millimeter Grid Overlay (when Snap to Grid is enabled) */}
        {snapToGrid && (
          <div
            className="pointer-events-none absolute inset-0 opacity-15"
            style={{
              backgroundImage: `linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)`,
              backgroundSize: `${gridSizeMm * 10 * scale}px ${gridSizeMm * 10 * scale}px`,
            }}
          />
        )}

        {/* Interactive Draggable Fields */}
        {layout.fields
          .filter((f) => f.visible)
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((field) => {
            const isSelected = field.id === selectedFieldId;
            const outOfBounds = isOutOfBounds(field);

            const leftPx = field.x * scale;
            const topPx = field.y * scale;
            const widthPx = field.w * scale;
            const heightPx = field.h * scale;

            return (
              <div
                key={field.id}
                onPointerDown={(e) => onPointerDownField(e, field)}
                className={cn(
                  "group absolute cursor-move transition-shadow",
                  isSelected
                    ? "ring-2 ring-primary ring-offset-1 z-50 bg-primary/10 shadow-lg"
                    : "hover:ring-1 hover:ring-primary/60 hover:bg-primary/5",
                  outOfBounds && "ring-amber-500 bg-amber-500/10",
                )}
                style={{
                  left: `${leftPx}px`,
                  top: `${topPx}px`,
                  width: `${widthPx}px`,
                  height: `${heightPx}px`,
                  zIndex: isSelected ? 999 : field.zIndex,
                }}
              >
                {/* Visual Label Tag above field */}
                <div
                  className={cn(
                    "pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[10px] font-medium leading-tight shadow-sm transition-opacity",
                    isSelected
                      ? "bg-primary text-primary-foreground opacity-100"
                      : "bg-slate-800/80 text-white opacity-0 group-hover:opacity-100",
                  )}
                >
                  {field.name} ({field.x.toFixed(1)}, {field.y.toFixed(1)} mm)
                </div>

                {/* Out of bounds badge */}
                {outOfBounds && (
                  <div
                    className="pointer-events-none absolute -top-5 right-0 flex items-center gap-0.5 rounded bg-amber-600 px-1 text-[10px] text-white"
                    title="Field extends beyond printable area!"
                  >
                    <AlertTriangle className="h-3 w-3" /> Margin warning
                  </div>
                )}

                {/* Simulated Content in Field */}
                <div
                  className={cn(
                    "flex h-full w-full overflow-hidden p-0.5 leading-snug",
                    field.align === "right" && "justify-end text-right",
                    field.align === "center" && "justify-center text-center",
                    field.align === "left" && "justify-start text-left",
                    field.fontWeight === "bold" ? "font-bold" : "font-normal",
                  )}
                  style={{
                    fontSize: `${field.fontSize * (scale / PX_PER_MM) * 0.95}px`,
                    color: field.color || "#0d1329",
                  }}
                >
                  <span className={cn(field.wrapText ? "break-words" : "truncate")}>
                    {field.staticText || field.sampleValue || field.name}
                  </span>
                </div>

                {/* 8 Resize Handles when selected */}
                {isSelected && (
                  <>
                    {/* NW */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "nw")}
                      className="absolute -top-1.5 -left-1.5 h-3 w-3 cursor-nw-resize rounded-full border border-white bg-primary shadow"
                    />
                    {/* N */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "n")}
                      className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 cursor-n-resize rounded-full border border-white bg-primary shadow"
                    />
                    {/* NE */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "ne")}
                      className="absolute -top-1.5 -right-1.5 h-3 w-3 cursor-ne-resize rounded-full border border-white bg-primary shadow"
                    />
                    {/* W */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "w")}
                      className="absolute top-1/2 -translate-y-1/2 -left-1.5 h-3 w-3 cursor-w-resize rounded-full border border-white bg-primary shadow"
                    />
                    {/* E */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "e")}
                      className="absolute top-1/2 -translate-y-1/2 -right-1.5 h-3 w-3 cursor-e-resize rounded-full border border-white bg-primary shadow"
                    />
                    {/* SW */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "sw")}
                      className="absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-sw-resize rounded-full border border-white bg-primary shadow"
                    />
                    {/* S */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "s")}
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-3 cursor-s-resize rounded-full border border-white bg-primary shadow"
                    />
                    {/* SE */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "se")}
                      className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-full border border-white bg-primary shadow"
                    />
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
