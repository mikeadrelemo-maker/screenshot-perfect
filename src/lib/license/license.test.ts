import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
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

describe("License System — Cryptography, Duration & Activation", () => {
  let adminPrivateKey: JsonWebKey;
  let verificationPubKey: JsonWebKey;

  beforeAll(async () => {
    // Attempt to load local administrator signing key from gitignored license-key.js
    let loadedFromLocal = false;
    try {
      const keyFile = path.resolve(process.cwd(), "license-key.js");
      if (fs.existsSync(keyFile)) {
        const raw = fs.readFileSync(keyFile, "utf8");
        const match = raw.match(/window\.SOS_ADMIN_PRIVATE_KEY_JWK\s*=\s*(\{[\s\S]*?\});/);
        if (match && match[1]) {
          adminPrivateKey = JSON.parse(match[1]);
          verificationPubKey = PUBLIC_KEY_JWK;
          loadedFromLocal = true;
        }
      }
    } catch {}

    // Fallback for CI environments where private keys are never committed
    if (!loadedFromLocal) {
      const kp = await globalThis.crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      );
      adminPrivateKey = (await globalThis.crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
      verificationPubKey = (await globalThis.crypto.subtle.exportKey("jwk", kp.publicKey)) as JsonWebKey;
    }
  });

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
    it("generates a valid signed license code and verifies against public key", async () => {
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
        adminPrivateKey,
      );

      expect(code.startsWith("SOSLIC-")).toBe(true);

      const verification = await verifyLicenseCode(code, verificationPubKey);
      expect(verification.valid).toBe(true);
      expect(verification.payload?.holder).toBe("Adrian Llano");
      expect(verification.payload?.duration).toBe("1m");
    });

    it("strictly rejects altered or tampered license codes", async () => {
      const now = new Date();
      const code = await createSignedLicense(
        {
          id: "lic_tamper_test",
          holder: "Legitimate Company",
          duration: "1m",
          issuedAt: now.toISOString(),
          expiresAt: calculateExpiration(now, "1m").toISOString(),
        },
        adminPrivateKey,
      );

      // Alter payload: change legitimate payload data
      const parts = code.slice("SOSLIC-".length).split(".");
      const decodedPayload = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")), (c) =>
            c.charCodeAt(0),
          ),
        ),
      );
      decodedPayload.holder = "Hacked Entity";
      const tamperedPayloadB64 = btoa(JSON.stringify(decodedPayload))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const tamperedCode = `SOSLIC-${tamperedPayloadB64}.${parts[1]}`;

      const res = await verifyLicenseCode(tamperedCode, verificationPubKey);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Cryptographic signature verification failed");
    });

    it("rejects license codes signed with an unauthorized or mismatched private key", async () => {
      // Generate a completely different unapproved key pair
      const subtle = globalThis.crypto.subtle;
      const rogueKp = await subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      );
      const roguePrivJwk = (await subtle.exportKey("jwk", rogueKp.privateKey)) as JsonWebKey;

      const now = new Date();
      const rogueCode = await createSignedLicense(
        {
          id: "lic_rogue",
          holder: "Rogue User",
          duration: "1y",
          issuedAt: now.toISOString(),
          expiresAt: calculateExpiration(now, "1y").toISOString(),
        },
        roguePrivJwk,
      );

      const verification = await verifyLicenseCode(rogueCode, verificationPubKey);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain("Cryptographic signature verification failed");
    });
  });

  describe("End-to-End Generator & Activation for All 3 Durations", () => {
    const durations: LicenseDuration[] = ["1d", "1m", "1y"];

    durations.forEach((dur) => {
      it(`generates and activates a valid ${dur} license successfully`, async () => {
        const now = new Date();
        const expiresAt = calculateExpiration(now, dur);

        // 1. Simulate exact license generator signing
        const licenseCode = await createSignedLicense(
          {
            id: `lic_${dur}_test`,
            holder: "Adrian Llano Enterprises",
            note: `Testing ${dur} activation`,
            duration: dur,
            issuedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
          adminPrivateKey,
        );

        // 2. Immediate verification using application's verifyLicenseCode
        const verification = await verifyLicenseCode(licenseCode, verificationPubKey);
        expect(verification.valid).toBe(true);
        expect(verification.payload?.holder).toBe("Adrian Llano Enterprises");
        expect(verification.payload?.duration).toBe(dur);

        // 3. Application activation
        const activationResult = await activateLicense(licenseCode);
        expect(activationResult.isValid).toBe(true);
        expect(activationResult.type).toBe("active");
        expect(activationResult.record?.rawCode).toBe(licenseCode);

        // 4. Persistence check: survives page reload simulation
        const storedRecord = getSavedLicenseRecord();
        expect(storedRecord).not.toBeNull();
        expect(storedRecord?.payload.duration).toBe(dur);

        const currentStatus = evaluateCurrentLicense();
        expect(currentStatus.isValid).toBe(true);
        expect(currentStatus.type).toBe("active");
        expect(currentStatus.remainingMs).toBeGreaterThan(0);
      });
    });
  });

  describe("License Storage and Expiration Handling", () => {
    it("recognizes when a license is expired", () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000); // 1 second ago

      const record: LicenseRecord = {
        rawCode: "SOSLIC-test",
        payload: {
          id: "lic_exp",
          holder: "Acme",
          duration: "1d",
          issuedAt: new Date(now.getTime() - 86400000).toISOString(),
          expiresAt: past.toISOString(),
          v: 1,
        },
        activatedAt: new Date(now.getTime() - 86400000).toISOString(),
        lastVerifiedAt: now.toISOString(),
      };

      saveLicenseRecord(record);
      const status = evaluateCurrentLicense();
      expect(status.isValid).toBe(false);
      expect(status.type).toBe("expired");
      expect(status.message).toContain("expired on");
    });

    it("evaluates active status correctly up to expiration boundary", () => {
      const now = new Date();
      const future = new Date(now.getTime() + 60 * 1000); // 1 minute in future

      const record: LicenseRecord = {
        rawCode: "SOSLIC-active",
        payload: {
          id: "lic_act",
          holder: "Acme Active",
          duration: "1d",
          issuedAt: now.toISOString(),
          expiresAt: future.toISOString(),
          v: 1,
        },
        activatedAt: now.toISOString(),
        lastVerifiedAt: now.toISOString(),
      };

      saveLicenseRecord(record);

      // Now: active
      const activeStatus = evaluateCurrentLicense(now);
      expect(activeStatus.isValid).toBe(true);
      expect(activeStatus.type).toBe("active");

      // After 60 seconds: expired
      const futureTime = new Date(now.getTime() + 61 * 1000);
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
        adminPrivateKey,
      );

      const status = await activateLicense(freshCode);
      expect(status.isValid).toBe(true);
      expect(status.type).toBe("active");
      expect(status.record?.payload.id).toBe("lic_renewed");
    });

    it("does not delete invoice history or print layouts when license expires", () => {
      // Set mock invoice history and mock saved layout
      localStorage.setItem(
        "sos_invoice_history",
        JSON.stringify([{ id: "inv_1", customer: "Important Corp" }]),
      );
      localStorage.setItem(
        "sos_invoice_layout_charge_v1",
        JSON.stringify({ name: "Custom Charge Layout" }),
      );

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
      expect(formatRemainingTime(1 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000)).toBe(
        "1 day, 4h remaining",
      );
      expect(formatRemainingTime(6 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe("6h 30m remaining");
      expect(formatRemainingTime(45 * 60 * 1000)).toBe("45 minutes remaining");
      expect(formatRemainingTime(-1000)).toBe("Expired");
    });
  });
});
