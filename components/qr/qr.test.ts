import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { qrGlyph, QR_QUIET_ZONE } from "@/components/qr/qr-matrix";
import {
  cameraErrorKey,
  fitWithin,
  newOrderPath,
  normalizeQrToken,
  parseQrToken,
  qrRedirectTarget,
  qrTokenUrl,
} from "@/components/qr/qr-token";

const token = "6f1c2a8e-3b4d-4e5f-9a7b-1c2d3e4f5a6b";
const appUrl = "https://naryad.example.kz";

function rasterize(glyph: { size: number; path: string }, scale = 4) {
  const side = (glyph.size + QR_QUIET_ZONE * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const [, x, y, length] of glyph.path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    for (let column = Number(x); column < Number(x) + Number(length); column += 1) {
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = (column + QR_QUIET_ZONE) * scale + dx;
          const py = (Number(y) + QR_QUIET_ZONE) * scale + dy;
          const offset = (py * side + px) * 4;
          pixels[offset] = 0;
          pixels[offset + 1] = 0;
          pixels[offset + 2] = 0;
        }
      }
    }
  }
  return { pixels, side };
}

describe("qr tokens", () => {
  it("builds sticker links from the app url", () => {
    expect(qrTokenUrl(`${appUrl}/`, token)).toBe(`${appUrl}/q/${token}`);
  });

  it("accepts raw tokens and app links", () => {
    expect(normalizeQrToken(` ${token.toUpperCase()} `)).toBe(token);
    expect(parseQrToken(token)).toBe(token);
    expect(parseQrToken(`${appUrl}/q/${token}`, [appUrl])).toBe(token);
    expect(parseQrToken(`${appUrl}/q/${token}/`)).toBe(token);
  });

  it("refuses foreign links and other codes", () => {
    expect(parseQrToken(`https://evil.example/q/${token}`, [appUrl])).toBeNull();
    expect(parseQrToken(`${appUrl}/master/orders/${token}`, [appUrl])).toBeNull();
    expect(parseQrToken("4870001234567")).toBeNull();
    expect(parseQrToken("WIFI:S:plant;T:WPA;P:secret;;")).toBeNull();
  });

  it("sends masters to a new order and everyone else home", () => {
    expect(newOrderPath(null)).toBe("/master/orders/new");
    expect(qrRedirectTarget("master", "eq-1")).toBe("/master/orders/new?equipment=eq-1");
    expect(qrRedirectTarget("worker", "eq-1")).toBe("/worker");
    expect(qrRedirectTarget("admin", null)).toBe("/admin");
    expect(qrRedirectTarget(null, "eq-1")).toBe(
      `/login?next=${encodeURIComponent("/master/orders/new?equipment=eq-1")}`,
    );
  });
});

describe("camera helpers", () => {
  it("explains camera failures", () => {
    expect(cameraErrorKey(new DOMException("no", "NotAllowedError"))).toBe("denied");
    expect(cameraErrorKey({ name: "NotFoundError" })).toBe("notFound");
    expect(cameraErrorKey(new TypeError("no media devices"))).toBe("unsupported");
    expect(cameraErrorKey("boom")).toBe("failed");
  });

  it("scales frames down for the fallback decoder", () => {
    expect(fitWithin(1920, 1080, 640)).toEqual({ width: 640, height: 360 });
    expect(fitWithin(480, 640, 640)).toEqual({ width: 480, height: 640 });
    expect(fitWithin(0, 0, 640)).toEqual({ width: 0, height: 0 });
  });
});

describe("qrGlyph", () => {
  it("draws a code the fallback decoder can read back", () => {
    const url = qrTokenUrl(appUrl, token);
    const glyph = qrGlyph(url);
    expect(glyph.size).toBeGreaterThanOrEqual(21);
    const { pixels, side } = rasterize(glyph);
    const decoded = jsQR(pixels, side, side);
    expect(decoded?.data).toBe(url);
    expect(parseQrToken(decoded?.data ?? "", [appUrl])).toBe(token);
  });
});
