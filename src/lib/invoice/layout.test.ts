import { describe, it, expect, beforeEach } from "vitest";
import {
  createDefaultLayout,
  LETTER_WIDTH_MM,
  LETTER_HEIGHT_MM,
  mmToPt,
  type LayoutField,
} from "./layout-types";
import {
  loadActiveLayout,
  saveActiveLayout,
  restoreDefaultLayout,
  savePreset,
  loadPresets,
} from "./layout-store";
import { calcTotals, peso } from "./calc";
import type { LineItem } from "./types";

describe("Invoice Layout System & Print Specifications", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should create default layout with US Letter dimensions", () => {
    const chargeLayout = createDefaultLayout("charge");
    expect(chargeLayout.paperSize).toBe("letter");
    expect(chargeLayout.orientation).toBe("portrait");
    expect(chargeLayout.pageWidthMm).toBe(LETTER_WIDTH_MM); // 215.9 mm
    expect(chargeLayout.pageHeightMm).toBe(LETTER_HEIGHT_MM); // 279.4 mm

    // Verify PDF point conversion matches standard 8.5 x 11 in (612 x 792 pt)
    const widthPt = mmToPt(chargeLayout.pageWidthMm);
    const heightPt = mmToPt(chargeLayout.pageHeightMm);
    expect(Math.round(widthPt)).toBe(612);
    expect(Math.round(heightPt)).toBe(792);
  });

  it("should maintain separate layouts for Charge and Cash invoices", () => {
    const chargeLayout = createDefaultLayout("charge");
    const cashLayout = createDefaultLayout("cash");

    expect(chargeLayout.invoiceType).toBe("charge");
    expect(cashLayout.invoiceType).toBe("cash");

    const chargeSerial = chargeLayout.fields.find((f) => f.type === "invoiceNumber");
    const cashSerial = cashLayout.fields.find((f) => f.type === "invoiceNumber");

    expect(chargeSerial).toBeDefined();
    expect(cashSerial).toBeDefined();
    // Default coordinates are individually calibrated for their respective forms
    expect(chargeSerial?.x).not.toEqual(cashSerial?.x);
  });

  it("should contain all mandatory independently movable fields", () => {
    const layout = createDefaultLayout("charge");
    const fieldTypes = layout.fields.map((f) => f.type);

    // Verify all mandatory fields are present
    expect(fieldTypes).toContain("customer");
    expect(fieldTypes).toContain("address");
    expect(fieldTypes).toContain("invoiceNumber");
    expect(fieldTypes).toContain("date");
    expect(fieldTypes).toContain("colItem");
    expect(fieldTypes).toContain("colDesc");
    expect(fieldTypes).toContain("colQty");
    expect(fieldTypes).toContain("colUnit");
    expect(fieldTypes).toContain("colAmount");
    expect(fieldTypes).toContain("totalSales");
    expect(fieldTypes).toContain("vat");
    expect(fieldTypes).toContain("net");
    expect(fieldTypes).toContain("wht");
    expect(fieldTypes).toContain("due");
  });

  it("allows moving fields independently without mutating other fields", () => {
    const layout = createDefaultLayout("charge");
    const originalCustomer = layout.fields.find((f) => f.type === "customer")!;
    const originalDue = layout.fields.find((f) => f.type === "due")!;

    // Move customer field
    const updatedCustomer: LayoutField = {
      ...originalCustomer,
      x: originalCustomer.x + 20,
      y: originalCustomer.y + 15,
      fontSize: 12,
    };

    const newFields = layout.fields.map((f) => (f.id === updatedCustomer.id ? updatedCustomer : f));
    const newLayout = { ...layout, fields: newFields };

    const fetchedCustomer = newLayout.fields.find((f) => f.type === "customer")!;
    const fetchedDue = newLayout.fields.find((f) => f.type === "due")!;

    expect(fetchedCustomer.x).toBe(originalCustomer.x + 20);
    expect(fetchedCustomer.y).toBe(originalCustomer.y + 15);
    expect(fetchedCustomer.fontSize).toBe(12);

    // TOTAL AMOUNT DUE position must remain strictly untouched
    expect(fetchedDue.x).toBe(originalDue.x);
    expect(fetchedDue.y).toBe(originalDue.y);
  });

  it("persists saved layout in localStorage and restores defaults", () => {
    const initial = loadActiveLayout("charge");
    const customField = {
      ...initial.fields[0]!,
      x: 99.5,
      y: 88.5,
    };
    const modified = {
      ...initial,
      fields: initial.fields.map((f) => (f.id === customField.id ? customField : f)),
    };

    saveActiveLayout(modified);

    const loaded = loadActiveLayout("charge");
    const loadedFirst = loaded.fields.find((f) => f.id === customField.id)!;
    expect(loadedFirst.x).toBe(99.5);
    expect(loadedFirst.y).toBe(88.5);

    // Restore defaults
    const restored = restoreDefaultLayout("charge");
    const restoredFirst = restored.fields.find((f) => f.id === customField.id)!;
    expect(restoredFirst.x).toBe(initial.fields[0]!.x);
  });

  it("saves and manages custom layout presets", () => {
    const layout = createDefaultLayout("charge");
    savePreset("Custom Continuous Paper", layout);

    const presets = loadPresets();
    expect(presets.length).toBe(1);
    expect(presets[0]?.name).toBe("Custom Continuous Paper");
    expect(presets[0]?.layout.invoiceType).toBe("charge");
  });

  it("guarantees moving and styling layout fields never affects invoice calculations", () => {
    const items: LineItem[] = [
      { id: "1", item: "ITM1", description: "Filter", qty: "10", unitPrice: "100" },
      { id: "2", item: "ITM2", description: "Valve", qty: "5", unitPrice: "200" },
    ];

    // Standard calculations before layout changes
    const totalsBefore = calcTotals(items, "1");

    // Move fields around and change typography
    const layout = createDefaultLayout("charge");
    layout.fields.forEach((f) => {
      f.x += 50;
      f.y += 50;
      f.fontSize = 24;
      f.fontWeight = "bold";
      f.color = "#ff0000";
    });

    // Perform calculations again
    const totalsAfter = calcTotals(items, "1");

    expect(totalsBefore.totalSales.toString()).toBe(totalsAfter.totalSales.toString());
    expect(totalsBefore.vat.toString()).toBe(totalsAfter.vat.toString());
    expect(totalsBefore.net.toString()).toBe(totalsAfter.net.toString());
    expect(totalsBefore.wht.toString()).toBe(totalsAfter.wht.toString());
    expect(totalsBefore.due.toString()).toBe(totalsAfter.due.toString());

    // Verify calculation rules: 10 * 112 + 5 * 224 = 2240
    expect(peso(totalsAfter.totalSales)).toBe("₱2,240.00");
  });
});
