import { z } from "zod";

export const startGateSchema = z.object({
  ok: z.boolean(),
  missing_permits: z.array(
    z.object({ code: z.string(), name: z.string(), expired_on: z.string().nullable() }),
  ),
  lockout_required: z.boolean(),
  lockout_active: z.boolean(),
  checklist: z.array(z.object({ id: z.uuid(), text: z.string() })).default([]),
});

export type StartGate = z.infer<typeof startGateSchema>;

export type GateStep = "permits_blocked" | "checklist" | "lockout" | "ready";

export function nextGateStep(
  gate: StartGate,
  checkedIds: ReadonlySet<string>,
  hasLockoutPhoto: boolean,
): GateStep {
  if (gate.missing_permits.length > 0) {
    return "permits_blocked";
  }
  if (gate.checklist.some((item) => !checkedIds.has(item.id))) {
    return "checklist";
  }
  if (gate.lockout_required && !gate.lockout_active && !hasLockoutPhoto) {
    return "lockout";
  }
  return "ready";
}
