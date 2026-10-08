import { describe, expect, it } from "vitest";
import {
  FALLBACK_PUSH_PAYLOAD,
  NOTIFICATION_BADGE_URL,
  NOTIFICATION_ICON_URL,
  REGULAR_VIBRATION_PATTERN,
  URGENT_VIBRATION_PATTERN,
  buildNotificationOptions,
  decodePushMessage,
  normalizeInternalPath,
  parsePushPayload,
  readNotificationUrl,
  selectWindowClient,
} from "./push-payload";

describe("normalizeInternalPath", () => {
  it("keeps a same-origin path with query and hash", () => {
    expect(normalizeInternalPath("/worker/orders/42?tab=steps#top")).toBe(
      "/worker/orders/42?tab=steps#top",
    );
  });

  it.each([
    ["absolute external url", "https://evil.example/phish"],
    ["protocol-relative url", "//evil.example/phish"],
    ["backslash host trick", "/\\evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative path without slash", "worker"],
    ["empty string", ""],
    ["number", 42],
    ["null", null],
  ])("falls back to root for %s", (_label, value) => {
    expect(normalizeInternalPath(value)).toBe("/");
  });
});

describe("parsePushPayload", () => {
  it("parses a complete payload", () => {
    const payload = parsePushPayload({
      title: "  Новый наряд  ",
      body: "Конвейер №3",
      url: "/worker/orders/7",
      urgent: true,
      tag: "order-7",
    });

    expect(payload).toEqual({
      title: "Новый наряд",
      body: "Конвейер №3",
      url: "/worker/orders/7",
      urgent: true,
      tag: "order-7",
    });
  });

  it("applies defaults for optional fields", () => {
    expect(parsePushPayload({ title: "Наряд" })).toEqual({
      title: "Наряд",
      body: "",
      url: "/",
      urgent: false,
      tag: undefined,
    });
  });

  it("treats non-boolean urgent values as not urgent", () => {
    expect(parsePushPayload({ title: "Наряд", urgent: "true" })?.urgent).toBe(false);
  });

  it("drops blank or non-string tags", () => {
    expect(parsePushPayload({ title: "Наряд", tag: "   " })?.tag).toBeUndefined();
    expect(parsePushPayload({ title: "Наряд", tag: 5 })?.tag).toBeUndefined();
  });

  it("truncates overly long fields", () => {
    const payload = parsePushPayload({
      title: "т".repeat(500),
      body: "б".repeat(5000),
      tag: "x".repeat(500),
    });

    expect(payload?.title).toHaveLength(120);
    expect(payload?.body).toHaveLength(500);
    expect(payload?.tag).toHaveLength(64);
  });

  it("replaces unsafe urls with root", () => {
    expect(parsePushPayload({ title: "Наряд", url: "https://evil.example" })?.url).toBe("/");
  });

  it.each([
    ["null", null],
    ["array", [{ title: "Наряд" }]],
    ["string", "Наряд"],
    ["missing title", { body: "Текст" }],
    ["blank title", { title: "   " }],
    ["non-string title", { title: 1 }],
  ])("returns null for %s", (_label, value) => {
    expect(parsePushPayload(value)).toBeNull();
  });
});

describe("decodePushMessage", () => {
  it("decodes valid json text", () => {
    expect(decodePushMessage(JSON.stringify({ title: "Наряд", urgent: true })).urgent).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["malformed json", "{title"],
    ["json without title", JSON.stringify({ body: "x" })],
  ])("returns fallback payload for %s", (_label, text) => {
    expect(decodePushMessage(text)).toEqual(FALLBACK_PUSH_PAYLOAD);
  });
});

describe("buildNotificationOptions", () => {
  it("builds calm options for a regular notification", () => {
    const options = buildNotificationOptions({
      title: "Наряд",
      body: "Текст",
      url: "/worker",
      urgent: false,
      tag: undefined,
    });

    expect(options).toEqual({
      body: "Текст",
      icon: NOTIFICATION_ICON_URL,
      badge: NOTIFICATION_BADGE_URL,
      data: { url: "/worker" },
      requireInteraction: false,
      renotify: false,
      vibrate: [...REGULAR_VIBRATION_PATTERN],
    });
    expect(options).not.toHaveProperty("tag");
  });

  it("builds insistent options for an urgent notification", () => {
    const options = buildNotificationOptions({
      title: "Авария",
      body: "Остановка линии",
      url: "/worker/orders/9",
      urgent: true,
      tag: "order-9",
    });

    expect(options.requireInteraction).toBe(true);
    expect(options.renotify).toBe(true);
    expect(options.tag).toBe("order-9");
    expect(options.vibrate).toEqual([300, 100, 300, 100, 600]);
    expect(options.vibrate).toEqual([...URGENT_VIBRATION_PATTERN]);
  });

  it("derives a tag for urgent notifications without one so renotify stays valid", () => {
    const options = buildNotificationOptions({
      title: "Авария",
      body: "",
      url: "/worker/orders/9",
      urgent: true,
      tag: undefined,
    });

    expect(options.tag).toBe("urgent:/worker/orders/9");
    expect(options.renotify).toBe(true);
  });

  it("keeps a provided tag for regular notifications without renotify", () => {
    const options = buildNotificationOptions({
      title: "Наряд",
      body: "",
      url: "/",
      urgent: false,
      tag: "order-1",
    });

    expect(options.tag).toBe("order-1");
    expect(options.renotify).toBe(false);
  });

  it("returns a fresh vibration array each time", () => {
    const payload = { title: "Наряд", body: "", url: "/", urgent: true, tag: undefined };

    expect(buildNotificationOptions(payload).vibrate).not.toBe(
      buildNotificationOptions(payload).vibrate,
    );
  });
});

describe("readNotificationUrl", () => {
  it("reads a safe url from notification data", () => {
    expect(readNotificationUrl({ url: "/master/orders/new" })).toBe("/master/orders/new");
  });

  it.each([
    ["undefined data", undefined],
    ["non-object data", "x"],
    ["external url", { url: "https://evil.example" }],
  ])("falls back to root for %s", (_label, data) => {
    expect(readNotificationUrl(data)).toBe("/");
  });
});

describe("selectWindowClient", () => {
  const target = "https://naryad.example/worker/orders/5";

  it("focuses a client already showing the target url", () => {
    const exact = { url: target, id: "exact" };
    const other = { url: "https://naryad.example/worker", id: "other" };

    expect(selectWindowClient([other, exact], target)).toEqual({ client: exact, action: "focus" });
  });

  it("navigates the first open client when none shows the target", () => {
    const first = { url: "https://naryad.example/worker", id: "first" };
    const second = { url: "https://naryad.example/master", id: "second" };

    expect(selectWindowClient([first, second], target)).toEqual({
      client: first,
      action: "navigate",
    });
  });

  it("returns null when no client is open", () => {
    expect(selectWindowClient([], target)).toBeNull();
  });
});
