import { describe, expect, it } from "vitest";
import type { RuntimeCaching } from "serwist";
import { withoutPrivateCaches } from "./runtime-caching";

function entry(cacheName: string | null): RuntimeCaching {
  const handler =
    cacheName === null
      ? () => Promise.resolve(new Response())
      : { cacheName, handle: () => undefined };
  return { matcher: () => true, handler } as unknown as RuntimeCaching;
}

describe("withoutPrivateCaches", () => {
  it("drops caches that would keep signed-in pages after sign out", () => {
    const kept = withoutPrivateCaches([
      entry("pages"),
      entry("pages-rsc"),
      entry("pages-rsc-prefetch"),
      entry("others"),
      entry("static-image-assets"),
      entry("next-static-js-assets"),
    ]);
    expect(kept).toHaveLength(2);
  });

  it("keeps handlers without a named cache", () => {
    expect(withoutPrivateCaches([entry(null)])).toHaveLength(1);
  });
});
