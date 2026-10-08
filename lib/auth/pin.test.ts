import { describe, expect, it } from "vitest";
import { derivePinPassword, personnelEmail } from "@/lib/auth/pin";

const pepper = "p".repeat(32);

describe("derivePinPassword", () => {
  it("is deterministic for the same number and PIN", () => {
    expect(derivePinPassword("1001", "1234", pepper)).toBe(
      derivePinPassword("1001", "1234", pepper),
    );
  });

  it("differs between employees with the same PIN", () => {
    expect(derivePinPassword("1001", "1234", pepper)).not.toBe(
      derivePinPassword("1002", "1234", pepper),
    );
  });

  it("produces a password long enough for Supabase Auth", () => {
    expect(derivePinPassword("1001", "1234", pepper).length).toBeGreaterThanOrEqual(32);
  });

  it("rejects a short pepper", () => {
    expect(() => derivePinPassword("1001", "1234", "short")).toThrow(/AUTH_PIN_PEPPER/);
  });

  it.each(["123", "1234567", "12a4", ""])("rejects malformed PIN %s", (pin) => {
    expect(() => derivePinPassword("1001", pin, pepper)).toThrow();
  });
});

describe("personnelEmail", () => {
  it("builds the technical e-mail from the personnel number", () => {
    expect(personnelEmail(" 1001 ", "naryad.local")).toBe("1001@naryad.local");
  });

  it("rejects non-numeric personnel numbers", () => {
    expect(() => personnelEmail("abc", "naryad.local")).toThrow();
  });
});
