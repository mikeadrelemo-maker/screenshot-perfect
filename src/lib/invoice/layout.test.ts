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
import { emptyInvoice, type LineItem, type InvoiceData } from "./types";

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
    expect(fieldTypes).toContain("wht1");
    expect(fieldTypes).toContain("wht2");
    expect(fieldTypes).toContain("whtRate");
    expect(fieldTypes).toContain("whtRate2");
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

  it("persists saved layouts when opening different invoices or refreshing", () => {
    // 1. Customize and save Charge layout
    const chargeLayout = loadActiveLayout("charge");
    const customChargeCustomer = {
      ...chargeLayout.fields.find((f) => f.type === "customer")!,
      x: 55.5,
      y: 66.5,
      fontSize: 14,
    };
    saveActiveLayout({
      ...chargeLayout,
      fields: chargeLayout.fields.map((f) =>
        f.id === customChargeCustomer.id ? customChargeCustomer : f,
      ),
    });

    // 2. Customize and save Cash layout
    const cashLayout = loadActiveLayout("cash");
    const customCashCustomer = {
      ...cashLayout.fields.find((f) => f.type === "customer")!,
      x: 44.2,
      y: 77.8,
      fontSize: 11,
    };
    saveActiveLayout({
      ...cashLayout,
      fields: cashLayout.fields.map((f) =>
        f.id === customCashCustomer.id ? customCashCustomer : f,
      ),
    });

    // 3. Simulate opening Invoice A (Charge)
    const activeCharge = loadActiveLayout("charge");
    const chargeCustField = activeCharge.fields.find((f) => f.type === "customer")!;
    expect(chargeCustField.x).toBe(55.5);
    expect(chargeCustField.y).toBe(66.5);
    expect(chargeCustField.fontSize).toBe(14);

    // 4. Simulate opening Invoice B (Cash)
    const activeCash = loadActiveLayout("cash");
    const cashCustField = activeCash.fields.find((f) => f.type === "customer")!;
    expect(cashCustField.x).toBe(44.2);
    expect(cashCustField.y).toBe(77.8);
    expect(cashCustField.fontSize).toBe(11);

    // 5. Simulate opening Invoice C (another Charge invoice) - layout remains intact
    const activeChargeAgain = loadActiveLayout("charge");
    const chargeCustAgain = activeChargeAgain.fields.find((f) => f.type === "customer")!;
    expect(chargeCustAgain.x).toBe(55.5);
    expect(chargeCustAgain.y).toBe(66.5);
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

  describe("Section 6 Layout Designer Verification Requirements", () => {
    it("1. moves Customer Name and persists new X, Y coordinates", () => {
      const charge = loadActiveLayout("charge");
      const cust = charge.fields.find((f) => f.type === "customer")!;
      const moved = {
        ...charge,
        fields: charge.fields.map((f) => (f.id === cust.id ? { ...f, x: 52.5, y: 48.0 } : f)),
      };
      saveActiveLayout(moved);

      const reloaded = loadActiveLayout("charge");
      const reloadedCust = reloaded.fields.find((f) => f.type === "customer")!;
      expect(reloadedCust.x).toBe(52.5);
      expect(reloadedCust.y).toBe(48.0);
    });

    it("2. resizes DESCRIPTION and AMOUNT fields and confirms saved dimensions match", () => {
      const charge = loadActiveLayout("charge");
      const updated = {
        ...charge,
        fields: charge.fields.map((f) => {
          if (f.type === "colDesc") return { ...f, w: 115.5, h: 70.0 };
          if (f.type === "colAmount") return { ...f, w: 28.0, h: 70.0 };
          return f;
        }),
      };
      saveActiveLayout(updated);

      const reloaded = loadActiveLayout("charge");
      const desc = reloaded.fields.find((f) => f.type === "colDesc")!;
      const amt = reloaded.fields.find((f) => f.type === "colAmount")!;
      expect(desc.w).toBe(115.5);
      expect(desc.h).toBe(70.0);
      expect(amt.w).toBe(28.0);
      expect(amt.h).toBe(70.0);
    });

    it("3. changes the font family of one field and verifies that only that field changes", () => {
      const charge = loadActiveLayout("charge");
      const custBefore = charge.fields.find((f) => f.type === "customer")!;
      const dueBefore = charge.fields.find((f) => f.type === "due")!;

      const updated = {
        ...charge,
        fields: charge.fields.map((f) =>
          f.type === "customer" ? { ...f, fontFamily: "Times New Roman" as const } : f,
        ),
      };
      saveActiveLayout(updated);

      const reloaded = loadActiveLayout("charge");
      const custAfter = reloaded.fields.find((f) => f.type === "customer")!;
      const dueAfter = reloaded.fields.find((f) => f.type === "due")!;

      expect(custAfter.fontFamily).toBe("Times New Roman");
      expect(dueAfter.fontFamily).toBe(dueBefore.fontFamily);
    });

    it("4. changes font size, weight, alignment, and line height and confirms properties match", () => {
      const cash = loadActiveLayout("cash");
      const updated = {
        ...cash,
        fields: cash.fields.map((f) =>
          f.type === "totalSales"
            ? {
                ...f,
                fontFamily: "Arial" as const,
                fontSize: 11,
                fontWeight: "bold" as const,
                align: "center" as const,
                lineHeight: 1.25,
              }
            : f,
        ),
      };
      saveActiveLayout(updated);

      const reloaded = loadActiveLayout("cash");
      const ts = reloaded.fields.find((f) => f.type === "totalSales")!;
      expect(ts.fontFamily).toBe("Arial");
      expect(ts.fontSize).toBe(11);
      expect(ts.fontWeight).toBe("bold");
      expect(ts.align).toBe("center");
      expect(ts.lineHeight).toBe(1.25);
    });

    it("5 & 6. keeps Charge and Cash layouts separate and unchanged when opening another invoice", () => {
      // Customize Charge
      const chg = loadActiveLayout("charge");
      saveActiveLayout({
        ...chg,
        fields: chg.fields.map((f) => (f.type === "date" ? { ...f, x: 155.0 } : f)),
      });

      // Customize Cash
      const csh = loadActiveLayout("cash");
      saveActiveLayout({
        ...csh,
        fields: csh.fields.map((f) => (f.type === "date" ? { ...f, x: 140.0 } : f)),
      });

      // Simulate opening different invoices
      const invA = { ...emptyInvoice("charge"), invoiceNumber: "INV-001" };
      const invB = { ...emptyInvoice("charge"), invoiceNumber: "INV-002" };
      const invC = { ...emptyInvoice("cash"), invoiceNumber: "CSH-001" };

      expect(loadActiveLayout(invA.type).fields.find((f) => f.type === "date")?.x).toBe(155.0);
      expect(loadActiveLayout(invB.type).fields.find((f) => f.type === "date")?.x).toBe(155.0);
      expect(loadActiveLayout(invC.type).fields.find((f) => f.type === "date")?.x).toBe(140.0);
    });
  });
});
