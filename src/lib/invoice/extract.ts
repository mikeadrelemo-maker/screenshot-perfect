import { parseSosTokens, type ParseResult, type TextToken } from "./parse";

export class ExtractionError extends Error {}

/** Browser-only: read the text layer of an SOS PDF and map it to invoice fields. */
export async function extractInvoiceFromPdf(file: File): Promise<ParseResult> {
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new ExtractionError("Unsupported file. Please upload a PDF exported from SOS Inventory.");
  }
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  } catch {
    throw new ExtractionError("This file could not be opened as a PDF. It may be damaged or password-protected.");
  }
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const tokens: TextToken[] = [];
  for (const it of content.items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const [, , , , e, f] = it.transform;
    tokens.push({ str: it.str, x: e, y: vp.height - f - (it.height || 8), w: it.width });
  }
  if (tokens.length < 5) {
    throw new ExtractionError(
      "No readable text was found — this looks like a scanned PDF. OCR is not configured for this app, so please upload the digital PDF exported from SOS, or enter the details manually.",
    );
  }
  const res = parseSosTokens(tokens, file.name);
  if (pdf.numPages > 1) res.warnings.push(`Only page 1 of ${pdf.numPages} was read — check for missing items.`);
  return res;
}
