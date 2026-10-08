import { describe, expect, it } from "vitest";
import { nextGateStep, startGateSchema, type StartGate } from "@/lib/safety/gate";

const gate: StartGate = startGateSchema.parse({
  ok: false,
  missing_permits: [],
  lockout_required: true,
  lockout_active: false,
  checklist: [
    { id: "11111111-1111-4111-8111-111111111111", text: "Оборудование остановлено" },
    { id: "22222222-2222-4222-8222-222222222222", text: "Плакат вывешен" },
  ],
});

const allChecked = new Set(gate.checklist.map((item) => item.id));

describe("nextGateStep", () => {
  it("blocks on missing permits before anything else", () => {
    expect(
      nextGateStep(
        { ...gate, missing_permits: [{ code: "x", name: "Высота", expired_on: "2025-01-01" }] },
        allChecked,
        true,
      ),
    ).toBe("permits_blocked");
  });

  it("requires every checklist item", () => {
    expect(nextGateStep(gate, new Set([gate.checklist[0]!.id]), true)).toBe("checklist");
  });

  it("requires a LOTO photo when lockout is needed and not active", () => {
    expect(nextGateStep(gate, allChecked, false)).toBe("lockout");
    expect(nextGateStep(gate, allChecked, true)).toBe("ready");
  });

  it("skips LOTO for equipment that does not need it or is already locked", () => {
    expect(nextGateStep({ ...gate, lockout_required: false }, allChecked, false)).toBe("ready");
    expect(nextGateStep({ ...gate, lockout_active: true }, allChecked, false)).toBe("ready");
  });
});
