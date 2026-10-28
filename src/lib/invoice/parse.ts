import { emptyInvoice, newId, type InvoiceData } from "./types";

export interface TextToken {
  str: string;
  x: number; // from left, pt
  y: number; // from top, pt
  w: number; // width, pt
}

interface Line {
  y: number;
  tokens: TextToken[];
}

const isPlaceholder = (s: string) => /«.*»/.test(s);
const clean = (s: string) => (isPlaceholder(s) ? "" : s.trim());
const num = (s: string) => s.replace(/[₱,\s]/g, "");
const isNum = (s: string) => /^-?\d*\.?\d+$/.test(num(s));

function toLines(tokens: TextToken[]): Line[] {
  const sorted = tokens.filter((t) => t.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];
  for (const t of sorted) {
    const l = lines.find((l) => Math.abs(l.y - t.y) <= 3);
    if (l) l.tokens.push(t);
    else lines.push({ y: t.y, tokens: [t] });
  }
  lines.forEach((l) => l.tokens.sort((a, b) => a.x - b.x));
  return lines;
}

/** Join adjacent tokens into cells: tokens separated by > gap pt start a new cell. */
function cells(tokens: TextToken[], gap = 14): TextToken[] {
  const out: TextToken[] = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    const prevEnd = prev ? prev.x + prev.w : -999;
    if (prev && t.x - prevEnd < gap && !t.str.trim().startsWith("₱")) {
      prev.str += (t.x - prevEnd > 1 ? " " : "") + t.str.trim();
      prev.w = t.x + t.w - prev.x;
    } else out.push({ ...t, str: t.str.trim() });
  }
  return out;
}

export interface ParseResult {
  invoice: InvoiceData;
  warnings: string[];
}

/**
 * Parse an SOS Inventory invoice / sales receipt (letter page, data printed
 * for pre-printed forms). Positions calibrated on the SOS reference PDFs.
 */
export function parseSosTokens(tokens: TextToken[], fileName = ""): ParseResult {
  const warnings: string[] = [];
  const inv = emptyInvoice();
  inv.sourceFile = fileName;
  const lines = toLines(tokens);
  const dateRe = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;

  // Date: top-right block
  const dateLine = lines.find(
    (l) => l.y < 140 && l.tokens.some((t) => t.x > 380 && dateRe.test(t.str)),
  );
  inv.date = dateLine?.tokens.find((t) => dateRe.test(t.str))?.str.match(dateRe)?.[0] ?? "";

  // Bill-to block (left of the TERMS labels)
  const billLines = lines
    .filter((l) => l.y > 130 && l.y < 215)
    .map((l) =>
      l.tokens
        .filter((t) => t.x > 120 && t.x < 385)
        .map((t) => t.str)
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
  inv.customer = clean(billLines[0] ?? "");
  inv.address = clean(billLines.slice(1).join(", "));

  const labelValue = (re: RegExp) => {
    const l = lines.find(
      (l) =>
        l.y < 220 &&
        re.test(
          l.tokens
            .filter((t) => t.x >= 385 && t.x < 440)
            .map((t) => t.str)
            .join(" "),
        ),
    );
    return clean(
      l?.tokens
        .filter((t) => t.x >= 430)
        .map((t) => t.str)
        .join(" ") ?? "",
    );
  };
  inv.terms = labelValue(/TERMS/);
  inv.dueDate = labelValue(/DUE\s*DATE/);
  inv.poNumber = labelValue(/PO\s*NUMBER/);

  // Item rows: lines between the header block and the reference block whose last 3 cells are qty, price, amount.
  for (const l of lines.filter((l) => l.y > 220 && l.y < 440)) {
    const c = cells(l.tokens);
    if (c.length < 4) continue;
    const amount = c[c.length - 1];
    const price = c[c.length - 2];
    const qty = c[c.length - 3];
    if (!amount || !price || !qty) continue;
    if (!isNum(amount.str) || !isNum(price.str) || !isNum(qty.str)) continue;
    const left = c.slice(0, c.length - 3);
    const first = left[0];
    const item = first && first.x < 105 ? first.str : "";
    const desc = left
      .filter((t, i) => !(i === 0 && item))
      .map((t) => t.str)
      .join(" ");
    inv.items.push({
      id: newId(),
      item,
      description: desc,
      qty: num(qty.str),
      unitPrice: num(price.str),
    });
  }

  // Reference number + sales rep
  const refLines = lines
    .filter((l) => l.y > 440 && l.y < 470)
    .map((l) =>
      l.tokens
        .filter((t) => t.x > 180 && t.x < 400)
        .map((t) => t.str)
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
  inv.sourceInvoiceNumber = clean(refLines[0] ?? "");
  inv.salesRep = clean(refLines[1] ?? "");

  // Source "Total" (top value of the totals column)
  const totalLine = lines.find(
    (l) => l.y > 465 && l.y < 485 && l.tokens.some((t) => t.x > 480 && isNum(t.str)),
  );
  const tot = totalLine?.tokens.find((t) => t.x > 480 && isNum(t.str));
  if (tot) inv.sourceTotal = num(tot.str);

  if (/^CI-/i.test(inv.sourceInvoiceNumber)) inv.type = "cash";
  else inv.type = "charge";

  if (!inv.sourceInvoiceNumber) warnings.push("Source invoice / reference number not found.");
  if (!inv.date) warnings.push("Invoice date not found.");
  if (!inv.customer) warnings.push("Customer name not found.");
  if (inv.items.length === 0) warnings.push("No item rows were recognised in this PDF.");
  return { invoice: inv, warnings };
}
