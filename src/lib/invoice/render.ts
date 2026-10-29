import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
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
import { loadInvoiceFont, type InvoiceFontFamily } from "./fonts";

export const ROWS_PER_PAGE = 10;

const INK = rgb(0.05, 0.07, 0.16);

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

async function getPdfFontPair(
  doc: PDFDocument,
  family: InvoiceFontFamily,
): Promise<{ regular: PDFFont; bold: PDFFont }> {
  switch (family) {
    case "Courier New":
      return {
        regular: await doc.embedFont(StandardFonts.Courier),
        bold: await doc.embedFont(StandardFonts.CourierBold),
      };
    case "Arial":
    case "Helvetica":
    case "Verdana":
    case "Tahoma":
      return {
        regular: await doc.embedFont(StandardFonts.Helvetica),
        bold: await doc.embedFont(StandardFonts.HelveticaBold),
      };
    case "Times New Roman":
    case "Georgia":
      return {
        regular: await doc.embedFont(StandardFonts.TimesRoman),
        bold: await doc.embedFont(StandardFonts.TimesRomanBold),
      };
    case "DejaVu Sans":
      try {
        const [reg, bold] = await Promise.all([
          loadInvoiceFont("DejaVu Sans"),
          loadInvoiceFont("DejaVu Sans", true),
        ]);
        return {
          regular: await doc.embedFont(reg, { subset: true }),
          bold: await doc.embedFont(bold, { subset: true }),
        };
      } catch {
        return {
          regular: await doc.embedFont(StandardFonts.Helvetica),
          bold: await doc.embedFont(StandardFonts.HelveticaBold),
        };
      }
    case "Liberation Serif":
    default:
      try {
        const [reg, bold] = await Promise.all([
          loadInvoiceFont("Liberation Serif"),
          loadInvoiceFont("Liberation Serif", true),
        ]);
        return {
          regular: await doc.embedFont(reg, { subset: true }),
          bold: await doc.embedFont(bold, { subset: true }),
        };
      } catch {
        return {
          regular: await doc.embedFont(StandardFonts.TimesRoman),
          bold: await doc.embedFont(StandardFonts.TimesRomanBold),
        };
      }
  }
}

/**
 * Render a clean, text-only invoice PDF using configured layout and typography on Letter-size paper.
 * - Template background artwork is intentionally NOT rendered in the PDF.
 * - Supports independent multiple withholding taxes (WHT 1 and WHT 2).
 * - Optional fields (Business Address, Reference/PO No.) render only when supplied.
 * - Detected source invoice number is not printed automatically unless manually entered.
 */
