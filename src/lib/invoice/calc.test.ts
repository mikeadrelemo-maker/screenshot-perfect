import { describe, expect, it } from "vitest";
import { calcLine, calcTotals, peso } from "./calc";

const example = { qty: "17", unitPrice: "3545.98225" };
const igacos = [example];

describe("VAT calculations", () => {
  it("VAT-inclusive unit price is original × 1.12", () => {
    expect(peso(calcLine(example).vatUnit)).toBe("₱3,971.50");
  });

  it("line amount is VAT unit price × qty", () => {
    expect(peso(calcLine(example).amount)).toBe("₱67,515.50");
  });

  it("calculates Total Sales and VAT portion correctly", () => {
    const t = calcTotals(igacos, { wht1Rate: "1", wht1Enabled: true, wht2Enabled: false });
    expect(peso(t.totalSales)).toBe("₱67,515.50");
    expect(peso(t.vat)).toBe("₱7,233.80");
    expect(peso(t.net)).toBe("₱60,281.70");
    expect(peso(t.wht)).toBe("₱675.16");
    expect(peso(t.wht2)).toBe("₱3,375.78");
    expect(peso(t.due)).toBe("₱63,464.56");
  });
  it("withholding rate is editable", () => {
    expect(peso(calcTotals(igacos, "2").wht)).toBe("₱1,350.31");
    expect(peso(calcTotals(igacos, "0", "0").due)).toBe("₱67,515.50");
  });

  it("calculates both Withholding Tax 1 (1%) and Withholding Tax 2 (5%) enabled", () => {
    const t = calcTotals(igacos, {
      wht1Rate: "1",
      wht1Enabled: true,
      wht2Rate: "5",
      wht2Enabled: true,
    });
    // WHT 1 = 67,515.50 × 1% = 675.16
    // WHT 2 = 67,515.50 × 5% = 3,375.78
    // Total WHT = 4,050.94
    // Due = 67,515.50 - 4,050.94 = 63,464.56
    expect(peso(t.wht1)).toBe("₱675.16");
    expect(peso(t.wht2)).toBe("₱3,375.78");
    expect(peso(t.whtTotal)).toBe("₱4,050.94");
    expect(peso(t.due)).toBe("₱63,464.56");
  });

  it("calculates with only Withholding Tax 2 enabled (5%)", () => {
    const t = calcTotals(igacos, {
      wht1Enabled: false,
      wht2Rate: "5",
      wht2Enabled: true,
    });
    expect(peso(t.wht1)).toBe("₱0.00");
    expect(peso(t.wht2)).toBe("₱3,375.78");
    expect(peso(t.due)).toBe("₱64,139.72");
  });

  it("handles custom editable withholding tax rates", () => {
    const t = calcTotals(igacos, {
      wht1Rate: "2",
      wht1Enabled: true,
      wht2Rate: "10",
      wht2Enabled: true,
    });
    // WHT 1 = 67,515.50 × 2% = 1,350.31
    // WHT 2 = 67,515.50 × 10% = 6,751.55
    // Total WHT = 8,101.86
    expect(peso(t.wht1)).toBe("₱1,350.31");
    expect(peso(t.wht2)).toBe("₱6,751.55");
    expect(peso(t.whtTotal)).toBe("₱8,101.86");
    expect(peso(t.due)).toBe("₱59,413.64");
  });

  it("handles both withholding taxes disabled", () => {
    const t = calcTotals(igacos, { wht1Enabled: false, wht2Enabled: false });
    expect(peso(t.wht1)).toBe("₱0.00");
    expect(peso(t.wht2)).toBe("₱0.00");
    expect(peso(t.whtTotal)).toBe("₱0.00");
    expect(peso(t.due)).toBe("₱67,515.50");
  });

  it("sums multiple rows with independent withholding deductions", () => {
    const multi = [...igacos, { qty: "5", unitPrice: "2824.108" }];
    // 2824.108 × 1.12 = 3163.00 ; × 5 = 15815.00
    // Total Sales = 67,515.50 + 15,815.00 = 83,330.50
    const t = calcTotals(multi, {
      wht1Rate: "1",
      wht1Enabled: true,
      wht2Rate: "5",
      wht2Enabled: true,
    });
    expect(peso(t.totalSales)).toBe("₱83,330.50");
    // WHT 1 = 83,330.50 × 1% = 833.31
    // WHT 2 = 83,330.50 × 5% = 4,166.53
    // Total WHT = 4,999.84
    expect(peso(t.wht1)).toBe("₱833.31");
    expect(peso(t.wht2)).toBe("₱4,166.53");
    expect(peso(t.due)).toBe("₱78,330.66");
  });
  it("disables Tax 1 independently", () => {
    const t = calcTotals(igacos, "1", "5", false, true);
    expect(peso(t.wht)).toBe("₱0.00");
    expect(peso(t.wht2)).toBe("₱3,375.78");
    expect(peso(t.due)).toBe("₱64,139.72");
  });
  it("disables Tax 2 independently", () => {
    const t = calcTotals(igacos, "1", "5", true, false);
    expect(peso(t.wht)).toBe("₱675.16");
    expect(peso(t.wht2)).toBe("₱0.00");
    expect(peso(t.due)).toBe("₱66,840.34");
  });
  it("does not deduct disabled taxes", () => {
    expect(peso(calcTotals(igacos, "1", "5", false, false).due)).toBe("₱67,515.50");
  });
  it("edits both rates independently from VAT-inclusive sales", () => {
    const t = calcTotals(igacos, "2", "3");
    expect(peso(t.wht)).toBe("₱1,350.31");
    expect(peso(t.wht2)).toBe("₱2,025.47");
    expect(peso(t.due)).toBe("₱64,139.72");
  });
});
