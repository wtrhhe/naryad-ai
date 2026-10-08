import { describe, expect, it } from "vitest";
import { isActiveNavItem, NAVIGATION, splitNavigation } from "@/lib/navigation";
import { roleForPath } from "@/lib/auth/roles";

describe("isActiveNavItem", () => {
  const items = NAVIGATION.master;
  const board = items[0]!;
  const newOrder = items[1]!;
  const orders = items[2]!;

  it("highlights only the most specific matching item", () => {
    expect(isActiveNavItem("/master/orders/new", newOrder, items)).toBe(true);
    expect(isActiveNavItem("/master/orders/new", orders, items)).toBe(false);
    expect(isActiveNavItem("/master/orders/new", board, items)).toBe(false);
  });

  it("highlights the section root on its own page", () => {
    expect(isActiveNavItem("/master", board, items)).toBe(true);
  });
});

describe("NAVIGATION", () => {
  it("keeps every link inside the role's own section", () => {
    Object.entries(NAVIGATION).forEach(([role, items]) => {
      items.forEach((item) => expect(roleForPath(item.href)).toBe(role));
    });
  });
});

describe("splitNavigation", () => {
  it("keeps at most four primary items for the bottom bar", () => {
    Object.values(NAVIGATION).forEach((items) => {
      const { primary, more } = splitNavigation(items);
      expect(primary.length).toBeLessThanOrEqual(4);
      expect(primary.length + more.length).toBe(items.length);
    });
  });
});
