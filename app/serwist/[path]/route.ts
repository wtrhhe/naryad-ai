import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

const OFFLINE_PAGE_URL = "/offline";

function readBuildRevision(): string {
  const gitResult = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
  const gitRevision = typeof gitResult.stdout === "string" ? gitResult.stdout.trim() : "";
  return gitRevision.length > 0 ? gitRevision : randomUUID();
}

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    additionalPrecacheEntries: [{ url: OFFLINE_PAGE_URL, revision: readBuildRevision() }],
    swSrc: "app/sw.ts",
    useNativeEsbuild: true,
  },
);
