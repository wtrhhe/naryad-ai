import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "@/lib/env";

const validPublic = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_0123456789abcdef",
};

describe("parsePublicEnv", () => {
  it("applies defaults for optional values", () => {
    const env = parsePublicEnv(validPublic);
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe("");
  });

  it("rejects a malformed Supabase URL with the variable name in the message", () => {
    expect(() => parsePublicEnv({ ...validPublic, NEXT_PUBLIC_SUPABASE_URL: "nope" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});

const validServer = {
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_0123456789abcdef",
  AUTH_PIN_PEPPER: "x".repeat(32),
};

describe("parseServerEnv", () => {
  it("defaults to the Claude provider and current models", () => {
    const env = parseServerEnv({ ...validServer });
    expect(env.AI_PROVIDER).toBe("claude");
    expect(env.ANTHROPIC_MODEL_SMART).toBe("claude-sonnet-5-5");
    expect(env.ANTHROPIC_MODEL_FAST).toBe("claude-haiku-5-5");
  });

  it("rejects an unknown AI provider", () => {
    expect(() => parseServerEnv({ ...validServer, AI_PROVIDER: "gpt" })).toThrow(/AI_PROVIDER/);
  });

  it("requires the service role key", () => {
    expect(() => parseServerEnv({ AUTH_PIN_PEPPER: "x".repeat(32) })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("requires a long PIN pepper", () => {
    expect(() => parseServerEnv({ ...validServer, AUTH_PIN_PEPPER: "short" })).toThrow(
      /AUTH_PIN_PEPPER/,
    );
  });
});
