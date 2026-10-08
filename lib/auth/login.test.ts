import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateWithPin, type LoginDependencies } from "@/lib/auth/login";

const pepper = "q".repeat(32);

function createDeps(overrides: Partial<LoginDependencies> = {}): LoginDependencies {
  return {
    emailDomain: "naryad.local",
    pinPepper: pepper,
    clientIp: "10.0.0.1",
    hitRateLimit: vi.fn(async () => true),
    lockSeconds: vi.fn(async () => 0),
    recentFailures: vi.fn(async () => 1),
    recordAttempt: vi.fn(async () => undefined),
    signInWithPassword: vi.fn(async () => ({ authUserId: "auth-1" })),
    findEmployeeRole: vi.fn(async () => ({ role: "worker", isActive: true })),
    signOut: vi.fn(async () => undefined),
    ...overrides,
  };
}

const validInput = { personnelNumber: "2001", pin: "1234" };

describe("authenticateWithPin", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("signs in and returns the employee role", async () => {
    const deps = createDeps();
    await expect(authenticateWithPin(validInput, deps)).resolves.toEqual({
      ok: true,
      role: "worker",
    });
    expect(deps.recordAttempt).toHaveBeenCalledWith("2001", true);
    expect(deps.signInWithPassword).toHaveBeenCalledWith("2001@naryad.local", expect.any(String));
  });

  it("never sends the raw PIN as the password", async () => {
    const deps = createDeps();
    await authenticateWithPin(validInput, deps);
    const [, password] = vi.mocked(deps.signInWithPassword).mock.calls[0] ?? [];
    expect(password).not.toBe("1234");
    expect(password?.length).toBeGreaterThanOrEqual(32);
  });

  it("rejects malformed input before touching any dependency", async () => {
    const deps = createDeps();
    await expect(authenticateWithPin({ personnelNumber: "ab", pin: "1" }, deps)).resolves.toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(deps.hitRateLimit).not.toHaveBeenCalled();
  });

  it("refuses when the IP exceeds the rate limit", async () => {
    const deps = createDeps({ hitRateLimit: vi.fn(async () => false) });
    await expect(authenticateWithPin(validInput, deps)).resolves.toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(deps.signInWithPassword).not.toHaveBeenCalled();
  });

  it("refuses a locked account without checking the PIN", async () => {
    const deps = createDeps({ lockSeconds: vi.fn(async () => 241) });
    await expect(authenticateWithPin(validInput, deps)).resolves.toEqual({
      ok: false,
      error: "locked",
      lockMinutes: 5,
    });
    expect(deps.signInWithPassword).not.toHaveBeenCalled();
  });

  it("records a failure and reports the remaining attempts", async () => {
    const deps = createDeps({
      signInWithPassword: vi.fn(async () => null),
      recentFailures: vi.fn(async () => 3),
    });
    await expect(authenticateWithPin(validInput, deps)).resolves.toEqual({
      ok: false,
      error: "invalid_credentials",
      attemptsLeft: 2,
    });
    expect(deps.recordAttempt).toHaveBeenCalledWith("2001", false);
  });

  it("locks the account on the fifth wrong PIN", async () => {
    const lockSeconds = vi
      .fn<(n: string) => Promise<number>>()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(300);
    const deps = createDeps({ signInWithPassword: vi.fn(async () => null), lockSeconds });
    await expect(authenticateWithPin(validInput, deps)).resolves.toEqual({
      ok: false,
      error: "locked",
      lockMinutes: 5,
    });
  });

  it("signs out and refuses an inactive employee", async () => {
    const deps = createDeps({
      findEmployeeRole: vi.fn(async () => ({ role: "worker", isActive: false })),
    });
    await expect(authenticateWithPin(validInput, deps)).resolves.toEqual({
      ok: false,
      error: "inactive",
    });
    expect(deps.signOut).toHaveBeenCalled();
  });

  it("signs out when the auth user has no employee record", async () => {
    const deps = createDeps({ findEmployeeRole: vi.fn(async () => null) });
    await expect(authenticateWithPin(validInput, deps)).resolves.toEqual({
      ok: false,
      error: "inactive",
    });
    expect(deps.signOut).toHaveBeenCalled();
  });

  it("reports the service as unavailable when a dependency throws", async () => {
    const deps = createDeps({
      lockSeconds: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    await expect(authenticateWithPin(validInput, deps)).resolves.toEqual({
      ok: false,
      error: "unavailable",
    });
  });
});