export async function renderInvoicePdf(
  inv: InvoiceData,
  customLayout?: InvoiceLayout,
): Promise<Uint8Array> {
  const layout = customLayout || loadActiveLayout(inv.type);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${inv.type === "charge" ? "Charge" : "Cash"} Invoice ${inv.invoiceNumber || ""}`);
  doc.setCreator("SOS Invoice Template Converter by Adrian Llano");

  // Load only required font families
  const families = new Set<InvoiceFontFamily>(["Liberation Serif"]);
  layout.fields.forEach((field) => {
    if (field.fontFamily) families.add(field.fontFamily);
  });

  const fonts = new Map<InvoiceFontFamily, { regular: PDFFont; bold: PDFFont }>();
  await Promise.all(
    [...families].map(async (family) => {
      fonts.set(family, await getPdfFontPair(doc, family));
    }),
  );

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

  /** Convert top-left millimeter coordinates to PDF bottom-left points, ensuring bounds are safe */
  const toPdfBox = (field: LayoutField) => {
    const rawX = mmToPt(field.x);
    const rawY = mmToPt(field.y);
    const rawW = mmToPt(field.w);
    const rawH = mmToPt(field.h);

    const x = Math.max(0, Math.min(rawX, Math.max(0, pageW - 2)));
    const w = Math.max(2, Math.min(rawW, Math.max(2, pageW - x)));
    const h = Math.max(2, Math.min(rawH, pageH));
    const y = Math.max(0, Math.min(pageH - rawY - h, pageH - h));
    return { x, y, w, h };
  };

  const sanitizeTextForFont = (rawStr: string, font: PDFFont): string => {
    if (!rawStr) return "";
    let text = rawStr;
    try {
      font.encodeText(text);
      return text;
    } catch {
      text = text.replace(/\u20B1/g, "PHP ");
      try {
        font.encodeText(text);
        return text;
      } catch {
        return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
      }
    }
  };

  const drawFieldText = (
    p: PDFPage,
    field: LayoutField | undefined,
    rawStr: string,
    forceBold = false,
  ) => {
    if (!field || !field.visible || !rawStr) return;

    const { x, y, w, h } = toPdfBox(field);
    const familyFonts = fonts.get(field.fontFamily || "Liberation Serif") || fonts.get("Liberation Serif");
    if (!familyFonts) throw new Error("Invoice font was not registered.");
    const f = forceBold || field.fontWeight === "bold" ? familyFonts.bold : familyFonts.regular;
    const str = sanitizeTextForFont(rawStr, f);
    if (!str.trim()) return;
    const color = parseColor(field.color, INK);
    const sz = field.fontSize || 8;
    const lineSpacingMultiplier = field.lineHeight || 1.15;

    // Fit both dimensions; split long words as well as ordinary paragraphs.
    const linesAt = (size: number): string[] => {
      if (!field.wrapText) return [str.replace(/\s*\n\s*/g, " ")];
      const lines: string[] = [];
      for (const paragraph of str.split("\n")) {
        let current = "";
        for (const word of paragraph.split(/\s+/)) {
          const test = current ? `${current} ${word}` : word;
          if (f.widthOfTextAtSize(test, size) <= w) {
            current = test;
            continue;
          }
          if (current) lines.push(current);
          current = "";
          for (const char of word) {
            if (current && f.widthOfTextAtSize(current + char, size) > w) {
              lines.push(current);
              current = "";
            }
            current += char;
          }
        }
        lines.push(current);
      }
      return lines;
    };

    let size = sz;
    let lines = linesAt(size);
    while (
      size > 4 &&
      (lines.some((line) => f.widthOfTextAtSize(line, size) > w) || lines.length * size * lineSpacingMultiplier > h)
    ) {
      size = Math.max(4, size - 0.25);
      lines = linesAt(size);
    }

    const lineHeight = size * lineSpacingMultiplier;
    // Constrain lines to available vertical height if still exceeding
    const maxVisibleLines = Math.max(1, Math.floor(h / lineHeight));
    if (lines.length > maxVisibleLines) {
      lines = lines.slice(0, maxVisibleLines);
    }
    // Truncate any line that still slightly exceeds width at min size
    lines = lines.map((line) => {
      let l = line;
      while (l.length > 1 && f.widthOfTextAtSize(l, size) > w) {
        l = l.slice(0, -1);
      }
      return l;
    });

    let baseline = y + (h + lines.length * lineHeight) / 2 - size;
    for (const line of lines) {
      const width = f.widthOfTextAtSize(line, size);
      const textX =
        field.align === "right"
          ? x + w - width
          : field.align === "center"
            ? x + (w - width) / 2
            : x;
      p.drawText(line, { x: textX, y: baseline, size, font: f, color });
      baseline -= lineHeight;
    }
  };

  const totals = calcTotals(inv.items, inv.whtRate, inv.whtRate2, inv.whtEnabled, inv.whtEnabled2);
  const rowsPerPage = layout.tableConfig?.rowCount || ROWS_PER_PAGE;
  const pageCount = Math.max(1, Math.ceil(inv.items.length / rowsPerPage));

  for (let pi = 0; pi < pageCount; pi++) {
    const p = doc.addPage([pageW, pageH]);

    // Printable Invoice Number (only rendered if user entered a value)
    const fSerial = getField("invoiceNumber");
    if (fSerial && fSerial.visible && inv.invoiceNumber) {
      drawFieldText(p, fSerial, inv.invoiceNumber, true);
    }

    // Header fields
    drawFieldText(p, getField("date"), inv.date);
    drawFieldText(p, getField("customer"), inv.customer);
    drawFieldText(p, getField("tin"), inv.tin);
    drawFieldText(p, getField("address"), inv.address); // optional
    drawFieldText(p, getField("terms"), inv.terms);
    drawFieldText(p, getField("dueDate"), inv.dueDate);
    drawFieldText(p, getField("poNumber"), inv.poNumber); // optional

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

    const rowTop = layout.tableConfig?.rowTopMm || (inv.type === "charge" ? 81.5 : 86.0);
    const rowH = layout.tableConfig?.rowHeightMm || (inv.type === "charge" ? 6.3 : 6.25);

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
      drawRowCol(fColQty, it.qty);
      if (c.valid) {
        drawRowCol(fColUnit, peso(c.vatUnit));
        drawRowCol(fColAmount, peso(c.amount));
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
      // Withholding Tax 1: Print ONLY percentage in designated label area
      if (totals.wht1Enabled) {
        const rate1 = inv.wht1Rate ?? inv.whtRate ?? "1";
        const rate1Str = `${rate1}%`;
        drawFieldText(p, getField("whtRate") || getField("wht1Rate"), rate1Str);
        if (totals.wht1.gt(0)) {
          drawFieldText(p, getField("wht1") || getField("wht"), `-${peso(totals.wht1)}`);
        }
      }

      // Withholding Tax 2: Print ONLY percentage in designated label area
      if (totals.wht2Enabled) {
        const rate2 = inv.wht2Rate ?? inv.whtRate2 ?? "5";
        const rate2Str = `${rate2}%`;
        drawFieldText(p, getField("whtRate2") || getField("wht2Rate"), rate2Str);
        if (totals.wht2.gt(0)) {
          drawFieldText(p, getField("wht2"), `-${peso(totals.wht2)}`);
        }
      }
      drawFieldText(p, getField("due"), peso(totals.due), true);
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
