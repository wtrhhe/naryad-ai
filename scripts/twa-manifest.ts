import { mkdirSync, writeFileSync } from "node:fs";
import { buildTwaManifest } from "../lib/twa/config";

const appUrl = process.argv
  .find((argument) => argument.startsWith("--url="))
  ?.slice("--url=".length);
const packageName = process.argv
  .find((argument) => argument.startsWith("--package="))
  ?.slice("--package=".length);

if (!appUrl) {
  console.error("Usage: npm run twa:manifest -- --url=https://<deployed app> [--package=<id>]");
  process.exit(1);
}

mkdirSync("android", { recursive: true });
writeFileSync(
  "android/twa-manifest.json",
  `${JSON.stringify(buildTwaManifest(appUrl, packageName), null, 2)}\n`,
);
console.warn("Wrote android/twa-manifest.json");
