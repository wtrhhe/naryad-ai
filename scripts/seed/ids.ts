import { createHash } from "node:crypto";

const UUID_VERSION_FIVE_MASK = 0x50;
const UUID_VARIANT_MASK = 0x80;

export function stableUuid(name: string): string {
  const bytes = [...createHash("sha256").update(name).digest().subarray(0, 16)];
  bytes[6] = ((bytes[6] as number) & 0x0f) | UUID_VERSION_FIVE_MASK;
  bytes[8] = ((bytes[8] as number) & 0x3f) | UUID_VARIANT_MASK;
  const digits = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    digits.slice(0, 8),
    digits.slice(8, 12),
    digits.slice(12, 16),
    digits.slice(16, 20),
    digits.slice(20),
  ].join("-");
}
