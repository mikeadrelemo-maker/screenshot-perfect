import { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import type { InvoiceLayout, LayoutField } from "@/lib/invoice/layout-types";
import { cn } from "@/lib/utils";
import { getCssFontFamily, registerCanvasFonts } from "@/lib/invoice/fonts";
import { toast } from "sonner";

interface LayoutCanvasProps {
  layout: InvoiceLayout;
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onUpdateField: (field: LayoutField) => void;
  zoom: number; // e.g. 1 = 100%, 0.8 = 80%
  snapToGrid: boolean;
  gridSizeMm?: number;
  constrainToPage?: boolean;
}

type ResizeHandleType = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface DragState {
  fieldId: string;
  type: "move" | "resize";
  handle?: ResizeHandleType;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
}

export function LayoutCanvas({
  layout,
  selectedFieldId,
  onSelectField,
  onUpdateField,
  zoom,
  snapToGrid,
  gridSizeMm = 1.0,
  constrainToPage = true,
}: LayoutCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void registerCanvasFonts().catch((error) => toast.error(error.message));
  }, []);

  // Conversion: display scale factor (pixels per mm on canvas at 100% zoom)
  // Standard screen density ~ 3.78 px per mm (96 DPI)
  const PX_PER_MM = 3.779527559;
  const scale = PX_PER_MM * zoom;

  const canvasWidthPx = layout.pageWidthMm * scale;
  const canvasHeightPx = layout.pageHeightMm * scale;

  const [dragState, setDragState] = useState<DragState | null>(null);

  const selectedField = layout.fields.find((f) => f.id === selectedFieldId);

  // Snap a coordinate to grid if enabled
  const snap = useCallback(
    (val: number) => {
      if (!snapToGrid) return Math.round(val * 10) / 10;
      return Math.round((Math.round(val / gridSizeMm) * gridSizeMm) * 10) / 10;
    },
    [snapToGrid, gridSizeMm],
  );

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
      let nextX = selectedField.x + dx;
      let nextY = selectedField.y + dy;

      if (constrainToPage) {
        const maxX = Math.max(0, layout.pageWidthMm - selectedField.w);
        const maxY = Math.max(0, layout.pageHeightMm - selectedField.h);
        nextX = Math.max(0, Math.min(maxX, nextX));
        nextY = Math.max(0, Math.min(maxY, nextY));
      } else {
        nextX = Math.max(0, nextX);
        nextY = Math.max(0, nextY);
      }

      onUpdateField({
        ...selectedField,
        x: Math.round(nextX * 10) / 10,
        y: Math.round(nextY * 10) / 10,
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedField, onUpdateField, constrainToPage, layout.pageWidthMm, layout.pageHeightMm]);

  // Pointer drag and resize handlers using window-level listeners for smooth drag
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const targetField = layout.fields.find((f) => f.id === dragState.fieldId);
      if (!targetField) return;

      const dxMm = (e.clientX - dragState.startX) / scale;
      const dyMm = (e.clientY - dragState.startY) / scale;

      const MIN_W = 5.0; // mm
      const MIN_H = 3.0; // mm

      if (dragState.type === "move") {
        let newX = dragState.origX + dxMm;
        let newY = dragState.origY + dyMm;

        if (constrainToPage) {
          const maxX = Math.max(0, layout.pageWidthMm - targetField.w);
          const maxY = Math.max(0, layout.pageHeightMm - targetField.h);
          newX = Math.max(0, Math.min(maxX, newX));
          newY = Math.max(0, Math.min(maxY, newY));
        } else {
          newX = Math.max(0, newX);
          newY = Math.max(0, newY);
        }

        newX = snap(newX);
        newY = snap(newY);

        onUpdateField({
          ...targetField,
          x: Math.round(newX * 10) / 10,
          y: Math.round(newY * 10) / 10,
        });
      } else if (dragState.type === "resize" && dragState.handle) {
        let newX = dragState.origX;
        let newY = dragState.origY;
        let newW = dragState.origW;
        let newH = dragState.origH;

        const h = dragState.handle;

        // East / West horizontal resize
        if (h.includes("e")) {
          const targetW = dragState.origW + dxMm;
          const maxAllowedW = constrainToPage ? layout.pageWidthMm - dragState.origX : 1000;
          newW = snap(Math.max(MIN_W, Math.min(maxAllowedW, targetW)));
        } else if (h.includes("w")) {
          const maxDeltaLeft = constrainToPage ? dragState.origX : 1000;
          const clampedDx = Math.max(-maxDeltaLeft, dxMm);
          const potentialW = snap(Math.max(MIN_W, dragState.origW - clampedDx));
          newX = dragState.origX + (dragState.origW - potentialW);
          newW = potentialW;
        }

        // North / South vertical resize
        if (h.includes("s")) {
          const targetH = dragState.origH + dyMm;
          const maxAllowedH = constrainToPage ? layout.pageHeightMm - dragState.origY : 1000;
          newH = snap(Math.max(MIN_H, Math.min(maxAllowedH, targetH)));
        } else if (h.includes("n")) {
          const maxDeltaTop = constrainToPage ? dragState.origY : 1000;
          const clampedDy = Math.max(-maxDeltaTop, dyMm);
          const potentialH = snap(Math.max(MIN_H, dragState.origH - clampedDy));
          newY = dragState.origY + (dragState.origH - potentialH);
          newH = potentialH;
        }

        if (constrainToPage) {
          if (newX < 0) {
            newW += newX;
            newX = 0;
          }
          if (newY < 0) {
            newH += newY;
            newY = 0;
          }
          if (newX + newW > layout.pageWidthMm) {
            newW = Math.max(MIN_W, layout.pageWidthMm - newX);
          }
          if (newY + newH > layout.pageHeightMm) {
            newH = Math.max(MIN_H, layout.pageHeightMm - newY);
          }
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

    const handlePointerUp = () => {
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragState, layout, scale, constrainToPage, snap, onUpdateField]);

  const onPointerDownField = (e: React.PointerEvent, field: LayoutField) => {
    e.stopPropagation();
    e.preventDefault();
    onSelectField(field.id);

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
    handle: ResizeHandleType,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    onSelectField(field.id);

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

  // Check if field extends beyond margins
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
      className="relative flex min-h-[700px] flex-1 items-center justify-center overflow-auto bg-slate-900/10 p-8 select-none touch-none"
      onClick={() => onSelectField(null)}
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
          className="pointer-events-none absolute border border-dashed border-sky-400/60"
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
            src={`${import.meta.env.BASE_URL}templates/${layout.invoiceType}.jpg`}
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

        {/* Interactive Draggable & Resizable Fields */}
        {layout.fields
          .filter((f) => f.visible)
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((field) => {
            const isSelected = field.id === selectedFieldId;
            const isDragging = dragState?.fieldId === field.id;
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
                  "group absolute cursor-move transition-shadow box-border",
                  isSelected
                    ? "ring-2 ring-primary ring-offset-1 z-50 bg-primary/10 shadow-lg"
                    : "hover:ring-1 hover:ring-primary/60 hover:bg-primary/5",
                  outOfBounds && "ring-amber-500 bg-amber-500/10",
                  isDragging && "opacity-95 shadow-2xl",
                )}
                style={{
                  left: `${leftPx}px`,
                  top: `${topPx}px`,
                  width: `${widthPx}px`,
                  height: `${heightPx}px`,
                  zIndex: isSelected ? 999 : field.zIndex,
                }}
              >
                {/* Visual Label Tag with X, Y and W, H above field */}
                <div
                  className={cn(
                    "pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium leading-none shadow transition-opacity z-[1000]",
                    isSelected
                      ? "bg-primary text-primary-foreground opacity-100"
                      : "bg-slate-800/80 text-white opacity-0 group-hover:opacity-100",
                  )}
                >
                  {field.name} · X:{field.x.toFixed(1)}, Y:{field.y.toFixed(1)} mm · W:{field.w.toFixed(1)}, H:{field.h.toFixed(1)} mm
                  {isDragging && (dragState?.type === "move" ? " (Moving)" : " (Resizing)")}
                </div>

                {/* Out of bounds badge */}
                {outOfBounds && !isSelected && (
                  <div
                    className="pointer-events-none absolute -top-5 right-0 flex items-center gap-0.5 rounded bg-amber-600 px-1 py-0.5 text-[10px] text-white z-[1000]"
                    title="Field extends beyond printable area!"
                  >
                    <AlertTriangle className="h-3 w-3" /> Margin warning
                  </div>
                )}

                {/* Simulated Content in Field matching PDF typography */}
                <div
                  className={cn(
                    "flex h-full w-full overflow-hidden p-0.5 items-center",
                    field.align === "right" && "justify-end text-right",
                    field.align === "center" && "justify-center text-center",
                    field.align === "left" && "justify-start text-left",
                    field.fontWeight === "bold" ? "font-bold" : "font-normal",
                  )}
                  style={{
                    fontFamily: getCssFontFamily(field.fontFamily),
                    fontSize: `${field.fontSize * (96 / 72) * zoom}px`,
                    lineHeight: field.lineHeight || 1.15,
                    color: field.color || "#0d1329",
                  }}
                >
                  <span className={cn(field.wrapText ? "break-words w-full" : "whitespace-nowrap truncate")}>
                    {field.staticText || field.sampleValue || field.name}
                  </span>
                </div>

                {/* 8 Resize Handles when selected (North, South, East, West and Corners) */}
                {isSelected && (
                  <>
                    {/* NW Handle */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "nw")}
                      className="absolute -top-1.5 -left-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-primary shadow hover:scale-125 transition-transform"
                      title="Resize North-West"
                    />
                    {/* N Handle */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "n")}
                      className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3.5 w-3.5 cursor-ns-resize rounded-full border-2 border-white bg-primary shadow hover:scale-125 transition-transform"
                      title="Resize Height (Top)"
                    />
                    {/* NE Handle */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "ne")}
                      className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 cursor-nesw-resize rounded-full border-2 border-white bg-primary shadow hover:scale-125 transition-transform"
                      title="Resize North-East"
                    />
                    {/* W Handle */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "w")}
                      className="absolute top-1/2 -translate-y-1/2 -left-1.5 h-3.5 w-3.5 cursor-ew-resize rounded-full border-2 border-white bg-primary shadow hover:scale-125 transition-transform"
                      title="Resize Width (Left)"
                    />
                    {/* E Handle */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "e")}
                      className="absolute top-1/2 -translate-y-1/2 -right-1.5 h-3.5 w-3.5 cursor-ew-resize rounded-full border-2 border-white bg-primary shadow hover:scale-125 transition-transform"
                      title="Resize Width (Right)"
                    />
                    {/* SW Handle */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "sw")}
                      className="absolute -bottom-1.5 -left-1.5 h-3.5 w-3.5 cursor-nesw-resize rounded-full border-2 border-white bg-primary shadow hover:scale-125 transition-transform"
                      title="Resize South-West"
                    />
                    {/* S Handle */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "s")}
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3.5 w-3.5 cursor-ns-resize rounded-full border-2 border-white bg-primary shadow hover:scale-125 transition-transform"
                      title="Resize Height (Bottom)"
                    />
                    {/* SE Handle */}
                    <div
                      onPointerDown={(e) => onPointerDownHandle(e, field, "se")}
                      className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-primary shadow hover:scale-125 transition-transform"
                      title="Resize South-East"
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
