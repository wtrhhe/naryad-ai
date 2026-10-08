import { describe, expect, it } from "vitest";
import { parseAiEnv, parsePublicEnv, parseServerEnv } from "@/lib/env";

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

  it("accepts the offline mock AI provider", () => {
    expect(parseServerEnv({ ...validServer, AI_PROVIDER: "mock" }).AI_PROVIDER).toBe("mock");
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

describe("parseAiEnv", () => {
  it("reads only the AI settings with defaults", () => {
    expect(parseAiEnv({})).toEqual({
      AI_PROVIDER: "claude",
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_MODEL_SMART: "claude-sonnet-5-5",
      ANTHROPIC_MODEL_FAST: "claude-haiku-5-5",
      OLLAMA_BASE_URL: "http://localhost:11434",
      OLLAMA_MODEL: "qwen2.5vl:7b",
    });
  });

  it("does not require unrelated server secrets", () => {
    expect(parseAiEnv({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "llava" }).OLLAMA_MODEL).toBe("llava");
  });

  it("rejects invalid AI settings", () => {
    expect(() => parseAiEnv({ AI_PROVIDER: "gpt" })).toThrow(/Invalid AI environment.*AI_PROVIDER/);
    expect(() => parseAiEnv({ OLLAMA_BASE_URL: "nope" })).toThrow(/OLLAMA_BASE_URL/);
  });
});
