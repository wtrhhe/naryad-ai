import { describe, expect, it } from "vitest";
import { buildPush, isAllowedPushEndpoint, isGoneSubscription } from "@/lib/push/payload";

describe("buildPush", () => {
  it("keeps internal links and groups by work order", () => {
    expect(
      buildPush({
        id: "n1",
        title: "Аварийный наряд №5",
        body: "Насос Н-4",
        is_urgent: true,
        work_order_id: "o1",
        payload: { url: "/worker/orders/o1" },
      }),
    ).toEqual({
      title: "Аварийный наряд №5",
      body: "Насос Н-4",
      url: "/worker/orders/o1",
      urgent: true,
      tag: "order:o1",
    });
  });

  it.each([{ url: "https://evil.example" }, { url: "//evil.example" }, null, "text"])(
    "falls back to home for %j",
    (payload) => {
      expect(
        buildPush({
          id: "n1",
          title: "t",
          body: "b",
          is_urgent: false,
          work_order_id: null,
          payload,
        }).url,
      ).toBe("/");
    },
  );
});

describe("isGoneSubscription", () => {
  it("drops expired and unknown subscriptions only", () => {
    expect(isGoneSubscription(410)).toBe(true);
    expect(isGoneSubscription(404)).toBe(true);
    expect(isGoneSubscription(429)).toBe(false);
    expect(isGoneSubscription(undefined)).toBe(false);
  });
});

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QF2",
    "https://wns2-par02p.notify.windows.com/w/?token=1",
  ])("accepts %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/x",
    "https://googleapis.com.evil.io/x",
    "https://169.254.169.254/latest",
  ])("rejects %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
