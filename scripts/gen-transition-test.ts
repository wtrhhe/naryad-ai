import { writeFileSync } from "node:fs";
import {
  renderTransitionRulesTest,
  TRANSITION_RULES_TEST_PATH,
} from "../lib/domain/transition-rules-sql";

writeFileSync(TRANSITION_RULES_TEST_PATH, renderTransitionRulesTest());
console.warn(`Wrote ${TRANSITION_RULES_TEST_PATH}`);
