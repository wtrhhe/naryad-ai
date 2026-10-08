import { describe, expect, it } from "vitest";
import { newUuid, uuidFromBytes } from "@/lib/offline/ids";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidFromBytes", () => {
  it("formats random bytes as a version 4 uuid", () => {
    expect(uuidFromBytes(new Uint8Array(16).fill(255))).toBe(
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
    );
    expect(uuidFromBytes(new Uint8Array(16))).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("needs sixteen bytes", () => {
    expect(() => uuidFromBytes(new Uint8Array(4))).toThrow();
  });
});

describe("newUuid", () => {
  it("uses the native generator when present", () => {
    expect(newUuid()).toMatch(UUID_V4);
  });

  it("falls back to random bytes outside secure contexts", () => {
    const insecure = {
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
        if (array instanceof Uint8Array) {
          array.fill(7);
        }
        return array;
      },
    } as unknown as Crypto;
    expect(newUuid(insecure)).toMatch(UUID_V4);
  });
});
