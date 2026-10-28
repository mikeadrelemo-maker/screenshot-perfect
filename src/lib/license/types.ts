export type LicenseDuration = "1d" | "1m" | "1y";

export interface LicensePayload {
  id: string; // unique license ID
  holder: string; // licensee / customer name
  note?: string; // optional reference / invoice / note
  duration: LicenseDuration;
  issuedAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  v: number; // schema version (1)
}

export interface LicenseRecord {
  rawCode: string;
  payload: LicensePayload;
  activatedAt: string; // ISO 8601
  lastVerifiedAt: string; // ISO 8601
}

export type LicenseStatusType = "active" | "expired" | "unlicensed" | "invalid";

export interface LicenseStatus {
  type: LicenseStatusType;
  isValid: boolean;
  message: string;
  record?: LicenseRecord;
  expiresAt?: Date;
  remainingMs?: number;
  remainingText?: string;
}
