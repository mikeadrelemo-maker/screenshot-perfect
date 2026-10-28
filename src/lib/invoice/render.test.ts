import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFPage } from "pdf-lib";
import { renderInvoicePdf } from "./render";
import { emptyInvoice, type InvoiceData } from "./types";
import { parseSosTokens, type TextToken } from "./parse";
import { createDefaultLayout } from "./layout-types";
import { peso } from "./calc";

async function mockFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  const filename = url.split("/").pop()!;
  const bytes = await readFile(`public/fonts/${filename}`);
  return new Response(bytes);
}

describe("Invoice PDF Rendering & Field Validation", () => {
  it("renders a Charge Invoice PDF without error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    try {
      const inv: InvoiceData = {
        ...emptyInvoice("charge"),
        customer: "Acme Corporation",
        date: "10/28/2026",
        terms: "30 Days",
        whtRate: "1",
        whtEnabled: true,
        whtRate2: "5",
        whtEnabled2: true,
        items: [
          { id: "1", item: "ITM-01", description: "Product A", qty: "2", unitPrice: "1000" },
        ],
      };
      const bytes = await renderInvoicePdf(inv, createDefaultLayout("charge"));
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(1000);
    } finally { fetchMock.mockRestore(); }
  });

  it("renders a Cash Invoice PDF without error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    try {
      const inv: InvoiceData = {
        ...emptyInvoice("cash"),
        customer: "Retail Trading Store",
        date: "10/28/2026",
        whtRate: "1",
        whtEnabled: true,
        whtRate2: "5",
        whtEnabled2: false,
        items: [
          { id: "1", item: "CSH-01", description: "Product B", qty: "5", unitPrice: "250" },
        ],
      };
      const bytes = await renderInvoicePdf(inv, createDefaultLayout("cash"));
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(1000);
    } finally { fetchMock.mockRestore(); }
  });

  it("prints only dynamic percentage (e.g. 1%, 2%) in designated withholding tax label fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    const drawnTexts: string[] = [];
    const origDrawText = PDFPage.prototype.drawText;
    const drawSpy = vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text: string, options?: any) {
      drawnTexts.push(text);
      return origDrawText.call(this, text, options);
    });

    try {
      const inv: InvoiceData = {
        ...emptyInvoice("charge"),
        customer: "Testing Tax Labels Inc.",
        date: "10/28/2026",
        whtRate: "1",
        whtEnabled: true,
        whtRate2: "2",
        whtEnabled2: true,
        items: [
          { id: "1", item: "TEST-1", description: "Service A", qty: "1", unitPrice: "1000" },
        ],
      };

      const bytes = await renderInvoicePdf(inv, createDefaultLayout("charge"));
      expect(bytes).toBeInstanceOf(Uint8Array);

      // Verify that the rate strings "1%" and "2%" are printed
      expect(drawnTexts).toContain("1%");
      expect(drawnTexts).toContain("2%");

      // Verify that verbose legacy strings are NOT printed
      expect(drawnTexts.some((t) => t.includes("Withholding Tax 1"))).toBe(false);
      expect(drawnTexts.some((t) => t.includes("Withholding Tax 2"))).toBe(false);
      expect(drawnTexts.some((t) => t.includes("Tax 1 (1%)"))).toBe(false);
      expect(drawnTexts.some((t) => t.includes("Tax 2 (2%)"))).toBe(false);

      // Amount fields should contain formatted amounts
      expect(drawnTexts.some((t) => t.startsWith("(") && t.endsWith(")"))).toBe(true);
    } finally {
      drawSpy.mockRestore();
      fetchMock.mockRestore();
    }
  });

  it("handles completely missing business address and PO number gracefully", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    try {
      const inv: InvoiceData = {
        ...emptyInvoice("charge"),
        customer: "Minimal Customer",
        address: "",  // missing
        poNumber: "", // missing
        items: [
          { id: "1", item: "ITM-01", description: "Item without PO", qty: "1", unitPrice: "500" },
        ],
      };
      const bytes = await renderInvoicePdf(inv, createDefaultLayout("charge"));
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(1000);
    } finally { fetchMock.mockRestore(); }
  });

  it("preserves detected source invoice number but keeps printable invoiceNumber empty", () => {
    const tokens: TextToken[] = [
      { str: "10/28/2026", x: 400, y: 100, w: 50 },
      { str: "ACME Corp", x: 130, y: 140, w: 80 },
      { str: "10", x: 450, y: 250, w: 20 },
      { str: "100.00", x: 500, y: 250, w: 30 },
      { str: "1000.00", x: 550, y: 250, w: 40 },
      { str: "CHI-2028", x: 200, y: 450, w: 50 }, // source reference
      { str: "Juan Dela Cruz", x: 200, y: 460, w: 70 },
      { str: "1000.00", x: 500, y: 475, w: 40 },
    ];

    const result = parseSosTokens(tokens, "sample.pdf");
    expect(result.invoice.sourceInvoiceNumber).toBe("CHI-2028");
    // Crucial requirement: printable invoiceNumber must NOT be automatically populated
    expect(result.invoice.invoiceNumber).toBe("");
  });
});
