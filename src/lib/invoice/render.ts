import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { calcLine, calcTotals, peso } from "./calc";
import type { InvoiceData } from "./types";
import {
  LETTER_WIDTH_MM,
  LETTER_HEIGHT_MM,
  mmToPt,
  type InvoiceLayout,
  type LayoutField,
} from "./layout-types";
import { loadActiveLayout } from "./layout-store";

export const ROWS_PER_PAGE = 10;

// Font asset cache — template background images are never loaded into PDFs.
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

function parseColor(hex: string | undefined, fallback = INK) {
  if (!hex || !hex.startsWith("#")) return fallback;
  const clean = hex.replace("#", "");
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return rgb(r, g, b);
  }
  return fallback;
}

/** Render a fully customized invoice PDF with Letter dimensions and custom field layouts.
 *  The final PDF is text-only on a blank page — the scanned template background is never
 *  embedded or printed. The editor canvas may display the template as a positioning guide,
 *  but it is intentionally excluded from all print and PDF output. */
export async function renderInvoicePdf(
  inv: InvoiceData,
  customLayout?: InvoiceLayout,
): Promise<Uint8Array> {
  const layout = customLayout || loadActiveLayout(inv.type);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${inv.type === "charge" ? "Charge" : "Cash"} Invoice ${inv.invoiceNumber || ""}`);
  doc.setCreator("SOS Invoice Template Converter by Adrian Llano");

  // Load only fonts — the template background image is intentionally NOT loaded or embedded.
  const [reg, bold] = await Promise.all([
    loadAsset("/fonts/DejaVuSans.ttf"),
    loadAsset("/fonts/DejaVuSans-Bold.ttf"),
  ]);
  const font = await doc.embedFont(reg, { subset: true });
  const fontB = await doc.embedFont(bold, { subset: true });

  const pageW = mmToPt(layout.pageWidthMm || LETTER_WIDTH_MM);
  const pageH = mmToPt(layout.pageHeightMm || LETTER_HEIGHT_MM);

  const fieldsMap = new Map<string, LayoutField>();
  layout.fields.forEach((f) => {
    fieldsMap.set(f.type, f);
    fieldsMap.set(f.id, f);
  });

  const getField = (type: string): LayoutField | undefined => {
    return fieldsMap.get(type);
  };

  /** Convert top-left millimeter coordinates to PDF bottom-left points */
  const toPdfBox = (field: LayoutField) => {
    const x = mmToPt(field.x);
    const y = pageH - mmToPt(field.y) - mmToPt(field.h);
    const w = mmToPt(field.w);
    const h = mmToPt(field.h);
    return { x, y, w, h };
  };

  const drawFieldText = (
    p: PDFPage,
    field: LayoutField | undefined,
    str: string,
    overrideFont?: PDFFont,
  ) => {
    if (!field || !field.visible || !str) return;
    const { x, y, w, h } = toPdfBox(field);
    const f = overrideFont || (field.fontWeight === "bold" ? fontB : font);
    const color = parseColor(field.color, INK);
    const sz = field.fontSize || 8;

    // Single-line or fitted text within width
    const textWidth = f.widthOfTextAtSize(str, sz);
    let textX = x;
    if (field.align === "right") {
      textX = x + w - textWidth;
    } else if (field.align === "center") {
      textX = x + (w - textWidth) / 2;
    }

    // Baseline placement in vertical center of field height
    const baselineY = y + (h - sz) / 2 + sz * 0.15;

    if (field.wrapText && textWidth > w) {
      // Split into lines
      const words = str.split(" ");
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (f.widthOfTextAtSize(test, sz) <= w) {
          current = test;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);

      const lineHeight = sz * 1.15;
      const totalH = lines.length * lineHeight;
      let startY = y + (h + totalH) / 2 - sz;

      for (const line of lines) {
        const lineW = f.widthOfTextAtSize(line, sz);
        let lineX = x;
        if (field.align === "right") lineX = x + w - lineW;
        else if (field.align === "center") lineX = x + (w - lineW) / 2;
        p.drawText(line, { x: lineX, y: startY, size: sz, font: f, color });
        startY -= lineHeight;
      }
    } else {
      // If single line exceeds width, auto shrink down to 6pt if needed
      let actualSize = sz;
      if (textWidth > w && w > 10) {
        while (actualSize > 6 && f.widthOfTextAtSize(str, actualSize) > w) {
          actualSize -= 0.25;
        }
        const newW = f.widthOfTextAtSize(str, actualSize);
        if (field.align === "right") textX = x + w - newW;
        else if (field.align === "center") textX = x + (w - newW) / 2;
      }

      p.drawText(str, { x: textX, y: baselineY, size: actualSize, font: f, color });
    }
  };

  const totals = calcTotals(inv.items, inv.whtRate);
  const rowsPerPage = layout.tableConfig?.rowCount || ROWS_PER_PAGE;
  const pageCount = Math.max(1, Math.ceil(inv.items.length / rowsPerPage));

  for (let pi = 0; pi < pageCount; pi++) {
    const p = doc.addPage([pageW, pageH]);

    // The template background image is intentionally NOT drawn in the PDF.
    // The output is text-only on a blank Letter-size page.

    // Invoice Serial Number
    const fSerial = getField("invoiceNumber");
    if (fSerial && fSerial.visible && inv.invoiceNumber) {
      drawFieldText(p, fSerial, inv.invoiceNumber, fontB);
    }

    // Header fields
    drawFieldText(p, getField("date"), inv.date);
    drawFieldText(p, getField("customer"), inv.customer);
    drawFieldText(p, getField("tin"), inv.tin);
    drawFieldText(p, getField("address"), inv.address);
    drawFieldText(p, getField("terms"), inv.terms);
    drawFieldText(p, getField("dueDate"), inv.dueDate);
    drawFieldText(p, getField("poNumber"), inv.poNumber);

    const fSalesRep = getField("salesRep");
    if (fSalesRep && fSalesRep.visible && inv.salesRep) {
      drawFieldText(p, fSalesRep, `Sales Rep: ${inv.salesRep}`);
    }

    // Line items table
    const fColItem = getField("colItem");
    const fColDesc = getField("colDesc");
    const fColQty = getField("colQty");
    const fColUnit = getField("colUnit");
    const fColAmount = getField("colAmount");

    const rowTop = layout.tableConfig?.rowTopMm || 81.5;
    const rowH = layout.tableConfig?.rowHeightMm || 6.3;

    const slice = inv.items.slice(pi * rowsPerPage, (pi + 1) * rowsPerPage);
    slice.forEach((it, i) => {
      const itemRowY = rowTop + i * rowH;
      const c = calcLine(it);

      const drawRowCol = (
        colField: LayoutField | undefined,
        textStr: string,
        overrideAlign?: "left" | "center" | "right",
      ) => {
        if (!colField || !colField.visible || !textStr) return;
        const colFieldClone: LayoutField = {
          ...colField,
          y: itemRowY,
          h: rowH,
          align: overrideAlign || colField.align,
        };
        drawFieldText(p, colFieldClone, textStr);
      };

      drawRowCol(fColItem, it.item);
      drawRowCol(fColDesc, it.description);
      drawRowCol(fColQty, it.qty, "center");
      if (c.valid) {
        drawRowCol(fColUnit, peso(c.vatUnit), "right");
        drawRowCol(fColAmount, peso(c.amount), "right");
      }
    });

    // Reference and page info
    const fRefNumber = getField("refNumber");
    if (fRefNumber && fRefNumber.visible && inv.invoiceNumber) {
      drawFieldText(p, fRefNumber, `Ref No.: ${inv.invoiceNumber}`);
    }

    const fPageNumber = getField("pageNumber");
    if (fPageNumber && fPageNumber.visible && pageCount > 1) {
      drawFieldText(p, fPageNumber, `Page ${pi + 1} of ${pageCount}`);
    }

    // Totals on final page
    if (pi === pageCount - 1) {
      drawFieldText(p, getField("totalSales"), peso(totals.totalSales));
      drawFieldText(p, getField("vat"), peso(totals.vat));
      drawFieldText(p, getField("net"), peso(totals.net));
      drawFieldText(p, getField("wht"), `(${peso(totals.wht)})`);
      drawFieldText(p, getField("due"), peso(totals.due), fontB);
      drawFieldText(p, getField("vatableSales"), peso(totals.net));
      drawFieldText(p, getField("vatAmount"), peso(totals.vat));
    }

    // Custom labels or static texts
    layout.fields
      .filter((f) => f.type === "customText" && f.visible && f.staticText)
      .forEach((customF) => {
        drawFieldText(p, customF, customF.staticText || "");
      });
  }

  return doc.save();
}
