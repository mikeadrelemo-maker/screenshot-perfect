import { verifyLicenseCode } from "./crypto";
import type { LicenseRecord, LicenseStatus } from "./types";

const STORAGE_KEY_V1 = "sos_license_record_v1";

/**
 * Format remaining time in a human-readable string:
 * - "30 days left" / "1 day, 4 hours left" / "18 hours left" / "45 minutes left"
 */
export function formatRemainingTime(ms: number): string {
  if (ms <= 0) return "Expired";

  const totalMinutes = Math.floor(ms / (1000 * 60));
  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  const remainingMinutes = totalMinutes % 60;

  if (days > 1) {
    return `${days} days remaining`;
  }
  if (days === 1) {
    return remainingHours > 0 ? `1 day, ${remainingHours}h remaining` : "1 day remaining";
  }
  if (totalHours >= 1) {
    return `${totalHours}h ${remainingMinutes}m remaining`;
  }
  return `${Math.max(1, remainingMinutes)} minutes remaining`;
}

/**
 * Read the saved license record from versioned localStorage.
 */
export function getSavedLicenseRecord(): LicenseRecord | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.rawCode || !parsed.payload) {
      return null;
    }
    return parsed as LicenseRecord;
  } catch (err) {
    console.error("Failed to parse stored license record:", err);
    return null;
  }
}

/**
 * Save the license record to versioned localStorage.
 */
export function saveLicenseRecord(record: LicenseRecord): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(record));
  window.dispatchEvent(new CustomEvent("sos-license-changed"));
}

/**
 * Clear the license record (for reactivation or reset).
 * IMPORTANT: Does NOT delete invoice history or print layouts.
 */
export function clearLicenseRecord(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  localStorage.removeItem(STORAGE_KEY_V1);
  window.dispatchEvent(new CustomEvent("sos-license-changed"));
}

/**
 * Synchronously evaluate the currently stored license status.
 */
export function evaluateCurrentLicense(now: Date = new Date()): LicenseStatus {
  const record = getSavedLicenseRecord();
  if (!record) {
    return {
      type: "unlicensed",
      isValid: false,
      message: "No active license found. Please activate a license to unlock full features.",
    };
  }

  const expiresAt = new Date(record.payload.expiresAt);
  if (isNaN(expiresAt.getTime())) {
    return {
      type: "invalid",
      isValid: false,
      message: "Stored license has an invalid expiration date format.",
      record,
    };
  }

  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return {
      type: "expired",
      isValid: false,
      message: `License expired on ${expiresAt.toLocaleDateString()} at ${expiresAt.toLocaleTimeString()}. Please enter a new license code to reactivate.`,
      record,
      expiresAt,
      remainingMs: 0,
      remainingText: "Expired",
    };
  }

  return {
    type: "active",
    isValid: true,
    message: `License is active for ${record.payload.holder}.`,
    record,
    expiresAt,
    remainingMs,
    remainingText: formatRemainingTime(remainingMs),
  };
}

/**
 * Asynchronously re-verify the stored license signature against the public key.
 */
export async function verifyActiveLicense(): Promise<LicenseStatus> {
  const record = getSavedLicenseRecord();
  if (!record) {
    return evaluateCurrentLicense();
  }

  const verification = await verifyLicenseCode(record.rawCode);
  if (!verification.valid || !verification.payload) {
    return {
      type: "invalid",
      isValid: false,
      message: verification.error || "Stored license signature is invalid.",
      record,
    };
  }

  // Update lastVerifiedAt
  record.lastVerifiedAt = new Date().toISOString();
  saveLicenseRecord(record);

  return evaluateCurrentLicense();
}

/**
 * Activate a license from raw code input.
 */
export async function activateLicense(rawCode: string): Promise<LicenseStatus> {
  const trimmed = rawCode.trim();
  if (!trimmed) {
    return {
      type: "invalid",
      isValid: false,
      message: "Please enter a license code.",
    };
  }

  const verification = await verifyLicenseCode(trimmed);
  if (!verification.valid || !verification.payload) {
    return {
      type: "invalid",
      isValid: false,
      message: verification.error || "Invalid license code.",
    };
  }

  const now = new Date();
  const expiresAt = new Date(verification.payload.expiresAt);
  if (expiresAt.getTime() <= now.getTime()) {
    return {
      type: "expired",
      isValid: false,
      message: `This license code expired on ${expiresAt.toLocaleDateString()}. Please request a renewed license code.`,
      expiresAt,
    };
  }

  const record: LicenseRecord = {
    rawCode: trimmed,
    payload: verification.payload,
    activatedAt: now.toISOString(),
    lastVerifiedAt: now.toISOString(),
  };

  saveLicenseRecord(record);

  return evaluateCurrentLicense(now);
}
