import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";

const secret = "s".repeat(48);

describe("isAuthorizedCronRequest", () => {
  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true);
  });

  it.each([null, "", secret, `Bearer ${secret}x`, `Basic ${secret}`])("rejects %s", (header) => {
    expect(isAuthorizedCronRequest(header, secret)).toBe(false);
  });

  it("refuses everything when the secret is not configured", () => {
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
  });
});
