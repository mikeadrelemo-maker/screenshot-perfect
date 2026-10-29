import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, FilePlus2, KeyRound, Save, ShieldAlert, Sliders } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UploadZone } from "@/components/invoice/UploadZone";
import { InvoiceEditor } from "@/components/invoice/InvoiceEditor";
import { PdfPreview } from "@/components/invoice/PdfPreview";
import { emptyInvoice, type InvoiceData, type InvoiceType } from "@/lib/invoice/types";
import { findDuplicate, loadHistory, saveInvoice } from "@/lib/invoice/history";
import { loadActiveLayout } from "@/lib/invoice/layout-store";
import { createDefaultLayout, type InvoiceLayout } from "@/lib/invoice/layout-types";
import { evaluateCurrentLicense, verifyActiveLicense } from "@/lib/license/store";
import type { LicenseStatus } from "@/lib/license/types";
import { LicenseDialog } from "@/components/license/LicenseDialog";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s["id"] === "string" ? { id: s["id"] } : {},
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Convert SOS Invoice — SOS Invoice Template Converter" },
      {
        name: "description",
        content:
          "Upload an SOS Inventory PDF, review VAT totals, and print Charge or Cash invoices.",
      },
      { property: "og:title", content: "SOS Invoice Template Converter" },
      {
        property: "og:description",
        content:
          "Turn SOS Inventory PDFs into printable Charge and Cash invoices with VAT and withholding tax.",
      },
      {
        name: "author",
        content: "Adrian Llano",
      },
    ],
  }),
  component: ConvertPage,
});

function ConvertPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const [inv, setInv] = useState<InvoiceData>(() => emptyInvoice());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dup, setDup] = useState<InvoiceData | undefined>();
  const [activeLayout, setActiveLayout] = useState<InvoiceLayout>(() =>
    loadActiveLayout("charge"),
  );
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>(() => evaluateCurrentLicense());
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);

  useEffect(() => {
    void verifyActiveLicense().then(setLicenseStatus);

    const onLicenseUpdate = () => {
      setLicenseStatus(evaluateCurrentLicense());
    };

    window.addEventListener("focus", onLicenseUpdate);
    window.addEventListener("visibilitychange", onLicenseUpdate);
    window.addEventListener("sos-license-changed", onLicenseUpdate);
    return () => {
      window.removeEventListener("focus", onLicenseUpdate);
      window.removeEventListener("visibilitychange", onLicenseUpdate);
      window.removeEventListener("sos-license-changed", onLicenseUpdate);
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    const found = loadHistory().find((i) => i.id === id);
    if (found) {
      setInv(found);
      setWarnings([]);
      setError(null);
    } else toast.error("That saved invoice was not found in this browser.");
  }, [id]);

  useEffect(() => setDup(findDuplicate(inv)), [inv.invoiceNumber, inv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refresh = () => setActiveLayout(loadActiveLayout(inv.type));
    refresh();

    window.addEventListener("focus", refresh);
    window.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("sos-layout-changed", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("sos-layout-changed", refresh);
    };
  }, [inv.type]);

  const onFile = async (file: File) => {
    if (!licenseStatus.isValid) {
      toast.error(
        licenseStatus.type === "expired"
          ? "Your license has expired. Please reactivate your license to convert invoices."
          : "A valid license is required to convert invoices. Please activate your license.",
      );
      setLicenseDialogOpen(true);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { extractInvoiceFromPdf } = await import("@/lib/invoice/extract");
      const res = await extractInvoiceFromPdf(file);
      setInv(res.invoice);
      setWarnings(res.warnings);
      navigate({ to: "/", search: {}, replace: true });
      if (res.invoice.items.length)
        toast.success(`Read ${res.invoice.items.length} item(s) from ${file.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The PDF could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const setType = (type: InvoiceType) => setInv((v) => ({ ...v, type }));
  const previewInvoice = useMemo(() => inv, [inv]);

  const save = () => {
    if (!licenseStatus.isValid) {
      toast.error(
        licenseStatus.type === "expired"
          ? "Your license has expired. Please reactivate your license to save invoices."
          : "A valid license is required to save invoices. Please activate your license.",
      );
      setLicenseDialogOpen(true);
      return;
    }

    const saved = saveInvoice(inv);
    setInv(saved);
    navigate({ to: "/", search: { id: saved.id }, replace: true });
    toast.success(`Saved invoice ${saved.invoiceNumber || "(no number)"}`);
  };

  return (
    <main className="mx-auto max-w-[1500px] px-5 py-6">
      {/* License Warning Banner if Unlicensed or Expired */}
      {!licenseStatus.isValid && (
        <div
          className={cn(
            "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 shadow-sm",
            licenseStatus.type === "expired"
              ? "border-destructive/40 bg-destructive/10 text-destructive dark:bg-destructive/20"
              : "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
          )}
        >
          <div className="flex items-center gap-3">
            {licenseStatus.type === "expired" ? (
              <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
            ) : (
              <KeyRound className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <div>
              <p className="text-sm font-semibold">
                {licenseStatus.type === "expired"
                  ? "License Expired"
                  : "License Activation Required"}
              </p>
              <p className="text-xs opacity-90">
                {licenseStatus.type === "expired"
                  ? licenseStatus.message
                  : "A valid license is required to convert, download, print, and save invoices. Saved data and layouts remain safe."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={licenseStatus.type === "expired" ? "destructive" : "default"}
            onClick={() => setLicenseDialogOpen(true)}
            className="shrink-0"
          >
            <KeyRound className="mr-1.5 h-4 w-4" />
            {licenseStatus.type === "expired" ? "Reactivate License" : "Activate License"}
          </Button>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Convert SOS invoice</h1>
          <p className="text-sm text-muted-foreground">
            Upload, review the extracted data, then print or download.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs text-muted-foreground"
            title="Cloud storage is not configured"
          >
            <Database className="h-3.5 w-3.5" /> Cloud storage not configured — history is saved in
            this browser only
          </span>
          <Link to="/editor" search={{ type: inv.type }}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Sliders className="h-4 w-4" /> Customize Print Layout
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setInv(emptyInvoice(inv.type));
              setWarnings([]);
              setError(null);
              navigate({ to: "/", search: {}, replace: true });
            }}
          >
            <FilePlus2 className="h-4 w-4" /> New
          </Button>
          <Button size="sm" onClick={save}>
            <Save className="h-4 w-4" /> Save to history
          </Button>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <UploadZone onFile={onFile} busy={busy} />
            <div className="rounded-lg border bg-card p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Invoice type</p>
              <div className="grid grid-cols-1 gap-2" role="radiogroup">
                {(["charge", "cash"] as const).map((t) => (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={inv.type === t}
                    onClick={() => setType(t)}
                    className={cn(
                      "rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      inv.type === t
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    {t === "charge" ? "Charge Invoice" : "Cash Invoice"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="flex gap-2 rounded-lg border border-destructive/40 bg-card p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {(warnings.length > 0 || dup) && (
            <div className="space-y-1 rounded-lg border border-warning bg-warning-soft p-3 text-sm text-warning-foreground">
              {dup && (
                <p className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Invoice number {inv.invoiceNumber} already exists in history (
                  {dup.customer || "no customer"}). Saving will keep both.
                </p>
              )}
              {warnings.map((w) => (
                <p key={w} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}

          <InvoiceEditor value={inv} onChange={setInv} />
        </div>

        <div className="2xl:sticky 2xl:top-4 2xl:h-[calc(100vh-2rem)]">
          <PdfPreview
            invoice={previewInvoice}
            customLayout={activeLayout}
            isLicensed={licenseStatus.isValid}
            onOpenLicense={() => setLicenseDialogOpen(true)}
          />
        </div>
      </div>

      <LicenseDialog
        open={licenseDialogOpen}
        onOpenChange={setLicenseDialogOpen}
        onLicenseChanged={setLicenseStatus}
      />
    </main>
  );
}
