import { describe, expect, it } from "vitest";
import { parseRatingSearch } from "@/lib/rating/params";

const NOW = new Date("2026-10-08T10:30:00Z");
const SITE = "6f1c2a8e-4b1d-4c7a-9e2f-0a1b2c3d4e5f";

describe("parseRatingSearch", () => {
  it("reads the period, view and filters", () => {
    const search = parseRatingSearch(
      { period: "custom", from: "2026-09-01", to: "2026-09-07", view: "brigades", site: SITE },
      NOW,
    );
    expect(search.period.preset).toBe("custom");
    expect(search.view).toBe("brigades");
    expect(search.filter).toEqual({ siteId: SITE, brigadeId: undefined });
  });

  it("ignores malformed values", () => {
    const search = parseRatingSearch(
      { period: ["month", "day"], view: "people", site: "not-a-uuid", brigade: [SITE] },
      NOW,
    );
    expect(search.period.preset).toBe("month");
    expect(search.view).toBe("employees");
    expect(search.filter).toEqual({ siteId: undefined, brigadeId: SITE });
  });
});
