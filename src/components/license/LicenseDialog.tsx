import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Lock, ShieldCheck, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  activateLicense,
  evaluateCurrentLicense,
  formatRemainingTime,
  verifyActiveLicense,
} from "@/lib/license/store";
import type { LicenseStatus } from "@/lib/license/types";

interface LicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLicenseChanged?: (status: LicenseStatus) => void;
}

export function LicenseDialog({ open, onOpenChange, onLicenseChanged }: LicenseDialogProps) {
  const [status, setStatus] = useState<LicenseStatus>(() => evaluateCurrentLicense());
  const [licenseInput, setLicenseInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshStatus = async () => {
    const s = await verifyActiveLicense();
    setStatus(s);
    if (onLicenseChanged) onLicenseChanged(s);
  };

  useEffect(() => {
    if (open) {
      void refreshStatus();
      setErrorMsg(null);
    }
  }, [open]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!licenseInput.trim()) {
      setErrorMsg("Please paste your license code.");
      return;
    }

    setBusy(true);
    try {
      const res = await activateLicense(licenseInput);
      setStatus(res);
      if (onLicenseChanged) onLicenseChanged(res);

      if (res.isValid) {
        toast.success(`License activated successfully for ${res.record?.payload.holder}!`);
        setLicenseInput("");
        onOpenChange(false);
      } else {
        setErrorMsg(res.message);
        toast.error(res.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to activate license.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const isExpired = status.type === "expired";
  const isActive = status.type === "active";
  const isUnlicensed = status.type === "unlicensed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className={`grid h-8 w-8 place-items-center rounded-full ${isActive ? "bg-emerald-100 text-emerald-700" : isExpired ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
              {isActive ? <ShieldCheck className="h-4 w-4" /> : isExpired ? <ShieldAlert className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
            </div>
            <div>
              <DialogTitle>License & Activation</DialogTitle>
              <DialogDescription className="text-xs">
                Manage your SOS Invoice Template Converter license
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Current Status Box */}
        <div className={`rounded-lg border p-3.5 text-xs ${isActive ? "border-emerald-200 bg-emerald-50/60 text-emerald-950" : isExpired ? "border-rose-200 bg-rose-50/60 text-rose-950" : "border-amber-200 bg-amber-50/60 text-amber-950"}`}>
          <div className="flex items-center justify-between font-semibold">
            <span className="flex items-center gap-1.5">
              {isActive && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              {isExpired && <XCircle className="h-4 w-4 text-rose-600" />}
              {isUnlicensed && <AlertTriangle className="h-4 w-4 text-amber-600" />}
              Status: {isActive ? "Active License" : isExpired ? "License Expired" : "Not Licensed"}
            </span>
            {isActive && status.remainingText && (
              <span className="rounded bg-emerald-200/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-900">
                {status.remainingText}
              </span>
            )}
          </div>

          <p className="mt-1.5 leading-relaxed text-muted-foreground">{status.message}</p>

          {status.record && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/40 pt-2.5 font-mono text-[11px]">
              <div>
                <span className="text-muted-foreground">License Holder:</span>
                <p className="font-semibold text-foreground truncate">{status.record.payload.holder}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Duration:</span>
                <p className="font-semibold text-foreground">
                  {status.record.payload.duration === "1d" ? "1 Day (24h)" : status.record.payload.duration === "1m" ? "1 Month" : "1 Year"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Activated On:</span>
                <p className="font-semibold text-foreground">
                  {new Date(status.record.activatedAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Expires On:</span>
                <p className="font-semibold text-foreground">
                  {new Date(status.record.payload.expiresAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Enter / Reactivate License Form */}
        <form onSubmit={handleActivate} className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-semibold text-foreground">
              {isActive ? "Enter New License Code to Extend / Renew" : "Enter License Code"}
            </label>
            <div className="mt-1">
              <Input
                placeholder="Paste code (e.g. SOSLIC-eyJpZCI...)"
                value={licenseInput}
                onChange={(e) => setLicenseInput(e.target.value)}
                className="font-mono text-xs"
                disabled={busy}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Paste the license code generated by your administrator using the HTML License Generator.
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-1.5 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Close
            </Button>
            <Button type="submit" size="sm" disabled={busy || !licenseInput.trim()}>
              {busy ? "Verifying…" : isActive ? "Reactivate / Renew" : "Activate License"}
            </Button>
          </div>
        </form>

        <p className="text-center text-[10px] text-muted-foreground">
          Note: Your saved invoice history and customized print layouts are preserved indefinitely and will never be deleted when a license expires.
        </p>
      </DialogContent>
    </Dialog>
  );
}
