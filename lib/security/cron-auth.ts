import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(authorization: string | null, secret: string): boolean {
  if (secret.length < 32 || !authorization?.startsWith("Bearer ")) {
    return false;
  }
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
