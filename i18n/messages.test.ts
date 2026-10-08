import { describe, expect, it } from "vitest";
import { LOCALES, resolveLocale } from "@/i18n/config";
import { loadMessages, NAMESPACES } from "@/i18n/messages";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

describe("messages", () => {
  it("has identical keys in every locale", async () => {
    const [reference, ...others] = await Promise.all(LOCALES.map((locale) => loadMessages(locale)));
    const referenceKeys = flattenKeys(reference).sort();
    others.forEach((messages) => expect(flattenKeys(messages).sort()).toEqual(referenceKeys));
  });

  it("loads every namespace", async () => {
    const messages = await loadMessages("ru");
    expect(Object.keys(messages).sort()).toEqual([...NAMESPACES].sort());
  });

  it("has no empty strings", async () => {
    const messages = await Promise.all(LOCALES.map((locale) => loadMessages(locale)));
    const values = JSON.stringify(messages);
    expect(values).not.toContain('""');
  });
});

describe("resolveLocale", () => {
  it("falls back to Russian for unknown values", () => {
    expect(resolveLocale("en")).toBe("ru");
    expect(resolveLocale(undefined)).toBe("ru");
    expect(resolveLocale("kk")).toBe("kk");
  });
});
