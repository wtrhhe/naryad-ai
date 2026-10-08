import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-naryad-signature";
export const TIMESTAMP_HEADER = "x-naryad-timestamp";
export const MAX_SKEW_SECONDS = 300;

export function signPayload(body: string, secret: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifySignature(
  body: string,
  secret: string,
  timestamp: number,
  signature: string,
  nowSeconds: number,
): boolean {
  if (!secret || Math.abs(nowSeconds - timestamp) > MAX_SKEW_SECONDS) return false;
  const expected = Buffer.from(signPayload(body, secret, timestamp));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function isAuthorizedIntegrationRequest(
  authorization: string | null,
  token: string,
): boolean {
  if (token.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
