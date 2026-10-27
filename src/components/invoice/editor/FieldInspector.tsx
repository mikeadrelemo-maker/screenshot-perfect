import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InvoiceLayout, LayoutField } from "@/lib/invoice/layout-types";
import { cn } from "@/lib/utils";

interface FieldInspectorProps {
  layout: InvoiceLayout;
  field: LayoutField | null;
  onUpdateField: (field: LayoutField) => void;
  onDuplicateField: (field: LayoutField) => void;
  onDeleteField: (id: string) => void;
  onResetFieldPosition: (id: string) => void;
}

export function FieldInspector({
  layout,
  field,
  onUpdateField,
  onDuplicateField,
  onDeleteField,
  onResetFieldPosition,
}: FieldInspectorProps) {
  if (!field) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <p className="text-sm font-medium">No Field Selected</p>
        <p className="mt-1 text-xs">
          Click any field on the invoice canvas or select one from the left sidebar to edit its
          exact position, dimensions, and typography.
        </p>
      </div>
    );
  }

  const maxX = layout.pageWidthMm - layout.marginsMm.right;
  const maxY = layout.pageHeightMm - layout.marginsMm.bottom;
  const isOutOfBounds =
    field.x < layout.marginsMm.left ||
    field.y < layout.marginsMm.top ||
    field.x + field.w > maxX ||
    field.y + field.h > maxY;

  return (
    <div className="flex h-full flex-col divide-y overflow-y-auto">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{field.name}</h3>
            <p className="text-xs text-muted-foreground capitalize">Category: {field.category}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              title="Duplicate Field"
              onClick={() => onDuplicateField(field)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              title={field.type === "customText" ? "Delete Field" : "Hide Field"}
              onClick={() => onDeleteField(field.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isOutOfBounds && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Field extends beyond the printable page margins!</span>
          </div>
        )}
      </div>

      {/* Position & Size (Millimeters) */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Position & Size (mm)
          </Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => onResetFieldPosition(field.id)}
            title="Reset to template default position"
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Reset Pos
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">X (from left, mm)</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              max={layout.pageWidthMm}
              value={field.x}
              onChange={(e) =>
                onUpdateField({
                  ...field,
                  x: Math.round(parseFloat(e.target.value || "0") * 10) / 10,
                })
              }
              className="h-8 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Y (from top, mm)</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              max={layout.pageHeightMm}
              value={field.y}
              onChange={(e) =>
                onUpdateField({
                  ...field,
                  y: Math.round(parseFloat(e.target.value || "0") * 10) / 10,
                })
              }
              className="h-8 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Width (mm)</Label>
            <Input
              type="number"
              step="0.5"
              min="5"
              max={layout.pageWidthMm}
              value={field.w}
              onChange={(e) =>
                onUpdateField({
                  ...field,
                  w: Math.max(5, Math.round(parseFloat(e.target.value || "5") * 10) / 10),
                })
              }
              className="h-8 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Height (mm)</Label>
            <Input
              type="number"
              step="0.5"
              min="3"
              max={layout.pageHeightMm}
              value={field.h}
              onChange={(e) =>
                onUpdateField({
                  ...field,
                  h: Math.max(3, Math.round(parseFloat(e.target.value || "3") * 10) / 10),
                })
              }
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>
      </div>

      {/* Typography */}
      <div className="space-y-3 p-4">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Typography & Style
        </Label>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">Font Size (pt)</Label>
            <Input
              type="number"
              step="0.5"
              min="6"
              max="36"
              value={field.fontSize}
              onChange={(e) =>
                onUpdateField({
                  ...field,
                  fontSize: Math.max(6, Math.min(36, parseFloat(e.target.value || "8"))),
                })
              }
              className="h-8 text-xs font-mono"
            />
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground">Font Weight</Label>
            <Button
              type="button"
              variant={field.fontWeight === "bold" ? "default" : "outline"}
              size="sm"
              className="h-8 w-full gap-1 text-xs"
              onClick={() =>
                onUpdateField({
                  ...field,
                  fontWeight: field.fontWeight === "bold" ? "normal" : "bold",
                })
              }
            >
              <Bold className="h-3.5 w-3.5" />
              {field.fontWeight === "bold" ? "Bold" : "Regular"}
            </Button>
          </div>
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground">Text Alignment</Label>
          <div className="mt-1 grid grid-cols-3 gap-1">
            <Button
              type="button"
              variant={field.align === "left" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => onUpdateField({ ...field, align: "left" })}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant={field.align === "center" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => onUpdateField({ ...field, align: "center" })}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant={field.align === "right" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => onUpdateField({ ...field, align: "right" })}
            >
              <AlignRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground">Text Color</Label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={field.color || "#0d1329"}
              onChange={(e) => onUpdateField({ ...field, color: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border p-0.5 bg-card"
            />
            <div className="flex flex-1 gap-1">
              {[
                { label: "Ink", hex: "#0d1329" },
                { label: "Black", hex: "#000000" },
                { label: "Red", hex: "#c71f26" },
                { label: "Navy", hex: "#1e3a8a" },
              ].map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.label}
                  onClick={() => onUpdateField({ ...field, color: swatch.hex })}
                  className={cn(
                    "h-7 flex-1 rounded border text-[10px] font-medium transition-transform",
                    field.color === swatch.hex && "ring-2 ring-primary ring-offset-1 scale-105",
                  )}
                  style={{
                    backgroundColor: swatch.hex,
                    color: swatch.hex === "#c71f26" || swatch.hex === "#1e3a8a" ? "#fff" : "#fff",
                  }}
                >
                  {swatch.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <Label htmlFor="wrap-toggle" className="cursor-pointer text-xs">
            Allow Text Wrapping
          </Label>
          <input
            id="wrap-toggle"
            type="checkbox"
            checked={!!field.wrapText}
            onChange={(e) => onUpdateField({ ...field, wrapText: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
        </div>
      </div>

      {/* Layer Ordering (Z-Index) */}
      <div className="space-y-2 p-4">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Stacking Order (Z-Index: {field.zIndex})
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => onUpdateField({ ...field, zIndex: field.zIndex + 1 })}
          >
            <ArrowUp className="h-3.5 w-3.5" /> Bring Forward
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => onUpdateField({ ...field, zIndex: Math.max(1, field.zIndex - 1) })}
          >
            <ArrowDown className="h-3.5 w-3.5" /> Send Backward
          </Button>
        </div>
      </div>

      {/* Static text for custom fields */}
      {field.type === "customText" && (
        <div className="space-y-2 p-4">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Custom Static Content
          </Label>
          <Input
            value={field.staticText || ""}
            onChange={(e) => onUpdateField({ ...field, staticText: e.target.value })}
            placeholder="Enter custom text or notes to print..."
            className="text-xs"
          />
        </div>
      )}
    </div>
  );
}
