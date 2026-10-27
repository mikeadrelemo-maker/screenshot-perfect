import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { calcLine, calcTotals, peso } from "./calc";
import type { InvoiceData, InvoiceType } from "./types";

/*
 * Output = scanned original form as page background + data drawn as real PDF text.
 * Coordinates below are measured in pixels on a 909px-wide render of each template
 * and converted to PDF points. Page size matches the original template PDFs.
 */
const PAGE_W = 594.72;
const PAGE_H = 774.72;
const S = PAGE_W / 909;

interface Layout {
  serial: { x: number; y: number; w: number; h: number };
  date: { x: number; y: number };
  name: { x: number; y: number };
  tin: { x: number; y: number };
  address: { x: number; y: number };
  side: { x: number; y: number; step: number }; // terms / due / PO under DATE
  rows: { top: number; h: number; count: number };
  cols: { item: [number, number]; desc: [number, number]; qty: [number, number]; unit: [number, number]; amount: [number, number] };
  totalsRight: number;
  totalsY: { total: number; vat: number; net: number; wht: number; due: number };
  leftRight: number;
  leftY: { vatable: number; vatAmount: number };
  ref: { x: number; y: number };
}

const LAYOUTS: Record<InvoiceType, Layout> = {
  charge: {
    serial: { x: 696, y: 62, w: 92, h: 36 },
    date: { x: 714, y: 174 },
    name: { x: 186, y: 193 },
    tin: { x: 186, y: 205 },
    address: { x: 186, y: 218 },
    side: { x: 560, y: 201, step: 14 },
    rows: { top: 352, h: 27.3, count: 10 },
    cols: { item: [16, 132], desc: [137, 586], qty: [590, 661], unit: [665, 754], amount: [759, 846] },
    totalsRight: 839,
    totalsY: { total: 711, vat: 741, net: 768, wht: 863, due: 903 },
    leftRight: 268,
    leftY: { vatable: 793, vatAmount: 887 },
    ref: { x: 20, y: 668 },
  },
  cash: {
    serial: { x: 684, y: 70, w: 92, h: 36 },
    date: { x: 718, y: 185 },
    name: { x: 192, y: 220 },
    tin: { x: 192, y: 232 },
    address: { x: 192, y: 245 },
    side: { x: 560, y: 210, step: 14 },
    rows: { top: 370, h: 27.1, count: 10 },
    cols: { item: [46, 151], desc: [157, 580], qty: [584, 649], unit: [653, 737], amount: [742, 824] },
    totalsRight: 822,
    totalsY: { total: 694, vat: 725, net: 752, wht: 847, due: 886 },
    leftRight: 289,
    leftY: { vatable: 790, vatAmount: 884 },
    ref: { x: 52, y: 680 },
  },
};

export const ROWS_PER_PAGE = 10;

