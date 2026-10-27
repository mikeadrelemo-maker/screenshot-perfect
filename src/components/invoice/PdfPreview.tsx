import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderInvoicePdf } from "@/lib/invoice/render";
import type { InvoiceData } from "@/lib/invoice/types";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function PdfPreview({ invoice }: { invoice: InvoiceData }) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printFrame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const bytes = await renderInvoicePdf(invoice);
        if (cancelled) return;
        const b = new Blob([bytes as BlobPart], { type: "application/pdf" });
        setBlob(b);
        setUrl((old) => {
          if (old) setTimeout(() => URL.revokeObjectURL(old), 5000);
          return URL.createObjectURL(b);
        });
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not generate the PDF.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [invoice]);

  const fileName = `${invoice.type === "charge" ? "Charge" : "Cash"}_Invoice_${invoice.invoiceNumber || "draft"}.pdf`.replace(/[^\w.-]+/g, "_");

  const print = () => {
    if (!url) return;
    printFrame.current?.remove();
    const f = document.createElement("iframe");
    f.style.position = "fixed";
    f.style.width = "0";
    f.style.height = "0";
    f.style.border = "0";
    f.src = url;
    f.onload = () => {
      try {
        f.contentWindow?.focus();
        f.contentWindow?.print();
      } catch {
        window.open(url, "_blank");
        toast.info("Opened the invoice in a new tab — print from there.");
      }
    };
    document.body.appendChild(f);
    printFrame.current = f;
  };

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{invoice.type === "charge" ? "Charge Invoice" : "Cash Invoice"} preview</h2>
          <p className="text-xs text-muted-foreground">Exact PDF output · 8.26 × 10.76 in</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={print} disabled={!url || busy}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button size="sm" onClick={() => blob && downloadBlob(blob, fileName)} disabled={!blob || busy}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>
      <div className="relative min-h-[640px] flex-1 bg-muted">
        {error && <p className="p-6 text-sm text-destructive">PDF generation failed: {error}</p>}
        {url && !error && <iframe title="Invoice preview" src={`${url}#toolbar=0&view=FitH`} className="absolute inset-0 h-full w-full" />}
        {busy && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-card px-2 py-1 text-xs text-muted-foreground shadow">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating
          </div>
        )}
      </div>
    </div>
  );
}
