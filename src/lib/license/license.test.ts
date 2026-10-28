import { beforeEach, describe, expect, it } from "vitest";
import {
  calculateExpiration,
  createSignedLicense,
  parseLicenseCode,
  PUBLIC_KEY_JWK,
  verifyLicenseCode,
} from "./crypto";
import {
  activateLicense,
  clearLicenseRecord,
  evaluateCurrentLicense,
  formatRemainingTime,
  getSavedLicenseRecord,
  saveLicenseRecord,
  verifyActiveLicense,
} from "./store";
import type { LicenseDuration, LicenseRecord } from "./types";

// Administrator private signing key used strictly for automated test generation
const TEST_ADMIN_PRIVATE_KEY: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "geF-YsTCE20cJSYuMEfoHh19vBwq21sN5sSJGfAy6YI",
  y: "j-qfVdSrWs-5TdE_pEPsQCViVPt6L_yIkgSHjvCHNho",
  d: "hZZ10nCUUn12-OKIqzBgv-Y8noEF7LvY-hTk0uPPZ_E",
  key_ops: ["sign"],
  ext: true,
};

describe("License System — Cryptography, Duration & Activation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Calendar-accurate duration calculations", () => {
    it("calculates 1 Day as exactly 24 hours from activation", () => {
      const start = new Date("2026-10-28T12:00:00Z");
      const exp = calculateExpiration(start, "1d");
      expect(exp.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
      expect(exp.toISOString()).toBe("2026-10-29T12:00:00.000Z");
    });

    it("calculates 1 Month as a true calendar month (not an approximate 30 days)", () => {
      // October has 31 days. Oct 15 -> Nov 15 (+31 days)
      const oct15 = new Date("2026-10-15T08:00:00Z");
      const expOct = calculateExpiration(oct15, "1m");
      expect(expOct.getUTCMonth()).toBe(10); // November (0-indexed 10)
      expect(expOct.getUTCDate()).toBe(15);
      expect(expOct.getTime() - oct15.getTime()).toBe(31 * 24 * 60 * 60 * 1000);

      // Month-end overflow: Jan 31 -> Feb 28 (non-leap year 2027)
      const jan31 = new Date("2027-01-31T00:00:00Z");
      const expJan = calculateExpiration(jan31, "1m");
      expect(expJan.getUTCMonth()).toBe(1); // February
      expect(expJan.getUTCDate()).toBe(28); // Capped at end of Feb
    });

    it("calculates 1 Year as a true calendar year (accounting for leap years)", () => {
      const start = new Date("2026-10-28T00:00:00Z");
      const exp = calculateExpiration(start, "1y");
      expect(exp.getUTCFullYear()).toBe(2027);
      expect(exp.getUTCMonth()).toBe(9); // October
      expect(exp.getUTCDate()).toBe(28);

      // Leap year test: Feb 29 2028 -> Feb 28 2029
      const leapFeb29 = new Date("2028-02-29T12:00:00Z");
      const expLeap = calculateExpiration(leapFeb29, "1y");
      expect(expLeap.getUTCFullYear()).toBe(2029);
      expect(expLeap.getUTCMonth()).toBe(1); // February
      expect(expLeap.getUTCDate()).toBe(28);
    });
  });

  describe("Asymmetric ECDSA signing and verification", () => {
    it("generates a valid signed license code and verifies against embedded public key", async () => {
      const now = new Date();
      const expiresAt = calculateExpiration(now, "1m");

      const code = await createSignedLicense(
        {
          id: "lic_test_001",
          holder: "Adrian Llano",
          note: "Annual Production License",
          duration: "1m",
          issuedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
        TEST_ADMIN_PRIVATE_KEY,
      );

      expect(code.startsWith("SOSLIC-")).toBe(true);

      const verification = await verifyLicenseCode(code, PUBLIC_KEY_JWK);
      expect(verification.valid).toBe(true);
      expect(verification.payload?.holder).toBe("Adrian Llano");
      expect(verification.payload?.duration).toBe("1m");
    });

    it("strictly rejects altered or tampered license codes", async () => {
      const now = new Date();
      const code = await createSignedLicense(
        {
          id: "lic_legit",
          holder: "Legitimate Company",
          duration: "1d",
          issuedAt: now.toISOString(),
          expiresAt: calculateExpiration(now, "1d").toISOString(),
        },
        TEST_ADMIN_PRIVATE_KEY,
      );

      // Tamper with payload (modify a single character)
      const parts = code.split(".");
      const tamperedCode = `${parts[0]}X.${parts[1]}`;
      const resTampered = await verifyLicenseCode(tamperedCode);
      expect(resTampered.valid).toBe(false);

      // Tamper with signature
      const tamperedSig = `${parts[0]}.${parts[1]?.slice(0, -4)}AAAA`;
      const resSig = await verifyLicenseCode(tamperedSig);
      expect(resSig.valid).toBe(false);
    });

    it("strictly rejects malformed strings and random text", async () => {
      expect((await verifyLicenseCode("random_junk_string")).valid).toBe(false);
      expect((await verifyLicenseCode("SOSLIC-invalid")).valid).toBe(false);
      expect((await verifyLicenseCode("")).valid).toBe(false);
    });
  });

  describe("Application Activation & Storage Persistence", () => {
    it("activates 1 Day, 1 Month, and 1 Year licenses successfully", async () => {
      const durations: LicenseDuration[] = ["1d", "1m", "1y"];

      for (const dur of durations) {
        localStorage.clear();
        const now = new Date();
        const code = await createSignedLicense(
          {
            id: `lic_${dur}`,
            holder: `Customer ${dur}`,
            duration: dur,
            issuedAt: now.toISOString(),
            expiresAt: calculateExpiration(now, dur).toISOString(),
          },
          TEST_ADMIN_PRIVATE_KEY,
        );

        const status = await activateLicense(code);
        expect(status.isValid).toBe(true);
        expect(status.type).toBe("active");
        expect(status.record?.payload.duration).toBe(dur);

        // Confirm it survives simulated browser refresh
        const restored = evaluateCurrentLicense();
        expect(restored.isValid).toBe(true);
        expect(restored.type).toBe("active");
      }
    });

    it("rejects an already expired license upon activation attempt", async () => {
      const past = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const expiredCode = await createSignedLicense(
        {
          id: "lic_old",
          holder: "Past Customer",
          duration: "1d",
          issuedAt: new Date(past.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          expiresAt: past.toISOString(),
        },
        TEST_ADMIN_PRIVATE_KEY,
      );

      const status = await activateLicense(expiredCode);
      expect(status.isValid).toBe(false);
      expect(status.type).toBe("expired");
    });

    it("locks functionality when an active license expires over time", async () => {
      const now = new Date();
      // License that expires in 10 seconds
      const expiresAt = new Date(now.getTime() + 10 * 1000);

      const code = await createSignedLicense(
        {
          id: "lic_short",
          holder: "Short Term User",
          duration: "1d",
          issuedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
        TEST_ADMIN_PRIVATE_KEY,
      );

      await activateLicense(code);
      expect(evaluateCurrentLicense(now).isValid).toBe(true);

      // Fast forward 1 minute
      const futureTime = new Date(now.getTime() + 60 * 1000);
      const expiredStatus = evaluateCurrentLicense(futureTime);
      expect(expiredStatus.isValid).toBe(false);
      expect(expiredStatus.type).toBe("expired");
    });

    it("reactivates cleanly with a new valid license after expiration", async () => {
      // 1. Activate an expired license record in storage
      const expiredRecord: LicenseRecord = {
        rawCode: "SOSLIC-dummy",
        payload: {
          id: "lic_prev",
          holder: "Old User",
          duration: "1d",
          issuedAt: "2026-01-01T00:00:00Z",
          expiresAt: "2026-01-02T00:00:00Z",
          v: 1,
        },
        activatedAt: "2026-01-01T00:00:00Z",
        lastVerifiedAt: "2026-01-01T00:00:00Z",
      };
      saveLicenseRecord(expiredRecord);
      expect(evaluateCurrentLicense().type).toBe("expired");

      // 2. Activate with fresh new 1-year license
      const now = new Date();
      const freshCode = await createSignedLicense(
        {
          id: "lic_renewed",
          holder: "Renewed User",
          duration: "1y",
          issuedAt: now.toISOString(),
          expiresAt: calculateExpiration(now, "1y").toISOString(),
        },
        TEST_ADMIN_PRIVATE_KEY,
      );

      const status = await activateLicense(freshCode);
      expect(status.isValid).toBe(true);
      expect(status.type).toBe("active");
      expect(status.record?.payload.id).toBe("lic_renewed");
    });

    it("does not delete invoice history or print layouts when license expires", () => {
      // Set mock invoice history and mock saved layout
      localStorage.setItem("sos_invoice_history", JSON.stringify([{ id: "inv_1", customer: "Important Corp" }]));
      localStorage.setItem("sos_invoice_layout_charge_v1", JSON.stringify({ name: "Custom Charge Layout" }));

      // Simulate expired license
      clearLicenseRecord();
      expect(evaluateCurrentLicense().isValid).toBe(false);

      // Verify invoice history and layout remain strictly untouched
      expect(localStorage.getItem("sos_invoice_history")).toContain("Important Corp");
      expect(localStorage.getItem("sos_invoice_layout_charge_v1")).toContain("Custom Charge Layout");
    });
  });

  describe("Remaining time display formatting", () => {
    it("formats days, hours, and minutes gracefully", () => {
      expect(formatRemainingTime(5 * 24 * 60 * 60 * 1000)).toBe("5 days remaining");
      expect(formatRemainingTime(1 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000)).toBe("1 day, 4h remaining");
      expect(formatRemainingTime(6 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe("6h 30m remaining");
      expect(formatRemainingTime(45 * 60 * 1000)).toBe("45 minutes remaining");
      expect(formatRemainingTime(-1000)).toBe("Expired");
    });
  });
});