const assetCache = new Map<string, Promise<ArrayBuffer>>();
const loadAsset = (url: string) => {
  if (!assetCache.has(url)) {
    assetCache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${url}`);
        return r.arrayBuffer();
      }),
    );
  }
  return assetCache.get(url)!;
};

const INK = rgb(0.05, 0.07, 0.16);
const RED = rgb(0.78, 0.12, 0.15);

export async function renderInvoicePdf(inv: InvoiceData): Promise<Uint8Array> {
  const L = LAYOUTS[inv.type];
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${inv.type === "charge" ? "Charge" : "Cash"} Invoice ${inv.invoiceNumber}`);
  doc.setCreator("SOS Invoice Template Converter by Adrian Llano");
  const [bg, reg, bold] = await Promise.all([
    loadAsset(`/templates/${inv.type}.jpg`),
    loadAsset("/fonts/DejaVuSans.ttf"),
    loadAsset("/fonts/DejaVuSans-Bold.ttf"),
  ]);
  const img = await doc.embedJpg(bg);
  const font = await doc.embedFont(reg, { subset: true });
  const fontB = await doc.embedFont(bold, { subset: true });

  const pts = (px: number) => px * S;
  const ypt = (pxTop: number) => PAGE_H - pxTop * S;

  const text = (p: PDFPage, s: string, x: number, yPx: number, size = 8, f: PDFFont = font, color = INK) => {
    if (!s) return;
    p.drawText(s, { x: pts(x), y: ypt(yPx) - size * 0.35, size, font: f, color });
  };
  const right = (p: PDFPage, s: string, xRight: number, yPx: number, size = 8, f: PDFFont = font) => {
    if (!s) return;
    const w = f.widthOfTextAtSize(s, size);
    p.drawText(s, { x: pts(xRight) - w, y: ypt(yPx) - size * 0.35, size, font: f, color: INK });
  };
  /** Fit text inside [x0,x1]: shrink to minSize, then wrap to two lines. */
  const fit = (p: PDFPage, s: string, [x0, x1]: [number, number], yPx: number, size = 8, align: "left" | "right" | "center" = "left") => {
    if (!s) return;
    const maxW = pts(x1 - x0) - 4;
    let sz = size;
    while (sz > 6 && font.widthOfTextAtSize(s, sz) > maxW) sz -= 0.25;
    const draw = (str: string, y: number) => {
      const w = font.widthOfTextAtSize(str, sz);
      const x = align === "right" ? pts(x1) - 2 - w : align === "center" ? pts((x0 + x1) / 2) - w / 2 : pts(x0) + 2;
      p.drawText(str, { x, y, size: sz, font, color: INK });
    };
    if (font.widthOfTextAtSize(s, sz) <= maxW) return draw(s, ypt(yPx) - sz * 0.35);
    // wrap into two lines
    sz = 6;
    const words = s.split(" ");
    let a = "";
    while (words.length && font.widthOfTextAtSize((a + " " + words[0]).trim(), sz) <= maxW) a = (a + " " + words.shift()).trim();
    let b = words.join(" ");
    while (b && font.widthOfTextAtSize(b, sz) > maxW) b = b.slice(0, -2) + "…";
    draw(a, ypt(yPx) + sz * 0.25);
    draw(b, ypt(yPx) - sz * 0.95);
  };

  const totals = calcTotals(inv.items, inv.whtRate);
  const pageCount = Math.max(1, Math.ceil(inv.items.length / ROWS_PER_PAGE));

  for (let pi = 0; pi < pageCount; pi++) {
    const p = doc.addPage([PAGE_W, PAGE_H]);
    p.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

    // Replace the pre-printed serial with this invoice's number
    p.drawRectangle({ x: pts(L.serial.x), y: ypt(L.serial.y + L.serial.h), width: pts(L.serial.w), height: pts(L.serial.h), color: rgb(1, 1, 1) });
    if (inv.invoiceNumber) {
      let sz = 15;
      while (sz > 8 && font.widthOfTextAtSize(inv.invoiceNumber, sz) > pts(L.serial.w) - 2) sz -= 0.5;
      text(p, inv.invoiceNumber, L.serial.x + 2, L.serial.y + L.serial.h / 2, sz, font, RED);
    }

    text(p, inv.date, L.date.x, L.date.y, 9);
    fit(p, inv.customer, [L.name.x, 655], L.name.y, 8.5);
    text(p, inv.tin, L.tin.x, L.tin.y, 8);
    fit(p, inv.address, [L.address.x, 655], L.address.y, 8);
    const side = [
      ["TERMS", inv.terms],
      ["DUE DATE", inv.dueDate],
      ["PO NUMBER", inv.poNumber],
    ].filter(([, v]) => v);
    side.forEach(([k, v], i) => {
      const y = L.side.y + i * L.side.step;
      text(p, k, L.side.x + 110, y, 6.5, fontB);
      text(p, v, L.side.x + 175, y, 8);
    });

    const slice = inv.items.slice(pi * ROWS_PER_PAGE, (pi + 1) * ROWS_PER_PAGE);
    slice.forEach((it, i) => {
      const y = L.rows.top + L.rows.h * i + L.rows.h / 2;
      const c = calcLine(it);
      fit(p, it.item, L.cols.item, y, 7.5);
      fit(p, it.description, L.cols.desc, y, 8);
      fit(p, it.qty, L.cols.qty, y, 8, "center");
      if (c.valid) {
        fit(p, peso(c.vatUnit), L.cols.unit, y, 7.5, "right");
        fit(p, peso(c.amount), L.cols.amount, y, 7.5, "right");
      }
    });

    if (inv.invoiceNumber) text(p, `Ref No.: ${inv.invoiceNumber}`, L.ref.x, L.ref.y, 8);
    if (inv.salesRep) text(p, `Sales Rep: ${inv.salesRep}`, L.ref.x, L.ref.y + 14, 8);
    if (pageCount > 1) text(p, `Page ${pi + 1} of ${pageCount}`, L.ref.x, L.ref.y + 28, 7);

    if (pi === pageCount - 1) {
      right(p, peso(totals.totalSales), L.totalsRight, L.totalsY.total, 8);
      right(p, peso(totals.vat), L.totalsRight, L.totalsY.vat, 8);
      right(p, peso(totals.net), L.totalsRight, L.totalsY.net, 8);
      right(p, `(${peso(totals.wht)})`, L.totalsRight, L.totalsY.wht, 8);
      right(p, peso(totals.due), L.totalsRight, L.totalsY.due, 10, fontB);
      right(p, peso(totals.net), L.leftRight, L.leftY.vatable, 8);
      right(p, peso(totals.vat), L.leftRight, L.leftY.vatAmount, 8);
    } else {
      text(p, "Continued on next page…", 600, L.totalsY.due, 9, fontB);
    }
  }
  return doc.save();
}
