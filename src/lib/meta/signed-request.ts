import { createHmac, timingSafeEqual } from "node:crypto";

export type SignedRequestPayload = {
  algorithm: string;
  user_id?: string;
  issued_at?: number;
  [key: string]: unknown;
};

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Verifikasi signed_request dari Meta (format: base64url(signature).base64url(payload JSON),
 * signature = HMAC-SHA256(payload_part, app_secret)). Mengembalikan null bila tidak valid.
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): SignedRequestPayload | null {
  if (!signedRequest || !appSecret || signedRequest.length > 4096) return null;
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts;
  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(b64urlDecode(encodedPayload).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || String(payload.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  const actual = b64urlDecode(encodedSig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  if (payload.user_id !== undefined) payload.user_id = String(payload.user_id);
  return payload;
}

/** Untuk test: buat signed_request yang valid. */
export function createSignedRequest(payload: Record<string, unknown>, appSecret: string): string {
  const enc = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const body = enc(Buffer.from(JSON.stringify(payload)));
  const sig = enc(createHmac("sha256", appSecret).update(body).digest());
  return `${sig}.${body}`;
}
