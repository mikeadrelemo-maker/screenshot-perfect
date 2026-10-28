export type InvoiceType = "charge" | "cash";

export interface LineItem {
  id: string;
  item: string;
  description: string;
  qty: string; // kept as strings so edits stay exact
  unitPrice: string; // original (VAT-exclusive) unit price from SOS
}

export interface InvoiceData {
  id: string;
  type: InvoiceType;
  invoiceNumber: string; // target printable invoice number (empty by default)
  sourceInvoiceNumber?: string; // detected from uploaded source PDF (not automatically printed)
  date: string;
  customer: string;
  tin: string;
  address: string; // optional business address
  terms: string;
  dueDate: string;
  poNumber: string; // optional reference / PO number
  salesRep: string;
  // Multiple withholding taxes:
  wht1Rate: string; // default "1"
  wht1Enabled: boolean; // default true
  wht2Rate: string; // default "5"
  wht2Enabled: boolean; // default false
  whtRate?: string; // legacy fallback
  items: LineItem[];
  sourceFile?: string;
  sourceTotal?: string; // total printed on the source PDF, for cross-checking
  status: "draft" | "saved";
  updatedAt: string;
}

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function emptyInvoice(type: InvoiceType = "charge"): InvoiceData {
  return {
    id: newId(),
    type,
    invoiceNumber: "",
    sourceInvoiceNumber: "",
    date: "",
    customer: "",
    tin: "",
    address: "",
    terms: "",
    dueDate: "",
    poNumber: "",
    salesRep: "",
    wht1Rate: "1",
    wht1Enabled: true,
    wht2Rate: "5",
    wht2Enabled: false,
    items: [],
    status: "draft",
    updatedAt: new Date().toISOString(),
  };
}
