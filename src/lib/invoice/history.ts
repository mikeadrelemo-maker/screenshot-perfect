import type { InvoiceData } from "./types";

/*
 * Persistent cloud storage is not configured for this app, so saved invoices
 * live in this browser's local storage. The UI states this clearly.
 */
const KEY = "sos-invoice-history-v1";

export function loadHistory(): InvoiceData[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as InvoiceData[];
  } catch {
    return [];
  }
}

export function saveInvoice(inv: InvoiceData): InvoiceData {
  const list = loadHistory();
  const saved = { ...inv, status: "saved" as const, updatedAt: new Date().toISOString() };
  const idx = list.findIndex((i) => i.id === inv.id);
  if (idx >= 0) list[idx] = saved;
  else list.unshift(saved);
  localStorage.setItem(KEY, JSON.stringify(list));
  return saved;
}

export function deleteInvoice(id: string) {
  localStorage.setItem(KEY, JSON.stringify(loadHistory().filter((i) => i.id !== id)));
}

export function findDuplicate(inv: InvoiceData): InvoiceData | undefined {
  const n = inv.invoiceNumber.trim().toLowerCase();
  if (!n) return undefined;
  return loadHistory().find((i) => i.id !== inv.id && i.invoiceNumber.trim().toLowerCase() === n);
}
