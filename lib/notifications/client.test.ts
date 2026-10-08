import { describe, expect, it } from "vitest";
import {
  isIosDevice,
  mergeNotifications,
  notificationHref,
  urlBase64ToUint8Array,
  type AppNotification,
} from "@/lib/notifications/client";

const base: AppNotification = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "order_issued",
  title: "Новый наряд №1",
  body: "Насос",
  work_order_id: null,
  payload: { url: "/worker/orders/1" },
  is_urgent: false,
  read_at: null,
  created_at: "2026-10-16T10:00:00Z",
};

describe("notificationHref", () => {
  it("returns internal links only", () => {
    expect(notificationHref(base)).toBe("/worker/orders/1");
    expect(notificationHref({ ...base, payload: { url: "https://evil.example" } })).toBeNull();
    expect(notificationHref({ ...base, payload: null })).toBeNull();
  });
});

describe("mergeNotifications", () => {
  it("puts new items first without duplicates and caps the list", () => {
    const other = { ...base, id: "22222222-2222-4222-8222-222222222222" };
    expect(mergeNotifications([base], other).map((item) => item.id)).toEqual([other.id, base.id]);
    expect(mergeNotifications([base, other], base)).toHaveLength(2);
    expect(mergeNotifications([base], other, 1)).toHaveLength(1);
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes url safe base64 without padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID_w"))).toEqual([1, 2, 3, 255]);
  });
});

describe("isIosDevice", () => {
  it("detects iPhone and iPadOS desktop mode", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14)", 5)).toBe(false);
  });
});
