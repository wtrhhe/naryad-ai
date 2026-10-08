function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function uuidFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 16) {
    throw new Error("A uuid needs 16 random bytes");
  }
  const copy = Uint8Array.from(bytes.subarray(0, 16));
  copy[6] = ((copy[6] ?? 0) & 0x0f) | 0x40;
  copy[8] = ((copy[8] ?? 0) & 0x3f) | 0x80;
  const text = hex(copy);
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

export function newUuid(source: Crypto = globalThis.crypto): string {
  if (typeof source.randomUUID === "function") {
    try {
      return source.randomUUID();
    } catch {
      return uuidFromBytes(source.getRandomValues(new Uint8Array(16)));
    }
  }
  return uuidFromBytes(source.getRandomValues(new Uint8Array(16)));
}
