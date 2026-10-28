import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Lock, Printer, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderInvoicePdf } from "@/lib/invoice/render";
import type { InvoiceData } from "@/lib/invoice/types";
import type { InvoiceLayout } from "@/lib/invoice/layout-types";

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

export function PdfPreview({
  invoice,
  customLayout,
  isLicensed = true,
  onOpenLicense,
}: {
  invoice: InvoiceData;
  customLayout?: InvoiceLayout;
  isLicensed?: boolean;
  onOpenLicense?: () => void;
}) {
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
        const bytes = await renderInvoicePdf(invoice, customLayout);
        if (cancelled) return;
        const b = new Blob([bytes as BlobPart], { type: "application/pdf" });
        setBlob(b);
        setUrl((old) => {
          if (old) setTimeout(() => URL.revokeObjectURL(old), 5000);
          return URL.createObjectURL(b);
        });
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setBlob(null);
          setError(e instanceof Error ? e.message : "Could not generate the PDF.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [invoice, customLayout]);

  const fileName =
    `${invoice.type === "charge" ? "Charge" : "Cash"}_Invoice_${invoice.invoiceNumber || "draft"}.pdf`.replace(
      /[^\w.-]+/g,
      "_",
    );

  const print = () => {
    if (!isLicensed) {
      toast.error("Printing is locked. Please activate or reactivate your license.");
      if (onOpenLicense) onOpenLicense();
      return;
    }
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

  const handleDownload = () => {
    if (!isLicensed) {
      toast.error("PDF download is locked. Please activate or reactivate your license.");
      if (onOpenLicense) onOpenLicense();
      return;
    }
    if (blob) downloadBlob(blob, fileName);
  };

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">
            {invoice.type === "charge" ? "Charge Invoice" : "Cash Invoice"} preview
          </h2>
          <p className="text-xs text-muted-foreground">
            US Letter PDF output · 8.5 × 11 in (215.9 × 279.4 mm)
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={print}
            disabled={!url || busy || !!error || !isLicensed}
            title={!isLicensed ? "License required to print" : undefined}
          >
            {!isLicensed ? <Lock className="h-3.5 w-3.5" /> : <Printer className="h-4 w-4" />} Print
          </Button>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={!blob || busy || !!error || !isLicensed}
            title={!isLicensed ? "License required to download PDF" : undefined}
          >
            {!isLicensed ? <Lock className="h-3.5 w-3.5" /> : <Download className="h-4 w-4" />} Download PDF
          </Button>
        </div>
      </div>
      <div className="relative min-h-[640px] flex-1 bg-muted">
        {error && <p className="p-6 text-sm text-destructive">PDF generation failed: {error}</p>}
        {url && !error && (
          <iframe
            title="Invoice preview"
            src={`${url}#toolbar=0&view=FitH`}
            className="absolute inset-0 h-full w-full"
          />
        )}

        {!isLicensed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 p-6 text-center backdrop-blur-sm">
            <div className="max-w-sm rounded-xl border border-destructive/30 bg-card p-6 shadow-xl">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-rose-600">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground">License Required</h3>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Printing and exporting are locked. Activate or renew your license code to unlock full printable invoices.
              </p>
              {onOpenLicense && (
                <Button size="sm" className="mt-4 w-full gap-1.5" onClick={onOpenLicense}>
                  <Lock className="h-3.5 w-3.5" /> Activate License
                </Button>
              )}
            </div>
          </div>
        )}

        {busy && (
          <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-md bg-card px-2 py-1 text-xs text-muted-foreground shadow">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating
          </div>
        )}
      </div>
    </div>
  );
}
