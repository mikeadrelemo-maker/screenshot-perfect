import {
  createDefaultLayout,
  LETTER_WIDTH_MM,
  LETTER_HEIGHT_MM,
  type InvoiceLayout,
  type LayoutField,
} from "./layout-types";
import type { InvoiceType } from "./types";

export const KEY_CHARGE_V1 = "sos_invoice_layout_charge_v1";
export const KEY_CASH_V1 = "sos_invoice_layout_cash_v1";
export const KEY_CHARGE_LEGACY = "sos_invoice_layout_charge";
export const KEY_CASH_LEGACY = "sos_invoice_layout_cash";
export const KEY_PRESETS = "sos_invoice_layout_presets";

export function storageKeyForType(type: InvoiceType): string {
  return type === "charge" ? KEY_CHARGE_V1 : KEY_CASH_V1;
}

export function legacyStorageKeyForType(type: InvoiceType): string {
  return type === "charge" ? KEY_CHARGE_LEGACY : KEY_CASH_LEGACY;
}

/** Sanitize and reconcile a loaded layout against defaults to ensure no fields are missing */
export function reconcileLayout(loaded: Partial<InvoiceLayout>, type: InvoiceType): InvoiceLayout {
  if (!loaded || typeof loaded !== "object" || Array.isArray(loaded))
    throw new Error("Layout must be an object.");
  const fallback = createDefaultLayout(type);
  const finite = (v: unknown, def: number, min = 0, max = 1000): number =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : def;
  const fieldsMap = new Map<string, LayoutField>();

  // Add loaded fields
  if (Array.isArray(loaded.fields)) {
    loaded.fields.forEach((f) => {
      const base = fallback.fields.find((field) => field.id === f?.id);
      const validTypes = new Set(fallback.fields.map((field) => field.type));
      validTypes.add("customText");
      if (f && typeof f.id === "string" && (base || validTypes.has(f.type))) {
        const pageW = loaded.orientation === "landscape" ? LETTER_HEIGHT_MM : LETTER_WIDTH_MM;
        const pageH = loaded.orientation === "landscape" ? LETTER_WIDTH_MM : LETTER_HEIGHT_MM;
        const w = finite(f.w, base?.w ?? 30, 0.1, pageW);
        const h = finite(f.h, base?.h ?? 6, 0.1, pageH);
        fieldsMap.set(f.id, {
          ...base,
          ...f,
          name: typeof f.name === "string" ? f.name : (base?.name ?? "Custom field"),
          type: base?.type ?? f.type,
          category: base?.category ?? "custom",
          x: Math.min(finite(f.x, base?.x ?? 10, 0, pageW), pageW - w),
          y: Math.min(finite(f.y, base?.y ?? 10, 0, pageH), pageH - h),
          w,
          h,
          fontFamily:
            f.fontFamily === "DejaVu Sans" || f.fontFamily === "Times New Roman" || f.fontFamily === "Liberation Serif"
              ? f.fontFamily
              : (base?.fontFamily ?? "Liberation Serif"),
          fontSize: finite(f.fontSize, 8, 4, 72),
          fontWeight: f.fontWeight === "bold" ? "bold" : "normal",
          align: f.align === "center" || f.align === "right" ? f.align : "left",
          color:
            typeof f.color === "string" && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : "#0d1329",
          visible: f.visible !== false,
          wrapText: f.wrapText === true,
          staticText: typeof f.staticText === "string" ? f.staticText : undefined,
          sampleValue: typeof f.sampleValue === "string" ? f.sampleValue : base?.sampleValue,
          zIndex: finite(f.zIndex, 1, 0, 10000),
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
    id: typeof loaded.id === "string" ? loaded.id : fallback.id,
    name: typeof loaded.name === "string" ? loaded.name : fallback.name,
    invoiceType: type,
    paperSize: "letter",
    orientation,
    pageWidthMm: isLandscape ? LETTER_HEIGHT_MM : LETTER_WIDTH_MM,
    pageHeightMm: isLandscape ? LETTER_WIDTH_MM : LETTER_HEIGHT_MM,
    marginsMm: {
      top: finite(loaded.marginsMm?.top, fallback.marginsMm.top, 0, 100),
      bottom: finite(loaded.marginsMm?.bottom, fallback.marginsMm.bottom, 0, 100),
      left: finite(loaded.marginsMm?.left, fallback.marginsMm.left, 0, 100),
      right: finite(loaded.marginsMm?.right, fallback.marginsMm.right, 0, 100),
    },
    // The template background is a positioning guide for the editor only — never for print.
    showBackgroundTemplate: loaded.showBackgroundTemplate === true ? true : false,
    backgroundOpacity:
      typeof loaded.backgroundOpacity === "number" &&
      loaded.backgroundOpacity >= 0 &&
      loaded.backgroundOpacity <= 1
        ? loaded.backgroundOpacity
        : 1.0,
    tableConfig: {
      rowTopMm: finite(loaded.tableConfig?.rowTopMm, fallback.tableConfig.rowTopMm, 0, 250),
      rowHeightMm: finite(loaded.tableConfig?.rowHeightMm, fallback.tableConfig.rowHeightMm, 1, 30),
      rowCount: Math.floor(
        finite(loaded.tableConfig?.rowCount, fallback.tableConfig.rowCount, 1, 100),
      ),
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
    // 1. Try versioned key first
    let raw = localStorage.getItem(storageKeyForType(type));
    // 2. Fallback to legacy key if versioned key not yet set
    if (!raw) {
      raw = localStorage.getItem(legacyStorageKeyForType(type));
    }
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
  const updated = { ...layout, updatedAt: new Date().toISOString() };
  try {
    const serialized = JSON.stringify(updated);
    // Write to versioned key
    localStorage.setItem(storageKeyForType(layout.invoiceType), serialized);
    // Also mirror to legacy key for backwards compatibility
    localStorage.setItem(legacyStorageKeyForType(layout.invoiceType), serialized);
  } catch {
    throw new Error(
      "Layout could not be saved in this browser. Storage may be full or disabled; export the layout to keep a copy.",
    );
  }
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced auto-save layout to localStorage */
export function autoSaveLayout(layout: InvoiceLayout, delayMs = 800): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveActiveLayout(layout);
  }, delayMs);
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
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((preset) => {
      if (
        !preset ||
        typeof preset.id !== "string" ||
        typeof preset.name !== "string" ||
        !preset.layout
      )
        return [];
      try {
        return [
          {
            ...preset,
            layout: reconcileLayout(
              preset.layout,
              preset.layout.invoiceType === "cash" ? "cash" : "charge",
            ),
          },
        ];
      } catch {
        return [];
      }
    });
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
