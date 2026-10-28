import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { InvoiceData, InvoiceType } from "@/lib/invoice/types";
import {
  createDefaultLayout,
  getDefaultChargeFields,
  getDefaultCashFields,
  LETTER_WIDTH_MM,
  LETTER_HEIGHT_MM,
  type InvoiceLayout,
  type LayoutField,
} from "@/lib/invoice/layout-types";
import {
  autoSaveLayout,
  exportLayoutToJson,
  importLayoutFromJson,
  loadActiveLayout,
  resetToSavedLayout,
  restoreDefaultLayout,
  saveActiveLayout,
  savePreset,
} from "@/lib/invoice/layout-store";
import { LayoutToolbar } from "./LayoutToolbar";
import { LayoutCanvas } from "./LayoutCanvas";
import { FieldsList } from "./FieldsList";
import { FieldInspector } from "./FieldInspector";
import { PdfPreview } from "../PdfPreview";

const createInitialLayout = (type: InvoiceType) => createDefaultLayout(type);

// Mock sample invoice data for realistic layout previewing and printing
function createSampleInvoice(type: InvoiceType): InvoiceData {
  return {
    id: `sample_${type}`,
    type,
    status: "draft",
    updatedAt: new Date().toISOString(),
    invoiceNumber: type === "charge" ? "CHG-10245" : "CSH-20412",
    date: "10/27/2026",
    customer: "Acme Corporation Philippines Inc.",
    tin: "123-456-789-000",
    address: "123 Business Boulevard, Makati City, Metro Manila",
    terms: type === "charge" ? "30 Days" : "Cash on Delivery",
    dueDate: "11/26/2026",
    poNumber: "PO-99201",
    salesRep: "Juan Dela Cruz",
    wht1Rate: "1",
    wht1Enabled: true,
    wht2Rate: "5",
    wht2Enabled: true,
    whtRate: "1",
    items: [
      {
        id: "1",
        item: "ITM-001",
        description: "Industrial Water Filter Replacement Cartridge 10-inch",
        qty: "10",
        unitPrice: "1000",
      },
      {
        id: "2",
        item: "ITM-002",
        description: "Pressure Gauge Assembly 0-100 PSI Stainless",
        qty: "2",
        unitPrice: "3000",
      },
      {
        id: "3",
        item: "ITM-003",
        description: "Brass Ball Valve Female to Female 1-inch NPT",
        qty: "5",
        unitPrice: "850",
      },
      {
        id: "4",
        item: "ITM-004",
        description: "Heavy Duty Chemical Hose 5 meters with Couplers",
        qty: "1",
        unitPrice: "4200",
      },
    ],
  };
}

