import { describe, expect, it } from "vitest";
import { DEFAULT_SEED, parseCliArguments, parseSeedEnv } from "./cli-options";

describe("parseCliArguments", () => {
  it("defaults to the full dataset with the default seed", () => {
    expect(parseCliArguments([])).toEqual({ mode: "full", seed: DEFAULT_SEED, now: null });
    expect(DEFAULT_SEED).toBe(20261016);
  });

  it("recognises --minimal", () => {
    expect(parseCliArguments(["--minimal"]).mode).toBe("minimal");
  });

  it("parses --seed as an integer", () => {
    expect(parseCliArguments(["--seed=42"]).seed).toBe(42);
  });

  it("parses --now as an ISO moment", () => {
    expect(parseCliArguments(["--now=2026-10-08T07:30:00Z"]).now?.toISOString()).toBe(
      "2026-10-08T07:30:00.000Z",
    );
  });

  it.each([
    ["--seed=abc"],
    ["--seed=1.5"],
    ["--seed="],
    ["--now=yesterday"],
    ["--unknown"],
    ["minimal"],
  ])("rejects %s", (argument) => {
    expect(() => parseCliArguments([argument])).toThrow();
  });
});

describe("parseSeedEnv", () => {
  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: "k".repeat(30),
    AUTH_PIN_PEPPER: "p".repeat(32),
  };

  it("accepts the required variables and defaults the email domain", () => {
    expect(parseSeedEnv(valid)).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      serviceRoleKey: "k".repeat(30),
      pinPepper: "p".repeat(32),
      emailDomain: "naryad.local",
    });
  });

  it("uses the configured email domain", () => {
    expect(parseSeedEnv({ ...valid, AUTH_EMAIL_DOMAIN: "plant.example" }).emailDomain).toBe(
      "plant.example",
    );
  });

  it("names the missing variables in the error", () => {
    expect(() => parseSeedEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => parseSeedEnv({ ...valid, AUTH_PIN_PEPPER: "short" })).toThrow(/AUTH_PIN_PEPPER/);
  });
});
