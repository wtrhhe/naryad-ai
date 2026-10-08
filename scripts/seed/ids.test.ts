import { describe, expect, it } from "vitest";
import { stableUuid } from "./ids";

describe("stableUuid", () => {
  it("is deterministic and namespaced by name", () => {
    expect(stableUuid("equipment:K-3")).toBe(stableUuid("equipment:K-3"));
    expect(stableUuid("equipment:K-3")).not.toBe(stableUuid("equipment:K-4"));
  });

  it("has a valid uuid shape", () => {
    expect(stableUuid("site:CRUSH")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
