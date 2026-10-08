import { describe, expect, it } from "vitest";
import { decodeDraft, draftLink, encodeDraft } from "@/lib/assistant/draft";

const PAYLOAD = {
  description: "Течь сальника — насос Н-4, «срочно» 💧",
  equipmentId: "00000000-0000-4000-8000-0000000000e4",
  priority: "high" as const,
};

describe("draft encoding", () => {
  it("round-trips Cyrillic text through a URL-safe value", () => {
    const encoded = encodeDraft(PAYLOAD);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeDraft(encoded)).toEqual(PAYLOAD);
  });

  it("builds the order form link", () => {
    const link = draftLink({ description: "Замена ролика" });
    expect(link).toMatch(/^\/master\/orders\/new\?draft=[A-Za-z0-9_-]+$/);
    expect(decodeDraft(link.split("=")[1])).toEqual({ description: "Замена ролика" });
  });

  it("rejects malformed or invalid drafts", () => {
    expect(decodeDraft(null)).toBeNull();
    expect(decodeDraft("")).toBeNull();
    expect(decodeDraft("not base64!")).toBeNull();
    expect(decodeDraft("e30")).toBeNull();
    expect(decodeDraft("_-_-")).toBeNull();
    expect(decodeDraft("a".repeat(13_000))).toBeNull();
    expect(decodeDraft(btoa('{"description":"ok","priority":"mega"}'))).toBeNull();
  });

  it("refuses to encode invalid payloads", () => {
    expect(() => encodeDraft({ description: "x" })).toThrow();
  });
});
