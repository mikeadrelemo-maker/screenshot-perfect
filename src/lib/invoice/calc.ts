import Decimal from "decimal.js";
import type { LineItem } from "./types";

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
  amount: Decimal;  // vatUnit × qty, 2dp
  valid: boolean;
}

export function calcLine(item: Pick<LineItem, "qty" | "unitPrice">): LineCalc {
  const qty = toDec(item.qty);
  const price = toDec(item.unitPrice);
  if (!qty || !price) return { vatUnit: new Decimal(0), amount: new Decimal(0), valid: false };
  const vatUnit = r2(price.mul(VAT_FACTOR));
  return { vatUnit, amount: r2(vatUnit.mul(qty)), valid: true };
}

export interface Totals {
  totalSales: Decimal; // Total Sales (VAT Inclusive)
  vat: Decimal;        // 12% VAT portion
  net: Decimal;        // Total Sales - VAT
  wht1: Decimal;       // Withholding Tax 1 deduction
  wht2: Decimal;       // Withholding Tax 2 deduction
  whtTotal: Decimal;   // wht1 + wht2
  wht: Decimal;        // backward-compat alias for whtTotal
  wht1Rate: Decimal;
  wht2Rate: Decimal;
  wht1Enabled: boolean;
  wht2Enabled: boolean;
  due: Decimal;        // TOTAL AMOUNT DUE = Total Sales - whtTotal
}

export interface WhtOptions {
  wht1Rate?: string;
  wht2Rate?: string;
  wht1Enabled?: boolean;
  wht2Enabled?: boolean;
  /** Legacy single-WHT fields kept for backward compatibility */
  whtRate?: string;
  whtEnabled?: boolean;
  whtRate2?: string;
  whtEnabled2?: boolean;
}

/**
 * Calculates VAT totals and dual independent withholding taxes.
 * WHT base = Amount Net of VAT.
 *
 * Formulas:
 *   Withholding Tax 1 = Amount Net of VAT × (Tax 1 Percentage / 100)
 *   Withholding Tax 2 = Amount Net of VAT × (Tax 2 Percentage / 100)
 *   TOTAL AMOUNT DUE  = Total Sales (VAT Inclusive) - Withholding Tax 1 - Withholding Tax 2
 *
 * Accepts either:
 *   calcTotals(items, opts)                   — new WhtOptions object form
 *   calcTotals(items, rate1, rate2, en1, en2) — legacy positional form
 */
export function calcTotals(
  items: Pick<LineItem, "qty" | "unitPrice">[],
  optsOrRate: WhtOptions | string = {},
  whtRatePct2 = "5",
  enabled = true,
  enabled2 = true,
): Totals {
  let rate1Str: string;
  let rate2Str: string;
  let en1: boolean;
  let en2: boolean;

  if (typeof optsOrRate === "object") {
    const o = optsOrRate as WhtOptions;
    rate1Str = o.wht1Rate  ?? o.whtRate  ?? "1";
    rate2Str = o.wht2Rate  ?? o.whtRate2 ?? "5";
    en1      = o.wht1Enabled  ?? o.whtEnabled  ?? true;
    en2      = o.wht2Enabled  ?? o.whtEnabled2 ?? true;
  } else {
    rate1Str = optsOrRate ?? "1";
    rate2Str = whtRatePct2;
    en1      = enabled;
    en2      = enabled2;
  }

  const totalSales = items.reduce((s, i) => s.add(calcLine(i).amount), new Decimal(0));
  const vat        = r2(totalSales.mul(12).div(112));
  const net        = totalSales.sub(vat);
  const rate1      = Decimal.max(0, toDec(rate1Str) ?? new Decimal(0));
  const rate2      = Decimal.max(0, toDec(rate2Str) ?? new Decimal(0));
  const wht1       = en1 ? r2(net.mul(rate1).div(100)) : new Decimal(0);
  const wht2       = en2 ? r2(net.mul(rate2).div(100)) : new Decimal(0);
  const whtTotal   = wht1.add(wht2);
  const due        = totalSales.sub(whtTotal);

  return { totalSales, vat, net, wht1, wht2, whtTotal, wht: whtTotal, wht1Rate: rate1, wht2Rate: rate2, wht1Enabled: en1, wht2Enabled: en2, due };
}

export function peso(d: Decimal | null | undefined): string {
  if (!d) return "";
  const neg = d.isNegative();
  const [int = "0", frac = "00"] = d.abs().toFixed(2).split(".");
  return `${neg ? "-" : ""}₱${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}
