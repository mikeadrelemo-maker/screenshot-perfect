import type { LicenseDuration, LicensePayload } from "./types";

/**
 * Public Key (JWK) for SOS Invoice Template Converter.
 * The corresponding Private Signing Key is retained solely by the application administrator
 * and is NEVER embedded in application bundles or public repositories.
 */
export const PUBLIC_KEY_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "TVxa-fVO9CQt7puZbExtXEtl6hbFLM8vB3pApvDweqw",
  y: "NHm7mb6L7GVMJ09Bl-A-TWDWTBY1ucBj6lzYCbj7OKM",
  key_ops: ["verify"],
  ext: true,
};

export const LICENSE_PREFIX = "SOSLIC-";

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Proper calendar date arithmetic:
 * - 1 Day = 24 hours from reference timestamp
 * - 1 Month = one calendar month (e.g. Jan 31 -> Feb 28/29, Mar 15 -> Apr 15)
 * - 1 Year = one calendar year (e.g. Feb 29 2028 -> Feb 28 2029)
 */
export function calculateExpiration(fromDate: Date, duration: LicenseDuration): Date {
  const result = new Date(fromDate.getTime());

  if (duration === "1d") {
    result.setTime(result.getTime() + 24 * 60 * 60 * 1000);
    return result;
  }

  if (duration === "1m") {
    const origDay = result.getDate();
    result.setMonth(result.getMonth() + 1);
    // Handle month length overflow (e.g. Aug 31 -> Sep 30, not Oct 1)
    if (result.getDate() !== origDay) {
      result.setDate(0);
    }
    return result;
  }

  if (duration === "1y") {
    const origDay = result.getDate();
    const origMonth = result.getMonth();
    result.setFullYear(result.getFullYear() + 1);
    // Handle leap year boundary (Feb 29 -> Feb 28)
    if (result.getMonth() !== origMonth) {
      result.setDate(0);
    }
    return result;
  }

  throw new Error(`Unsupported license duration: ${duration}`);
}

/**
 * Parse a raw license code string into payload and signature bytes.
 */
export function parseLicenseCode(code: string): { payload: LicensePayload; signatureBytes: Uint8Array; signedData: Uint8Array } {
  const trimmed = code.trim();
  if (!trimmed.startsWith(LICENSE_PREFIX)) {
    throw new Error("Invalid license code format: missing SOSLIC- prefix.");
  }

  const token = trimmed.slice(LICENSE_PREFIX.length);
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid license code format: expected payload.signature.");
  }

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    throw new Error("Malformed license code: empty payload or signature.");
  }

  const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
  let payload: LicensePayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error("Malformed license code: payload is not valid JSON.");
  }

  if (!payload.id || !payload.holder || !payload.duration || !payload.issuedAt || !payload.expiresAt) {
    throw new Error("Malformed license code: required payload fields are missing.");
  }

  const signatureBytes = base64UrlDecode(sigB64);
  const signedData = new TextEncoder().encode(payloadB64);

  return { payload, signatureBytes, signedData };
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API (SubtleCrypto) is not available in this environment.");
  }
  return subtle;
}

/**
 * Verify a license code against the embedded Public Key using Web Crypto ECDSA.
 */
export async function verifyLicenseCode(
  code: string,
  publicKeyJwk: JsonWebKey = PUBLIC_KEY_JWK,
): Promise<{ valid: boolean; payload?: LicensePayload; error?: string }> {
  try {
    const { payload, signatureBytes, signedData } = parseLicenseCode(code);

    const subtle = getSubtleCrypto();

    const pubKey = await subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );

    const isSignatureValid = await subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      pubKey,
      signatureBytes as BufferSource,
      signedData as BufferSource,
    );

    if (!isSignatureValid) {
      return { valid: false, error: "Cryptographic signature verification failed. The license code is invalid or has been modified." };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Failed to verify license code." };
  }
}

/**
 * Sign a license payload using an administrator's Private Key.
 * Used by the generator and automated testing.
 */
export async function createSignedLicense(
  payload: Omit<LicensePayload, "v">,
  privateKeyJwk: JsonWebKey,
): Promise<string> {
  const fullPayload: LicensePayload = {
    ...payload,
    v: 1,
  };

  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(fullPayload)));
  const signedData = new TextEncoder().encode(payloadB64);

  const subtle = getSubtleCrypto();

  const privKey = await subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sigBuffer = await subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privKey,
    signedData,
  );

  const sigB64 = base64UrlEncode(new Uint8Array(sigBuffer));
  return `${LICENSE_PREFIX}${payloadB64}.${sigB64}`;
}
