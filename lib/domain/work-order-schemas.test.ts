import { describe, expect, it } from "vitest";
import {
  createWorkOrderSchema,
  parseWorkOrderError,
  toCreatePayload,
  toTransitionPayload,
  transitionInputSchema,
} from "@/lib/domain/work-order-schemas";

const orderId = "11111111-1111-4111-8111-111111111111";
const faultCodeId = "22222222-2222-4222-8222-222222222222";
const materialId = "33333333-3333-4333-8333-333333333333";
const equipmentId = "44444444-4444-4444-8444-444444444444";

describe("transitionInputSchema", () => {
  it("accepts a plain accept", () => {
    expect(
      transitionInputSchema.safeParse({ orderId, action: "accept", expectedStatus: "issued" })
        .success,
    ).toBe(true);
  });

  it("rejects a pause without a reason", () => {
    const result = transitionInputSchema.safeParse({
      orderId,
      action: "pause",
      expectedStatus: "in_progress",
      reason: { reasonText: "" },
    });
    expect(result.success).toBe(false);
  });

  it("refuses a client action id that is not a uuid", () => {
    const result = transitionInputSchema.safeParse({
      orderId,
      action: "accept",
      expectedStatus: "issued",
      clientActionId: "offline-1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a reason from the catalog without text", () => {
    const result = transitionInputSchema.safeParse({
      orderId,
      action: "reject",
      expectedStatus: "issued",
      reason: { reasonCodeId: faultCodeId },
    });
    expect(result.success).toBe(true);
  });

  it("requires work text and fault code to complete", () => {
    const result = transitionInputSchema.safeParse({
      orderId,
      action: "complete",
      expectedStatus: "in_progress",
      closing: { workPerformed: "", faultCodeId, materials: [] },
    });
    expect(result.success).toBe(false);
  });

  it("refuses negative material quantities", () => {
    const result = transitionInputSchema.safeParse({
      orderId,
      action: "complete",
      expectedStatus: "in_progress",
      closing: {
        workPerformed: "Заменил сальник",
        faultCodeId,
        materials: [{ materialId, quantity: -1 }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("toTransitionPayload", () => {
  it("maps the closing form to the database payload", () => {
    const input = transitionInputSchema.parse({
      orderId,
      action: "complete",
      expectedStatus: "in_progress",
      closing: {
        workPerformed: " Заменил сальник ",
        faultCodeId,
        materials: [{ materialId, quantity: 2 }],
      },
    });
    expect(toTransitionPayload(input)).toEqual({
      expected_status: "in_progress",
      work_performed: "Заменил сальник",
      fault_code_id: faultCodeId,
      materials: [{ material_id: materialId, quantity: 2 }],
    });
  });

  it("carries the device time and the client action id for offline replays", () => {
    const clientActionId = "55555555-5555-4555-8555-555555555555";
    const input = transitionInputSchema.parse({
      orderId,
      action: "accept",
      expectedStatus: "issued",
      deviceAt: "2026-10-11T08:15:00+05:00",
      clientActionId,
    });
    expect(toTransitionPayload(input)).toEqual({
      expected_status: "issued",
      device_at: "2026-10-11T08:15:00+05:00",
      client_action_id: clientActionId,
    });
  });

  it("drops empty optional fields", () => {
    const input = transitionInputSchema.parse({
      orderId,
      action: "pause",
      expectedStatus: "in_progress",
      reason: { reasonText: "ждём запчасть" },
    });
    expect(toTransitionPayload(input)).toEqual({
      expected_status: "in_progress",
      reason_text: "ждём запчасть",
    });
  });
});

describe("createWorkOrderSchema", () => {
  const valid = {
    kind: "unplanned",
    priority: "emergency",
    description: "Течь масла на насосе",
    equipmentId,
    assigneeId: orderId,
    standardHours: 2,
  };

  it("accepts a minimal emergency order", () => {
    expect(createWorkOrderSchema.safeParse(valid).success).toBe(true);
  });

  it("requires an executor", () => {
    const { assigneeId: _ignored, ...withoutExecutor } = valid;
    expect(createWorkOrderSchema.safeParse(withoutExecutor).success).toBe(false);
  });

  it("requires a deadline or a standard", () => {
    const { standardHours: _ignored, ...withoutDeadline } = valid;
    expect(createWorkOrderSchema.safeParse(withoutDeadline).success).toBe(false);
  });

  it("maps to snake case for the database", () => {
    expect(toCreatePayload(createWorkOrderSchema.parse(valid))).toEqual({
      kind: "unplanned",
      priority: "emergency",
      description: "Течь масла на насосе",
      equipment_id: equipmentId,
      assignee_id: orderId,
      standard_hours: 2,
    });
  });
});

describe("parseWorkOrderError", () => {
  it("extracts known codes from database errors", () => {
    expect(parseWorkOrderError("wo:after_photo_required")).toBe("after_photo_required");
  });

  it("ignores unknown messages", () => {
    expect(parseWorkOrderError("duplicate key value")).toBeNull();
    expect(parseWorkOrderError(undefined)).toBeNull();
  });
});
