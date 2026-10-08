import {
  TRANSITION_ACTIONS,
  TRANSITIONS,
  type TransitionAction,
} from "@/lib/domain/work-order-machine";

export const TRANSITION_RULES_TEST_PATH = "supabase/tests/database/transition_rules_sync.test.sql";

function sqlArray(values: readonly string[]): string {
  return `'{${values.join(",")}}'`;
}

function ruleRow(action: TransitionAction): string {
  const rule = TRANSITIONS[action];
  const to =
    rule.to === null ? "null::public.work_order_status" : `'${rule.to}'::public.work_order_status`;
  return `  ('${action}'::public.work_order_action, ${sqlArray(rule.from)}::public.work_order_status[], ${to}, ${sqlArray(
    [...rule.roles].sort(),
  )}::text[], ${sqlArray([...rule.requires].sort())}::text[], ${rule.irreversible})`;
}

export function renderTransitionRulesTest(): string {
  const actions = [...TRANSITION_ACTIONS].sort();
  return [
    "begin;",
    "create extension if not exists pgtap with schema extensions;",
    "select plan(1);",
    "select results_eq(",
    "  $$select action, from_statuses, to_status, array(select unnest(roles) order by 1), array(select unnest(requires) order by 1), irreversible",
    "    from public.work_order_transition_rules order by action::text$$,",
    "  $$values",
    actions.map(ruleRow).join(",\n"),
    "  $$,",
    "  'database transition rules match lib/domain/work-order-machine.ts'",
    ");",
    "select * from finish();",
    "rollback;",
    "",
  ].join("\n");
}
