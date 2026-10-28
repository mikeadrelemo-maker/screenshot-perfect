import { describe, it, expect } from "vitest";
import { renderInvoicePdf } from "./render";
import { emptyInvoice, type InvoiceData } from "./types";
import { parseSosTokens, type TextToken } from "./parse";

describe("Invoice PDF Rendering & Field Validation", () => {
  it("renders a Charge Invoice PDF with Times New Roman without error", async () => {
    const inv: InvoiceData = {
      ...emptyInvoice("charge"),
      customer: "Acme Corporation",
      date: "10/28/2026",
      terms: "30 Days",
      wht1Rate: "1",
      wht1Enabled: true,
      wht2Rate: "5",
      wht2Enabled: true,
      items: [
        { id: "1", item: "ITM-01", description: "Product A", qty: "2", unitPrice: "1000" },
      ],
    };

    const bytes = await renderInvoicePdf(inv);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("renders a Cash Invoice PDF with Times New Roman without error", async () => {
    const inv: InvoiceData = {
      ...emptyInvoice("cash"),
      customer: "Retail Trading Store",
      date: "10/28/2026",
      wht1Rate: "1",
      wht1Enabled: true,
      wht2Rate: "5",
      wht2Enabled: false,
      items: [
        { id: "1", item: "CSH-01", description: "Product B", qty: "5", unitPrice: "250" },
      ],
    };

    const bytes = await renderInvoicePdf(inv);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("handles completely missing business address and PO number gracefully", async () => {
    const inv: InvoiceData = {
      ...emptyInvoice("charge"),
      customer: "Minimal Customer",
      address: "", // missing
      poNumber: "", // missing
      items: [
        { id: "1", item: "ITM-01", description: "Item without PO", qty: "1", unitPrice: "500" },
      ],
    };

    const bytes = await renderInvoicePdf(inv);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
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
