import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";

describe("buildContentSecurityPolicy", () => {
  const base = { nonce: "abc123", supabaseUrl: "https://ref.supabase.co", isDevelopment: false };

  it("allows scripts only by nonce with strict-dynamic in production", () => {
    const policy = buildContentSecurityPolicy(base);
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("allows Supabase over https and secure websockets for realtime", () => {
    const policy = buildContentSecurityPolicy(base);
    expect(policy).toContain("connect-src 'self' https://ref.supabase.co wss://ref.supabase.co");
  });

  it("uses plain websockets for a local Supabase and permits eval in development", () => {
    const policy = buildContentSecurityPolicy({
      ...base,
      supabaseUrl: "http://127.0.0.1:54321",
      isDevelopment: true,
    });
    expect(policy).toContain("ws://127.0.0.1:54321");
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("forbids framing and plugins", () => {
    const policy = buildContentSecurityPolicy(base);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
  });
});

describe("createNonce", () => {
  it("returns a fresh base64 value each call", () => {
    const first = createNonce();
    expect(first).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(createNonce()).not.toBe(first);
  });
});
