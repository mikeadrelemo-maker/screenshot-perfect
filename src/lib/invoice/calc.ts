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

const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

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

export interface Totals {
  totalSales: Decimal;
  vat: Decimal;
  net: Decimal;
  wht: Decimal;
  wht2: Decimal;
  due: Decimal;
}

export function calcTotals(
  items: Pick<LineItem, "qty" | "unitPrice">[],
  whtRatePct: string,
  whtRatePct2 = "5",
  enabled = true,
  enabled2 = true,
): Totals {
  const totalSales = items.reduce((s, i) => s.add(calcLine(i).amount), new Decimal(0));
  const vat = r2(totalSales.mul(12).div(112));
  const net = totalSales.sub(vat);
  const rate = toDec(whtRatePct) ?? new Decimal(0);
  const rate2 = toDec(whtRatePct2) ?? new Decimal(0);
  const wht = enabled ? r2(totalSales.mul(rate).div(100)) : new Decimal(0);
  const wht2 = enabled2 ? r2(totalSales.mul(rate2).div(100)) : new Decimal(0);
  const due = totalSales.sub(wht).sub(wht2);
  return { totalSales, vat, net, wht, wht2, due };
}

export function peso(d: Decimal | null | undefined): string {
  if (!d) return "";
  const neg = d.isNegative();
  const [int = "0", frac = "00"] = d.abs().toFixed(2).split(".");
  return `${neg ? "-" : ""}₱${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}
