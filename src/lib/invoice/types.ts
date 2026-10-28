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
  invoiceNumber: string;
  date: string;
  customer: string;
  tin: string;
  address: string;
  terms: string;
  dueDate: string;
  poNumber: string;
  salesRep: string;
  whtRate: string; // percent, default "1"
  whtRate2?: string;
  whtEnabled?: boolean;
  whtEnabled2?: boolean;
  sourceInvoiceNumber?: string;
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
    date: "",
    customer: "",
    tin: "",
    address: "",
    terms: "",
    dueDate: "",
    poNumber: "",
    salesRep: "",
    whtRate: "1",
    whtRate2: "5",
    whtEnabled: true,
    whtEnabled2: true,
    items: [],
    status: "draft",
    updatedAt: new Date().toISOString(),
  };
}
