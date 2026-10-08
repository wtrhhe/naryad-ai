import { describe, expect, it } from "vitest";
import {
  bannerMode,
  isActionErrorCode,
  isTransitionActionName,
  type BannerInput,
} from "@/lib/offline/banner";

const idle: BannerInput = {
  ready: true,
  online: true,
  pending: 0,
  flushing: false,
  stopped: null,
};

describe("bannerMode", () => {
  it("stays out of the way when everything is delivered", () => {
    expect(bannerMode(idle, false)).toBe("hidden");
    expect(bannerMode({ ...idle, ready: false }, false)).toBe("hidden");
  });

  it("warns about the missing network with and without waiting actions", () => {
    expect(bannerMode({ ...idle, online: false, pending: 3 }, false)).toBe("offline");
    expect(bannerMode({ ...idle, online: false }, false)).toBe("offlineEmpty");
    expect(bannerMode({ ...idle, online: false, ready: false }, false)).toBe("offlineEmpty");
  });

  it("shows progress while the outbox is being sent", () => {
    expect(bannerMode({ ...idle, pending: 2, flushing: true }, false)).toBe("sending");
  });

  it("invites a retry when actions are still waiting", () => {
    expect(bannerMode({ ...idle, pending: 2 }, false)).toBe("waiting");
    expect(bannerMode({ ...idle, pending: 2, stopped: "auth" }, false)).toBe("signIn");
  });

  it("confirms delivery for a moment", () => {
    expect(bannerMode(idle, true)).toBe("delivered");
  });
});

describe("message guards", () => {
  it("knows which server errors have a translation", () => {
    expect(isActionErrorCode("stale_status")).toBe(true);
    expect(isActionErrorCode("blob_missing")).toBe(false);
  });

  it("knows the work order actions", () => {
    expect(isTransitionActionName("accept")).toBe(true);
    expect(isTransitionActionName("issue")).toBe(false);
    expect(isTransitionActionName(null)).toBe(false);
  });
});
