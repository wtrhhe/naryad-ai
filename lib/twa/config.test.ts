import { describe, expect, it } from "vitest";
import { buildAssetLinks, buildTwaManifest, parseFingerprints } from "@/lib/twa/config";

const fingerprint = Array.from({ length: 32 }, () => "ab").join(":");

describe("assetlinks", () => {
  it("publishes nothing until the signing fingerprint is configured", () => {
    expect(buildAssetLinks({})).toEqual([]);
  });

  it("normalises fingerprints and drops malformed ones", () => {
    expect(parseFingerprints(`${fingerprint}, nope`)).toEqual([fingerprint.toUpperCase()]);
    expect(buildAssetLinks({ ANDROID_CERT_SHA256: fingerprint })[0]?.target).toEqual({
      namespace: "android_app",
      package_name: "kz.kostanaiminerals.naryad",
      sha256_cert_fingerprints: [fingerprint.toUpperCase()],
    });
  });
});

describe("buildTwaManifest", () => {
  it("points the Android wrapper to the deployed app", () => {
    const manifest = buildTwaManifest("https://naryad.example.kz");
    expect(manifest.host).toBe("naryad.example.kz");
    expect(manifest.webManifestUrl).toBe("https://naryad.example.kz/manifest.webmanifest");
  });
});