export function InvoiceLayoutEditor({
  initialType = "charge",
}: {
  initialType?: InvoiceType;
  onBackToConverter?: () => void;
}) {
  const [layout, setLayout] = useState<InvoiceLayout>(() => createInitialLayout(initialType));
  const hydrated = useRef(false);
  const dirty = useRef(false);
  const latestLayout = useRef(layout);
  const [saveState, setSaveState] = useState("Saved in this browser");
  latestLayout.current = layout;
  useEffect(() => {
    const loaded = loadActiveLayout(initialType);
    setLayout(loaded);
    setHistory([loaded]);
    setHistoryIndex(0);
    hydrated.current = true;
  }, [initialType]);
  useEffect(() => {
    if (!hydrated.current || !dirty.current) return;
    setSaveState("Saving…");
    const timer = setTimeout(() => {
      try {
        saveActiveLayout(layout);
        dirty.current = false;
        setSaveState("Saved in this browser");
      } catch (error) {
        setSaveState("Not saved");
        toast.error(error instanceof Error ? error.message : "Could not save layout.");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [layout]);
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      try {
        saveActiveLayout(latestLayout.current);
        dirty.current = false;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save layout.");
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(0.9);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"canvas" | "pdf">("canvas");

  // Automatic debounced persistence to browser localStorage
  useEffect(() => {
    autoSaveLayout(layout);
  }, [layout]);

  // Undo / Redo history stacks
  const [history, setHistory] = useState<InvoiceLayout[]>([createInitialLayout(initialType)]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // File input ref for importing JSON layout
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize when switching between Charge and Cash invoice types
  const handleSelectType = useCallback((type: InvoiceType) => {
    if (dirty.current) {
      try {
        saveActiveLayout(latestLayout.current);
        dirty.current = false;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save layout.");
        return;
      }
    }
    const loaded = loadActiveLayout(type);
    setLayout(loaded);
    setSelectedFieldId(null);
    setHistory([loaded]);
    setHistoryIndex(0);
  }, []);

  const pushState = useCallback(
    (newLayout: InvoiceLayout) => {
      dirty.current = true;
      setLayout(newLayout);
      setHistory((prev) => {
        const upToCurrent = prev.slice(0, historyIndex + 1);
        return [...upToCurrent, newLayout].slice(-40); // keep up to 40 states
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 39));
    },
    [historyIndex],
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    const next = history[nextIndex];
    if (!next) return;
    dirty.current = true;
    setLayout(next);
  }, [canUndo, history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    const next = history[nextIndex];
    if (!next) return;
    dirty.current = true;
    setLayout(next);
  }, [canRedo, history, historyIndex]);

  // Keyboard shortcut listener for Ctrl+Z and Ctrl+Y
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleRedo]);

  // Update a single field
  const handleUpdateField = useCallback(
    (updatedField: LayoutField) => {
      const nextFields = layout.fields.map((f) => (f.id === updatedField.id ? updatedField : f));
      pushState({
        ...layout,
        fields: nextFields,
        updatedAt: new Date().toISOString(),
      });
    },
    [layout, pushState],
  );

  // Duplicate an existing field
  const handleDuplicateField = useCallback(
    (field: LayoutField) => {
      const newFieldId = `custom_${Date.now()}`;
      const newField: LayoutField = {
        ...field,
        id: newFieldId,
        name: `${field.name} (Copy)`,
        type: "customText",
        category: "custom",
        x: Math.min(layout.pageWidthMm - field.w, field.x + 5),
        y: Math.min(layout.pageHeightMm - field.h, field.y + 5),
        zIndex: layout.fields.length + 1,
        staticText: field.sampleValue || field.name,
      };
      pushState({
        ...layout,
        fields: [...layout.fields, newField],
      });
      setSelectedFieldId(newFieldId);
      toast.success(`Duplicated "${field.name}"`);
    },
    [layout, pushState],
  );

  // Delete a field or hide it if it is a standard field
  const handleDeleteField = useCallback(
    (fieldId: string) => {
      const target = layout.fields.find((f) => f.id === fieldId);
      if (!target) return;

      if (target.type === "customText") {
        // Permanently remove custom field
        const nextFields = layout.fields.filter((f) => f.id !== fieldId);
        pushState({
          ...layout,
          fields: nextFields,
        });
        setSelectedFieldId(null);
        toast.info(`Deleted custom field "${target.name}"`);
      } else {
        // Hide standard field
        const nextFields = layout.fields.map((f) =>
          f.id === fieldId ? { ...f, visible: false } : f,
        );
        pushState({
          ...layout,
          fields: nextFields,
        });
        setSelectedFieldId(null);
        toast.info(`Hidden field "${target.name}". You can re-enable it from the fields list.`);
      }
    },
    [layout, pushState],
  );

  // Toggle field visibility directly from the left sidebar
  const handleToggleVisibility = useCallback(
    (fieldId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const nextFields = layout.fields.map((f) =>
        f.id === fieldId ? { ...f, visible: !f.visible } : f,
      );
      pushState({
        ...layout,
        fields: nextFields,
      });
    },
    [layout, pushState],
  );

  // Reset a specific field to its default coordinates
  const handleResetFieldPosition = useCallback(
    (fieldId: string) => {
      const defaults =
        layout.invoiceType === "charge" ? getDefaultChargeFields() : getDefaultCashFields();
      const defaultMatch = defaults.find((f) => f.id === fieldId);
      if (!defaultMatch) return;

      const target = layout.fields.find((f) => f.id === fieldId);
      if (!target) return;

      handleUpdateField({
        ...target,
        x: defaultMatch.x,
        y: defaultMatch.y,
        w: defaultMatch.w,
        h: defaultMatch.h,
        fontFamily: defaultMatch.fontFamily ?? "Liberation Serif",
        fontSize: defaultMatch.fontSize,
        fontWeight: defaultMatch.fontWeight,
        align: defaultMatch.align,
        color: defaultMatch.color,
      });
      toast.success(`Reset ${target.name} to template defaults.`);
    },
    [layout, handleUpdateField],
  );

  // Add a new custom static text field
  const handleAddCustomField = useCallback(() => {
    const newId = `custom_${Date.now()}`;
    const newField: LayoutField = {
      id: newId,
      name: "Custom Label / Note",
      type: "customText",
      category: "custom",
      x: 20.0,
      y: 100.0,
      w: 60.0,
      h: 8.0,
      fontSize: 9,
      fontWeight: "normal",
      align: "left",
      color: "#0d1329",
      visible: true,
      zIndex: layout.fields.length + 1,
      staticText: "Custom text note...",
      sampleValue: "Custom text note...",
    };
    pushState({
      ...layout,
      fields: [...layout.fields, newField],
    });
    setSelectedFieldId(newId);
    toast.success("Added new custom text field.");
  }, [layout, pushState]);

  // Toggle page orientation (Letter portrait vs landscape)
  const handleToggleOrientation = useCallback(() => {
    const isPortrait = layout.orientation === "portrait";
    const newOrientation = isPortrait ? "landscape" : "portrait";
    pushState({
      ...layout,
      orientation: newOrientation,
      pageWidthMm: isPortrait ? LETTER_HEIGHT_MM : LETTER_WIDTH_MM,
      pageHeightMm: isPortrait ? LETTER_WIDTH_MM : LETTER_HEIGHT_MM,
    });
    toast.info(`Orientation changed to Letter ${newOrientation}.`);
  }, [layout, pushState]);

  // Save layout permanently to localStorage
  const handleSaveLayout = useCallback(() => {
    try {
      saveActiveLayout(layout);
      dirty.current = false;
      setSaveState("Saved in this browser");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save layout.");
      return;
    }
    toast.success(
      `Saved ${layout.name} for ${layout.invoiceType === "charge" ? "Charge" : "Cash"} invoices.`,
    );
  }, [layout]);

  // Save As a named preset
  const handleSaveAsPreset = useCallback(() => {
    const name = window.prompt("Enter a name for this custom layout preset:", layout.name);
    if (!name || !name.trim()) return;
    savePreset(name, layout);
    saveActiveLayout({ ...layout, name: name.trim() });
    toast.success(`Saved layout preset: "${name.trim()}".`);
  }, [layout]);

  // Reset layout to last saved version in localStorage
  const handleResetLayout = useCallback(() => {
    if (!window.confirm("Discard pending changes and reload the last saved layout?")) return;
    dirty.current = false;
    const reset = resetToSavedLayout(layout.invoiceType);
    setLayout(reset);
    setSelectedFieldId(null);
    setHistory([reset]);
    setHistoryIndex(0);
    toast.info("Reset layout to last saved state.");
  }, [layout.invoiceType]);

  // Restore factory default coordinates
  const handleRestoreDefault = useCallback(() => {
    if (
      !window.confirm(
        `Are you sure you want to restore default template coordinates for ${
          layout.invoiceType === "charge" ? "Charge" : "Cash"
        } Invoice? This replaces the saved layout in this browser.`,
      )
    ) {
      return;
    }
    let def: InvoiceLayout;
    try {
      def = restoreDefaultLayout(layout.invoiceType);
      dirty.current = false;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset layout.");
      return;
    }
    setLayout(def);
    setSelectedFieldId(null);
    setHistory([def]);
    setHistoryIndex(0);
    toast.success("Restored factory default coordinates.");
  }, [layout.invoiceType]);

  // Export JSON
  const handleExportJson = useCallback(() => {
    const json = exportLayoutToJson(layout);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sos_${layout.invoiceType}_layout_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast.success("Exported layout to JSON.");
  }, [layout]);

  // Import JSON
  const handleImportJson = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const content = ev.target?.result as string;
          const imported = importLayoutFromJson(content, layout.invoiceType);
          pushState(imported);
          toast.success(`Imported layout: ${imported.name}`);
        } catch {
          toast.error("Failed to parse imported JSON layout file.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [layout.invoiceType, pushState],
  );

  const selectedField = useMemo(
    () => layout.fields.find((f) => f.id === selectedFieldId) || null,
    [layout.fields, selectedFieldId],
  );

  const sampleInvoice = useMemo(
    () => createSampleInvoice(layout.invoiceType),
    [layout.invoiceType],
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={onFileInputChange}
      />

      {/* Top Toolbar */}
      <LayoutToolbar
        layout={layout}
        onSelectType={handleSelectType}
        onToggleOrientation={handleToggleOrientation}
        onSaveLayout={handleSaveLayout}
        onSaveAsPreset={handleSaveAsPreset}
        onResetLayout={handleResetLayout}
        onRestoreDefault={handleRestoreDefault}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        zoom={zoom}
        onZoomChange={setZoom}
        snapToGrid={snapToGrid}
        onToggleSnap={() => setSnapToGrid((v) => !v)}
        onToggleBackground={() =>
          pushState({ ...layout, showBackgroundTemplate: !layout.showBackgroundTemplate })
        }
        onOpacityChange={(opacity) => pushState({ ...layout, backgroundOpacity: opacity })}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <p className="border-b px-4 py-1 text-xs text-muted-foreground" role="status">
        {saveState} · Layouts stay on this browser/device and may be lost if browser data is
        cleared.
      </p>
      {/* Main Workspace Body */}
      {viewMode === "canvas" ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar: Fields List */}
          <aside className="w-64 shrink-0 border-r bg-card">
            <FieldsList
              fields={layout.fields}
              selectedFieldId={selectedFieldId}
              onSelectField={setSelectedFieldId}
              onToggleVisibility={handleToggleVisibility}
              onAddCustomField={handleAddCustomField}
            />
          </aside>

          {/* Center Canvas */}
          <main className="relative flex flex-1 overflow-hidden">
            <LayoutCanvas
              layout={layout}
              selectedFieldId={selectedFieldId}
              onSelectField={setSelectedFieldId}
              onUpdateField={handleUpdateField}
              zoom={zoom}
              snapToGrid={snapToGrid}
            />
          </main>

          {/* Right Sidebar: Field Inspector */}
          <aside className="w-80 shrink-0 border-l bg-card">
            <FieldInspector
              layout={layout}
              field={selectedField}
              onUpdateField={handleUpdateField}
              onDuplicateField={handleDuplicateField}
              onDeleteField={handleDeleteField}
              onResetFieldPosition={handleResetFieldPosition}
            />
          </aside>
        </div>
      ) : (
        /* Real Synchronized Letter PDF Output */
        <div className="flex-1 overflow-hidden p-4">
          <PdfPreview invoice={sampleInvoice} customLayout={layout} />
        </div>
      )}
    </div>
  );
}
