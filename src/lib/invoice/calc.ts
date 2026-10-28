import Decimal from "decimal.js";
import type { LineItem, InvoiceData } from "./types";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const VAT_FACTOR = new Decimal("1.12");

export function toDec(v: string | number | undefined | null): Decimal | null {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/[₱,\s]/g, "");
  if (s === "" || !/^-?\d*\.?\d+$/.test(s)) return null;
  return new Decimal(s);
}

export const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export interface LineCalc {
  vatUnit: Decimal; // VAT-inclusive unit price, rounded to 2dp
  amount: Decimal; // vatUnit × qty, 2dp
  valid: boolean;
}

export function calcLine(item: Pick<LineItem, "qty" | "unitPrice">): LineCalc {
  const qty = toDec(item.qty);
  const price = toDec(item.unitPrice);
  if (!qty || !price) return { vatUnit: new Decimal(0), amount: new Decimal(0), valid: false };
  const vatUnit = r2(price.mul(VAT_FACTOR));
  return { vatUnit, amount: r2(vatUnit.mul(qty)), valid: true };
}

export interface WhtOptions {
  wht1Rate?: string | number | Decimal;
  wht1Enabled?: boolean;
  wht2Rate?: string | number | Decimal;
  wht2Enabled?: boolean;
  legacyWhtRate?: string | number | Decimal;
}

export interface Totals {
  totalSales: Decimal; // Total Sales (VAT Inclusive)
  vat: Decimal; // 12% VAT portion of Total Sales
  net: Decimal; // Total Sales - VAT (Amount Net of VAT)
  wht1: Decimal; // Withholding Tax 1 deduction amount
  wht2: Decimal; // Withholding Tax 2 deduction amount
  whtTotal: Decimal; // Withholding Tax 1 + Withholding Tax 2
  wht: Decimal; // backward compatibility alias to whtTotal
  wht1Rate: Decimal; // Rate 1 (e.g. 1)
  wht2Rate: Decimal; // Rate 2 (e.g. 5)
  wht1Enabled: boolean;
  wht2Enabled: boolean;
  due: Decimal; // TOTAL AMOUNT DUE = Total Sales - whtTotal
}

/**
 * Calculates VAT totals and independent multiple withholding taxes.
 * Base for Withholding Taxes is Total Sales (VAT Inclusive), per invoice specification:
 *   Withholding Tax 1 = Total Sales (VAT Inclusive) × Rate 1
 *   Withholding Tax 2 = Total Sales (VAT Inclusive) × Rate 2
 *   Total Withholding Tax = Withholding Tax 1 + Withholding Tax 2
 *   TOTAL AMOUNT DUE = Total Sales (VAT Inclusive) - Total Withholding Tax
 */
export function calcTotals(
  items: Pick<LineItem, "qty" | "unitPrice">[],
  whtInput?: string | WhtOptions | Partial<InvoiceData>,
  optionalWht2Rate?: string | number,
): Totals {
  const totalSales = items.reduce((s, i) => s.add(calcLine(i).amount), new Decimal(0));
  const vat = r2(totalSales.mul(12).div(112));
  const net = totalSales.sub(vat);

  let wht1RateStr = "1";
  let wht1Enabled = true;
  let wht2RateStr = "5";
  let wht2Enabled = false;

  if (typeof whtInput === "string") {
    wht1RateStr = whtInput;
    wht1Enabled = true;
    if (optionalWht2Rate !== undefined) {
      wht2RateStr = String(optionalWht2Rate);
      wht2Enabled = true;
    }
  } else if (whtInput && typeof whtInput === "object") {
    if ("wht1Rate" in whtInput && whtInput.wht1Rate !== undefined) {
      wht1RateStr = String(whtInput.wht1Rate);
    } else if ("whtRate" in whtInput && whtInput.whtRate !== undefined) {
      wht1RateStr = String(whtInput.whtRate);
    }
    if ("wht1Enabled" in whtInput && whtInput.wht1Enabled !== undefined) {
      wht1Enabled = Boolean(whtInput.wht1Enabled);
    }
    if ("wht2Rate" in whtInput && whtInput.wht2Rate !== undefined) {
      wht2RateStr = String(whtInput.wht2Rate);
    }
    if ("wht2Enabled" in whtInput && whtInput.wht2Enabled !== undefined) {
      wht2Enabled = Boolean(whtInput.wht2Enabled);
    }
  }

  const dRate1 = toDec(wht1RateStr) ?? new Decimal(0);
  const dRate2 = toDec(wht2RateStr) ?? new Decimal(0);

  // Calculate each withholding tax independently using VAT-inclusive sales as base
  const wht1 = wht1Enabled && dRate1.gt(0) ? r2(totalSales.mul(dRate1).div(100)) : new Decimal(0);
  const wht2 = wht2Enabled && dRate2.gt(0) ? r2(totalSales.mul(dRate2).div(100)) : new Decimal(0);

  const whtTotal = wht1.add(wht2);
  const due = totalSales.sub(whtTotal);

  return {
    totalSales,
    vat,
    net,
    wht1,
    wht2,
    whtTotal,
    wht: whtTotal,
    wht1Rate: dRate1,
    wht2Rate: dRate2,
    wht1Enabled,
    wht2Enabled,
    due,
  };
}

export function peso(d: Decimal | null | undefined): string {
  if (!d) return "";
  const neg = d.isNegative();
  const [int = "0", frac = "00"] = d.abs().toFixed(2).split(".");
  return `${neg ? "-" : ""}₱${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}
