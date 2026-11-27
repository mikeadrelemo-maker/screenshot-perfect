import { describe, expect, it } from "vitest";
import { calcLine, calcTotals, peso } from "./calc";

const example = { qty: "17", unitPrice: "3545.98225" };
const igacos = [example];

describe("VAT and Withholding Tax calculations (Base = Amount Net of VAT)", () => {
  it("VAT-inclusive unit price is original × 1.12", () => {
    expect(peso(calcLine(example).vatUnit)).toBe("₱3,971.50");
  });

  it("line amount is round(original price × qty, 2) × 1.12, rounded to centavos", () => {
    expect(peso(calcLine(example).amount)).toBe("₱67,515.50");
  });

  describe("Required Test Example from User Specification", () => {
    it("computes exact values for Total Sales ₱739,815.44 and Net of VAT ₱660,549.50", () => {
      // Total Sales (VAT Inclusive): ₱739,815.44
      // Amount Net of VAT: ₱660,549.50
      // Withholding Tax 1: 1% -> -₱6,605.50
      // Withholding Tax 2: 5% -> -₱33,027.48
      // TOTAL AMOUNT DUE: ₱700,182.46
      const item = { qty: "1", unitPrice: "660549.50" };
      const t = calcTotals([item], {
        wht1Rate: "1",
        wht1Enabled: true,
        wht2Rate: "5",
        wht2Enabled: true,
      });

      expect(peso(t.totalSales)).toBe("₱739,815.44");
      expect(peso(t.net)).toBe("₱660,549.50");
      expect(peso(t.vat)).toBe("₱79,265.94");

      // Withholding tax amounts computed on Net of VAT:
      // WHT 1 = 660,549.50 × 1% = 6,605.50
      // WHT 2 = 660,549.50 × 5% = 33,027.48
      expect(peso(t.wht1)).toBe("₱6,605.50");
      expect(peso(t.wht1.neg())).toBe("-₱6,605.50");
      expect(peso(t.wht2)).toBe("₱33,027.48");
      expect(peso(t.wht2.neg())).toBe("-₱33,027.48");

      // Total WHT = 6,605.50 + 33,027.48 = 39,632.98
      expect(peso(t.whtTotal)).toBe("₱39,632.98");

      // TOTAL AMOUNT DUE = Total Sales - WHT 1 - WHT 2
      // 739,815.44 - 39,632.98 = 700,182.46
      expect(peso(t.due)).toBe("₱700,182.46");
    });
  });

  it("calculates Total Sales, VAT portion, and Net of VAT correctly", () => {
    const t = calcTotals(igacos, {
      wht1Rate: "1",
      wht1Enabled: true,
      wht2Rate: "5",
      wht2Enabled: true,
    });
    expect(peso(t.totalSales)).toBe("₱67,515.50");
    expect(peso(t.vat)).toBe("₱7,233.80");
    expect(peso(t.net)).toBe("₱60,281.70");

    // WHT 1 = 60,281.70 × 1% = 602.82
    // WHT 2 = 60,281.70 × 5% = 3,014.09
    // Total WHT = 3,616.91
    // Due = 67,515.50 - 3,616.91 = 63,898.59
    expect(peso(t.wht1)).toBe("₱602.82");
    expect(peso(t.wht1.neg())).toBe("-₱602.82");
    expect(peso(t.wht2)).toBe("₱3,014.09");
    expect(peso(t.wht2.neg())).toBe("-₱3,014.09");
    expect(peso(t.whtTotal)).toBe("₱3,616.91");
    expect(peso(t.due)).toBe("₱63,898.59");
  });

  it("withholding rate is editable and uses Amount Net of VAT", () => {
    // wht1 = 60,281.70 × 2% = 1,205.63 (positional: rate1="2", rate2 default "5")
    const t = calcTotals(igacos, "2");
    expect(peso(t.wht1)).toBe("₱1,205.63");
    expect(peso(t.wht1.neg())).toBe("-₱1,205.63");

    // Zero rates: Due = Total Sales
    expect(peso(calcTotals(igacos, "0", "0").due)).toBe("₱67,515.50");
  });

  it("calculates with only Withholding Tax 2 enabled (5%)", () => {
    const t = calcTotals(igacos, {
      wht1Enabled: false,
      wht2Rate: "5",
      wht2Enabled: true,
    });
    expect(peso(t.wht1)).toBe("₱0.00");
    expect(peso(t.wht2)).toBe("₱3,014.09");
    expect(peso(t.due)).toBe("₱64,501.41");
  });

  it("calculates with only Withholding Tax 1 enabled (1%)", () => {
    const t = calcTotals(igacos, {
      wht1Rate: "1",
      wht1Enabled: true,
      wht2Enabled: false,
    });
    expect(peso(t.wht1)).toBe("₱602.82");
    expect(peso(t.wht2)).toBe("₱0.00");
    expect(peso(t.due)).toBe("₱66,912.68");
  });

  it("handles custom editable withholding tax rates dynamically", () => {
    const t = calcTotals(igacos, {
      wht1Rate: "2",
      wht1Enabled: true,
      wht2Rate: "10",
      wht2Enabled: true,
    });
    // WHT 1 = 60,281.70 × 2% = 1,205.63
    // WHT 2 = 60,281.70 × 10% = 6,028.17
    // Total WHT = 7,233.80
    // Due = 67,515.50 - 7,233.80 = 60,281.70
    expect(peso(t.wht1)).toBe("₱1,205.63");
    expect(peso(t.wht2)).toBe("₱6,028.17");
    expect(peso(t.whtTotal)).toBe("₱7,233.80");
    expect(peso(t.due)).toBe("₱60,281.70");
  });

  it("handles both withholding taxes disabled", () => {
    const t = calcTotals(igacos, { wht1Enabled: false, wht2Enabled: false });
    expect(peso(t.wht1)).toBe("₱0.00");
    expect(peso(t.wht2)).toBe("₱0.00");
    expect(peso(t.whtTotal)).toBe("₱0.00");
    expect(peso(t.due)).toBe("₱67,515.50");
  });

  it("handles blank, empty, or zero percentages gracefully without errors", () => {
    const t = calcTotals(igacos, {
      wht1Rate: "",
      wht1Enabled: true,
      wht2Rate: "0",
      wht2Enabled: true,
    });
    expect(peso(t.wht1)).toBe("₱0.00");
    expect(peso(t.wht2)).toBe("₱0.00");
    expect(peso(t.whtTotal)).toBe("₱0.00");
    expect(peso(t.due)).toBe("₱67,515.50");
  });

  it("sums multiple rows with independent withholding deductions on Net of VAT", () => {
    const multi = [...igacos, { qty: "5", unitPrice: "2824.108" }];
    // 2824.108 × 1.12 = 3163.00 ; × 5 = 15815.00
    // Total Sales = 67,515.50 + 15,815.00 = 83,330.50
    // VAT = 83,330.50 × 12 / 112 = 8,928.27
    // Net of VAT = 83,330.50 - 8,928.27 = 74,402.23
    const t = calcTotals(multi, {
      wht1Rate: "1",
      wht1Enabled: true,
      wht2Rate: "5",
      wht2Enabled: true,
    });
    expect(peso(t.totalSales)).toBe("₱83,330.50");
    expect(peso(t.vat)).toBe("₱8,928.27");
    expect(peso(t.net)).toBe("₱74,402.23");

    // WHT 1 = 74,402.23 × 1% = 744.02
    // WHT 2 = 74,402.23 × 5% = 3,720.11
    // Total WHT = 4,464.13
    // Due = 83,330.50 - 4,464.13 = 78,866.37
    expect(peso(t.wht1)).toBe("₱744.02");
    expect(peso(t.wht2)).toBe("₱3,720.11");
    expect(peso(t.due)).toBe("₱78,866.37");
  });

  it("prevents double subtraction and verifies TOTAL AMOUNT DUE formula strictly", () => {
    const t = calcTotals(igacos, { wht1Rate: "1", wht2Rate: "5" });
    const computedDue = t.totalSales.sub(t.wht1).sub(t.wht2);
    expect(t.due.toString()).toBe(computedDue.toString());
  });

  describe("CHI-2298 regression test – exact amounts from real PDF", () => {
    // Source PDF: CHI-2298.pdf
    // Items from the actual invoice with 4-decimal original unit prices
    const chi2298Items = [
      { qty: "20", unitPrice: "2476.9642" }, // MX.32.11-100
      { qty: "40", unitPrice: "917.6027" },  // MX.20.11-90
      { qty: "25", unitPrice: "647.3884" },  // MX.20.17-90
    ];

    it("computes correct VAT-inclusive unit prices for display", () => {
      const [l1, l2, l3] = chi2298Items.map(calcLine);
      expect(peso(l1!.vatUnit)).toBe("₱2,774.20");
      expect(peso(l2!.vatUnit)).toBe("₱1,027.72");
      expect(peso(l3!.vatUnit)).toBe("₱725.08");
    });

    it("computes correct line amounts using round(price × qty, 2) × 1.12 formula", () => {
      const [l1, l2, l3] = chi2298Items.map(calcLine);
      // Item 1: round(2476.9642 × 20, 2) × 1.12 = round(49539.28 × 1.12, 2) = 55483.99
      expect(peso(l1!.amount)).toBe("₱55,483.99");
      // Item 2: round(917.6027 × 40, 2) × 1.12 = round(36704.11 × 1.12, 2) = 41108.60
      expect(peso(l2!.amount)).toBe("₱41,108.60");
      // Item 3: round(647.3884 × 25, 2) × 1.12 = round(16184.71 × 1.12, 2) = 18126.88
      expect(peso(l3!.amount)).toBe("₱18,126.88");
    });

    it("computes correct invoice totals matching the source PDF – zero discrepancy", () => {
      const t = calcTotals(chi2298Items, { wht1Enabled: false, wht2Enabled: false });
      // PDF total: ₱114,719.47 — system must match exactly
      expect(peso(t.totalSales)).toBe("₱114,719.47");
      expect(peso(t.vat)).toBe("₱12,291.37");
      expect(peso(t.net)).toBe("₱102,428.10");
      expect(peso(t.due)).toBe("₱114,719.47");
    });

    it("the calculated total equals the source PDF total — discrepancy is ₱0.00", () => {
      const t = calcTotals(chi2298Items, { wht1Enabled: false, wht2Enabled: false });
      // The source PDF prints ₱114,719.47 — system total must equal it exactly
      expect(t.totalSales.toFixed(2)).toBe("114719.47");
    });
  });
});
