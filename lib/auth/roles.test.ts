import { describe, expect, it } from "vitest";
import { homeForRole, isProtectedPath, roleForPath } from "@/lib/auth/roles";

describe("roleForPath", () => {
  it.each([
    ["/master", "master"],
    ["/master/orders/new", "master"],
    ["/worker", "worker"],
    ["/manager/reports", "manager"],
    ["/admin/equipment", "admin"],
  ] as const)("maps %s to %s", (path, role) => {
    expect(roleForPath(path)).toBe(role);
  });

  it("does not confuse prefixes of other words", () => {
    expect(roleForPath("/masterclass")).toBeNull();
    expect(roleForPath("/workers")).toBeNull();
  });

  it("leaves public pages unprotected", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/offline")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });
});

describe("homeForRole", () => {
  it("sends each role to its own section", () => {
    expect(homeForRole("worker")).toBe("/worker");
    expect(homeForRole("admin")).toBe("/admin");
  });
});
