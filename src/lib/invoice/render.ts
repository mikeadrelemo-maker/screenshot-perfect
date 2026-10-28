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

// Vite asset imports resolve to exact hashed asset URLs across dev and production builds
import timesRomanUrl from "@/assets/fonts/TimesNewRoman.ttf?url";
import timesRomanBoldUrl from "@/assets/fonts/TimesNewRoman-Bold.ttf?url";

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

/**
 * Render a clean, text-only invoice PDF using Times New Roman typography on Letter-size paper.
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

  // Load only fonts â€” the template background image is intentionally NOT loaded or embedded.
  const families = new Set<InvoiceFontFamily>(["Liberation Serif"]);
  layout.fields.forEach((field) => families.add(field.fontFamily || "Liberation Serif"));
  const fonts = new Map<InvoiceFontFamily, { regular: PDFFont; bold: PDFFont }>();
  await Promise.all(
    [...families].map(async (family) => {
      const [reg, bold] = await Promise.all([
        loadInvoiceFont(family),
        loadInvoiceFont(family, true),
      ]);
      fonts.set(family, {
        regular: await doc.embedFont(reg, { subset: true }),
        bold: await doc.embedFont(bold, { subset: true }),
      });
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

  /** Convert top-left millimeter coordinates to PDF bottom-left points */
  const toPdfBox = (field: LayoutField) => {
    const x = mmToPt(field.x);
    const y = pageH - mmToPt(field.y) - mmToPt(field.h);
    const w = mmToPt(field.w);
    const h = mmToPt(field.h);
    return { x, y, w, h };
  };

  const sanitizeText = (rawStr: string) => rawStr || "";

  const drawFieldText = (
    p: PDFPage,
    field: LayoutField | undefined,
    rawStr: string,
    forceBold = false,
  ) => {
    if (!field || !field.visible || !rawStr) return;
    const str = sanitizeText(rawStr);
    if (!str.trim()) return;

    const { x, y, w, h } = toPdfBox(field);
    const familyFonts = fonts.get(field.fontFamily || "Liberation Serif");
    if (!familyFonts) throw new Error("Invoice font was not registered.");
    const f = forceBold || field.fontWeight === "bold" ? familyFonts.bold : familyFonts.regular;
    const color = parseColor(field.color, INK);
    const sz = field.fontSize || 8;

    if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > pageW + 0.01 || y + h > pageH + 0.01) {
      throw new Error(
        `Field "${field.name}" is outside the Letter page. Adjust its position or size.`,
      );
    }
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
      (lines.some((line) => f.widthOfTextAtSize(line, size) > w) || lines.length * size * 1.15 > h)
    ) {
      size = Math.max(4, size - 0.25);
      lines = linesAt(size);
    }
    if (
      lines.some((line) => f.widthOfTextAtSize(line, size) > w) ||
      lines.length * size * 1.15 > h
    ) {
      throw new Error(
        `Text does not fit "${field.name}". Increase the field size or enable wrapping.`,
      );
    }
    const lineHeight = size * 1.15;
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
          drawFieldText(p, getField("wht1") || getField("wht"), `(${peso(totals.wht1)})`);
        }
      }

      // Withholding Tax 2: Print ONLY percentage in designated label area
      if (totals.wht2Enabled) {
        const rate2 = inv.wht2Rate ?? inv.whtRate2 ?? "5";
        const rate2Str = `${rate2}%`;
        drawFieldText(p, getField("whtRate2") || getField("wht2Rate"), rate2Str);
        if (totals.wht2.gt(0)) {
          drawFieldText(p, getField("wht2"), `(${peso(totals.wht2)})`);
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

