import type { RuntimeCaching } from "serwist";

export const PRIVATE_CACHE_NAMES = ["pages", "pages-rsc", "pages-rsc-prefetch", "others"] as const;

const privateCacheNames: ReadonlySet<string> = new Set(PRIVATE_CACHE_NAMES);

function cacheNameOf(entry: RuntimeCaching): string | null {
  const handler: unknown = entry.handler;
  if (typeof handler === "object" && handler !== null && "cacheName" in handler) {
    const { cacheName } = handler as { cacheName: unknown };
    return typeof cacheName === "string" ? cacheName : null;
  }
  return null;
}

export function withoutPrivateCaches(entries: readonly RuntimeCaching[]): RuntimeCaching[] {
  return entries.filter((entry) => {
    const name = cacheNameOf(entry);
    return name === null || !privateCacheNames.has(name);
  });
}
