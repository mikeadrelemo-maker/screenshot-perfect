import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { emptyInvoice } from "./types";
import { parseSosTokens } from "./parse";
import { createDefaultLayout } from "./layout-types";
import { importLayoutFromJson, loadActiveLayout, saveActiveLayout } from "./layout-store";
import { renderInvoicePdf } from "./render";

beforeEach(() => { localStorage.clear(); });

describe("Invoice output requirements", () => {
  it("defaults to independently enabled 1% and 5% taxes", () => {
    const inv = emptyInvoice();
    expect(inv.whtRate).toBe("1");
    expect(inv.whtRate2).toBe("5");
    expect(inv.whtEnabled).toBe(true);
    expect(inv.whtEnabled2).toBe(true);
  });
  it("retains CHI-2028 as source data but leaves printable number blank", () => {
    const { invoice } = parseSosTokens([{ str: "CHI-2028", x: 200, y: 450, w: 60 }]);
    expect(invoice.sourceInvoiceNumber).toBe("CHI-2028");
    expect(invoice.invoiceNumber).toBe("");
    expect(invoice.address).toBe("");
    expect(invoice.poNumber).toBe("");
  });
  it("detects Cash using the source number without printing it", () => {
    const { invoice } = parseSosTokens([{ str: "CI-2028", x: 200, y: 450, w: 60 }]);
    expect(invoice.type).toBe("cash");
    expect(invoice.invoiceNumber).toBe("");
  });
  it("restores all custom field settings separately without writing defaults", () => {
    const charge = createDefaultLayout("charge");
    const cash = createDefaultLayout("cash");
    charge.fields = charge.fields.map((f) => f.type === "customer" ? {
      ...f, x: 70, y: 65, w: 80, h: 12, fontFamily: "DejaVu Sans", fontSize: 11,
      fontWeight: "bold", align: "center", wrapText: true, visible: false,
    } : f);
    saveActiveLayout(charge); saveActiveLayout(cash);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const restored = loadActiveLayout("charge").fields.find((f) => f.type === "customer");
    expect(restored).toMatchObject({ x: 70, y: 65, w: 80, h: 12, fontFamily: "DejaVu Sans", fontSize: 11, fontWeight: "bold", align: "center", wrapText: true, visible: false });
    expect(loadActiveLayout("cash").fields.find((f) => f.type === "customer")?.x).toBe(45);
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });
  it("recovers from corrupted and missing browser layouts", () => {
    localStorage.setItem("sos_invoice_layout_charge", "{broken");
    expect(loadActiveLayout("charge").pageWidthMm).toBe(215.9);
    expect(loadActiveLayout("cash").pageHeightMm).toBe(279.4);
    localStorage.setItem("sos_invoice_layout_charge", "null");
    expect(loadActiveLayout("charge").fields.some((f) => f.type === "wht2")).toBe(true);
  });
  it("validates unsafe stored positions, typography and row counts", () => {
    const layout = createDefaultLayout("cash");
    const field = layout.fields[0];
    if (!field) throw new Error("Missing default serial field");
    const imported = importLayoutFromJson(JSON.stringify({ ...layout, tableConfig: { rowCount: 0, rowHeightMm: -4 }, fields: [{ ...field, x: -100, fontSize: "bad", color: "bad", w: -5 }] }), "charge");
    expect(imported.invoiceType).toBe("charge");
    expect(imported.tableConfig.rowCount).toBe(10);
    expect(imported.tableConfig.rowHeightMm).toBe(6.3);
    expect(imported.fields[0]?.x).toBe(164.5);
    expect(imported.fields[0]?.fontSize).toBe(8);
    expect(imported.fields[0]?.fontFamily).toBe("Liberation Serif");
    expect(() => importLayoutFromJson("[]", "charge")).toThrow();
  });
  for (const type of ["charge", "cash"] as const) {
    it(`generates a one-page embedded-font ${type} PDF with empty optional fields`, async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        const filename = url.split("/").pop();
        const bytes = await readFile(`public/fonts/${filename}`);
        return new Response(bytes);
      });
      try {
        const inv = emptyInvoice(type);
        inv.customer = "Igacos Water District";
        inv.items = [{ id: "1", item: "Filter", description: "Filter", qty: "17", unitPrice: "3545.98225" }];
        const bytes = await renderInvoicePdf(inv, createDefaultLayout(type));
        const pdf = await PDFDocument.load(bytes);
        expect(pdf.getPageCount()).toBe(1);
        expect(pdf.getPage(0).getWidth()).toBeCloseTo(612);
        expect(pdf.getPage(0).getHeight()).toBeCloseTo(792);
        expect(bytes.length).toBeGreaterThan(10000);
        expect(pdf.getPage(0).node.Resources()?.lookupMaybe).toBeDefined();
      } finally { fetchMock.mockRestore(); }
    });
  }
});