import { z } from "zod";

export const DEFAULT_PACKAGE_NAME = "kz.kostanaiminerals.naryad";

const twaEnvSchema = z.object({
  ANDROID_PACKAGE_NAME: z
    .string()
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
    .default(DEFAULT_PACKAGE_NAME),
  ANDROID_CERT_SHA256: z.string().default(""),
});

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function parseFingerprints(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => FINGERPRINT.test(item));
}

export function buildAssetLinks(source: Record<string, string | undefined>) {
  const env = twaEnvSchema.parse(source);
  const fingerprints = parseFingerprints(env.ANDROID_CERT_SHA256);
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.ANDROID_PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

export function buildTwaManifest(appUrl: string, packageName = DEFAULT_PACKAGE_NAME) {
  const url = new URL(appUrl);
  return {
    packageId: packageName,
    host: url.host,
    name: "НарядAI",
    launcherName: "НарядAI",
    display: "standalone",
    orientation: "portrait",
    themeColor: "#0B0F14",
    navigationColor: "#0B0F14",
    navigationColorDark: "#0B0F14",
    navigationDividerColor: "#0B0F14",
    navigationDividerColorDark: "#0B0F14",
    backgroundColor: "#0B0F14",
    enableNotifications: true,
    startUrl: "/",
    iconUrl: new URL("/icons/icon-512.png", url).toString(),
    maskableIconUrl: new URL("/icons/icon-maskable-512.png", url).toString(),
    monochromeIconUrl: new URL("/icons/badge-72.png", url).toString(),
    splashScreenFadeOutDuration: 300,
    signingKey: { path: "./android.keystore", alias: "naryad" },
    appVersionName: "1.0.0",
    appVersionCode: 1,
    shortcuts: [],
    generatorApp: "bubblewrap-cli",
    webManifestUrl: new URL("/manifest.webmanifest", url).toString(),
    fallbackType: "customtabs",
    features: {},
    alphaDependencies: { enabled: false },
    enableSiteSettingsShortcut: true,
    isChromeOSOnly: false,
    isMetaQuest: false,
    fullScopeUrl: new URL("/", url).toString(),
    minSdkVersion: 24,
    orientationLock: false,
  };
}
