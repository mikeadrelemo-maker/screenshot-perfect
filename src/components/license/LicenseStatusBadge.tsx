import { useEffect, useState } from "react";
import { KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { evaluateCurrentLicense, verifyActiveLicense } from "@/lib/license/store";
import type { LicenseStatus } from "@/lib/license/types";
import { LicenseDialog } from "./LicenseDialog";

export function LicenseStatusBadge() {
  const [status, setStatus] = useState<LicenseStatus>(() => evaluateCurrentLicense());
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    void verifyActiveLicense().then(setStatus);

    // Recheck on visibility change (when tab gains focus or user switches back)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setStatus(evaluateCurrentLicense());
      }
    };

    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);
    window.addEventListener("sos-license-changed", onVisibilityChange);
    return () => {
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
      window.removeEventListener("sos-license-changed", onVisibilityChange);
    };
  }, []);

  const isActive = status.type === "active";
  const isExpired = status.type === "expired";

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
          isActive
            ? "bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900/80"
            : isExpired
              ? "bg-rose-950/80 text-rose-300 border border-rose-500/50 hover:bg-rose-900/90 animate-pulse"
              : "bg-amber-950/70 text-amber-300 border border-amber-500/40 hover:bg-amber-900/80"
        }`}
        title={status.message}
      >
        {isActive ? (
          <>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>{status.remainingText ? status.remainingText : "Licensed"}</span>
          </>
        ) : isExpired ? (
          <>
            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
            <span>Expired — Reactivate</span>
          </>
        ) : (
          <>
            <KeyRound className="h-3.5 w-3.5 text-amber-400" />
            <span>Activate License</span>
          </>
        )}
      </button>

      <LicenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onLicenseChanged={setStatus}
      />
    </>
  );
}
