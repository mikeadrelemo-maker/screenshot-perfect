import {
  createDefaultLayout,
  LETTER_WIDTH_MM,
  LETTER_HEIGHT_MM,
  type InvoiceLayout,
  type LayoutField,
} from "./layout-types";
import type { InvoiceType } from "./types";

const KEY_CHARGE = "sos_invoice_layout_charge";
const KEY_CASH = "sos_invoice_layout_cash";
const KEY_PRESETS = "sos_invoice_layout_presets";

function storageKeyForType(type: InvoiceType): string {
  return type === "charge" ? KEY_CHARGE : KEY_CASH;
}

/** Sanitize and reconcile a loaded layout against defaults to ensure no fields are missing */
function reconcileLayout(loaded: Partial<InvoiceLayout>, type: InvoiceType): InvoiceLayout {
  const fallback = createDefaultLayout(type);
  const fieldsMap = new Map<string, LayoutField>();

  // Add loaded fields
  if (Array.isArray(loaded.fields)) {
    loaded.fields.forEach((f) => {
      if (f && typeof f.id === "string") {
        fieldsMap.set(f.id, {
          ...f,
          x: typeof f.x === "number" && !isNaN(f.x) ? f.x : 10,
          y: typeof f.y === "number" && !isNaN(f.y) ? f.y : 10,
          w: typeof f.w === "number" && f.w > 0 ? f.w : 30,
          h: typeof f.h === "number" && f.h > 0 ? f.h : 6,
          fontSize: typeof f.fontSize === "number" && f.fontSize >= 5 ? f.fontSize : 8,
          fontWeight: f.fontWeight === "bold" ? "bold" : "normal",
          align: f.align === "center" || f.align === "right" ? f.align : "left",
          color: typeof f.color === "string" ? f.color : "#0d1329",
          visible: f.visible !== false,
          zIndex: typeof f.zIndex === "number" ? f.zIndex : 1,
        });
      }
    });
  }

  // Ensure every default field exists
  fallback.fields.forEach((defaultField) => {
    if (!fieldsMap.has(defaultField.id)) {
      fieldsMap.set(defaultField.id, defaultField);
    }
  });

  const orientation = loaded.orientation === "landscape" ? "landscape" : "portrait";
  const isLandscape = orientation === "landscape";

  return {
    id: loaded.id || fallback.id,
    name: loaded.name || fallback.name,
    invoiceType: type,
    paperSize: "letter",
    orientation,
    pageWidthMm: isLandscape ? LETTER_HEIGHT_MM : LETTER_WIDTH_MM,
    pageHeightMm: isLandscape ? LETTER_WIDTH_MM : LETTER_HEIGHT_MM,
    marginsMm: {
      top:
        typeof loaded.marginsMm?.top === "number" ? loaded.marginsMm.top : fallback.marginsMm.top,
      bottom:
        typeof loaded.marginsMm?.bottom === "number"
          ? loaded.marginsMm.bottom
          : fallback.marginsMm.bottom,
      left:
        typeof loaded.marginsMm?.left === "number"
          ? loaded.marginsMm.left
          : fallback.marginsMm.left,
      right:
        typeof loaded.marginsMm?.right === "number"
          ? loaded.marginsMm.right
          : fallback.marginsMm.right,
    },
    // The template background is a positioning guide for the editor only — never for print.
    // Default to false so existing layouts that were saved with showBackgroundTemplate:true
    // also produce a clean text-only PDF output. Users can still toggle it on in the editor
    // canvas for visual alignment purposes.
    showBackgroundTemplate: loaded.showBackgroundTemplate === true ? true : false,
    backgroundOpacity:
      typeof loaded.backgroundOpacity === "number" &&
      loaded.backgroundOpacity >= 0 &&
      loaded.backgroundOpacity <= 1
        ? loaded.backgroundOpacity
        : 1.0,
    tableConfig: {
      rowTopMm:
        typeof loaded.tableConfig?.rowTopMm === "number"
          ? loaded.tableConfig.rowTopMm
          : fallback.tableConfig.rowTopMm,
      rowHeightMm:
        typeof loaded.tableConfig?.rowHeightMm === "number"
          ? loaded.tableConfig.rowHeightMm
          : fallback.tableConfig.rowHeightMm,
      rowCount:
        typeof loaded.tableConfig?.rowCount === "number"
          ? loaded.tableConfig.rowCount
          : fallback.tableConfig.rowCount,
    },
    fields: Array.from(fieldsMap.values()),
    createdAt: loaded.createdAt || fallback.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

/** Load the active layout for a given invoice type */
export function loadActiveLayout(type: InvoiceType): InvoiceLayout {
  if (typeof window === "undefined" || !window.localStorage) {
    return createDefaultLayout(type);
  }
  try {
    const raw = localStorage.getItem(storageKeyForType(type));
    if (!raw) return createDefaultLayout(type);
    const parsed = JSON.parse(raw);
    return reconcileLayout(parsed, type);
  } catch (err) {
    console.error("Failed to load invoice layout from localStorage:", err);
    return createDefaultLayout(type);
  }
}

/** Save the active layout for a given invoice type */
export function saveActiveLayout(layout: InvoiceLayout): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const updated = {
      ...layout,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKeyForType(layout.invoiceType), JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save invoice layout to localStorage:", err);
  }
}

/** Restore default factory layout for a given invoice type */
export function restoreDefaultLayout(type: InvoiceType): InvoiceLayout {
  const def = createDefaultLayout(type);
  saveActiveLayout(def);
  return def;
}

/** Reset active layout back to the last saved layout in localStorage */
export function resetToSavedLayout(type: InvoiceType): InvoiceLayout {
  return loadActiveLayout(type);
}

export interface LayoutPreset {
  id: string;
  name: string;
  layout: InvoiceLayout;
}

/** Load all user-saved presets */
export function loadPresets(): LayoutPreset[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(KEY_PRESETS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Save a named preset */
export function savePreset(name: string, layout: InvoiceLayout): LayoutPreset {
  const presets = loadPresets();
  const id = `preset_${Date.now()}`;
  const preset: LayoutPreset = {
    id,
    name: name.trim() || `Preset ${presets.length + 1}`,
    layout: {
      ...layout,
      name: name.trim() || layout.name,
      updatedAt: new Date().toISOString(),
    },
  };
  const updated = [preset, ...presets.filter((p) => p.name !== preset.name)];
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(KEY_PRESETS, JSON.stringify(updated));
  }
  return preset;
}

/** Delete a preset by id */
export function deletePreset(id: string): void {
  const presets = loadPresets();
  const filtered = presets.filter((p) => p.id !== id);
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(KEY_PRESETS, JSON.stringify(filtered));
  }
}

/** Export layout to JSON string */
export function exportLayoutToJson(layout: InvoiceLayout): string {
  return JSON.stringify(layout, null, 2);
}

/** Import layout from JSON string */
export function importLayoutFromJson(jsonStr: string, currentType: InvoiceType): InvoiceLayout {
  const parsed = JSON.parse(jsonStr);
  return reconcileLayout(parsed, currentType);
}
