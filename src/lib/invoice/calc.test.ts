import { describe, expect, it } from "vitest";
import { calcLine, calcTotals, peso } from "./calc";

const igacos: { qty: string; unitPrice: string }[] = [{ qty: "17", unitPrice: "3545.98225" }];

describe("VAT calculations", () => {
  it("VAT-inclusive unit price is original × 1.12", () => {
    expect(peso(calcLine(igacos[0]!).vatUnit)).toBe("₱3,971.50");
  });
  it("line amount is VAT unit price × qty", () => {
    expect(peso(calcLine(igacos[0]!).amount)).toBe("₱67,515.50");
  });
  it("mandatory Igacos totals", () => {
    const t = calcTotals(igacos, "1");
    expect(peso(t.totalSales)).toBe("₱67,515.50");
    expect(peso(t.vat)).toBe("₱7,233.80");
    expect(peso(t.net)).toBe("₱60,281.70");
    expect(peso(t.wht)).toBe("₱602.82");
    expect(peso(t.due)).toBe("₱66,912.68");
  });
  it("withholding rate is editable", () => {
    expect(peso(calcTotals(igacos, "2").wht)).toBe("₱1,205.63");
    expect(peso(calcTotals(igacos, "0").due)).toBe("₱67,515.50");
  });
  it("sums multiple rows", () => {
    const t = calcTotals([...igacos, { qty: "5", unitPrice: "2824.108" }], "1");
    // 2824.108 × 1.12 = 3163.00 ; × 5 = 15815.00
    expect(peso(t.totalSales)).toBe("₱83,330.50");
  });
});
