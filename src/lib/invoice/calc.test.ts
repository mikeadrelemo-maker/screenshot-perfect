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
  it("mandatory Igacos totals", () => {
    const t = calcTotals(igacos, "1");
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
  it("sums multiple rows", () => {
    const t = calcTotals([...igacos, { qty: "5", unitPrice: "2824.108" }], "1");
    // 2824.108 × 1.12 = 3163.00 ; × 5 = 15815.00
    expect(peso(t.totalSales)).toBe("₱83,330.50");
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
