import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  renderTransitionRulesTest,
  TRANSITION_RULES_TEST_PATH,
} from "@/lib/domain/transition-rules-sql";

describe("transition rules database test", () => {
  it("is regenerated from the TypeScript state machine (npm run gen:transition-test)", () => {
    expect(readFileSync(TRANSITION_RULES_TEST_PATH, "utf8")).toBe(renderTransitionRulesTest());
  });
});
