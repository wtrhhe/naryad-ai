import { describe, expect, it } from "vitest";
import { generateHistory } from "./history";
import {
  fixtureCatalog,
  fixtureHistory,
  fixtureIndex,
  TEST_NOW,
  TEST_SEED,
} from "./history-fixture";
import { crewOnShift, MS_PER_DAY, shiftPeriodAt } from "./time";

const history = fixtureHistory;
const orders = history.workOrders;
const nowMs = TEST_NOW.getTime();

describe("determinism", () => {
  it("returns an identical dataset for the same seed and moment", () => {
    expect(JSON.stringify(generateHistory(TEST_SEED, TEST_NOW))).toBe(JSON.stringify(history));
  });

  it("returns a different dataset for a different seed", () => {
    const other = generateHistory(TEST_SEED + 1, TEST_NOW);
    expect(JSON.stringify(other.workOrders)).not.toBe(JSON.stringify(orders));
  });
});

describe("volume and mix", () => {
  it("has at least 600 work orders inside the last 90 days", () => {
    expect(orders.length).toBeGreaterThanOrEqual(600);
    for (const order of orders) {
      const issued = new Date(order.issued_at as string).getTime();
      expect(issued).toBeGreaterThanOrEqual(nowMs - 90 * MS_PER_DAY);
      expect(issued).toBeLessThanOrEqual(nowMs);
    }
  });

  it("mostly consists of closed orders", () => {
    const closed = orders.filter((order) => order.status === "closed").length;
    expect(closed / orders.length).toBeGreaterThan(0.85);
  });

  it("mixes planned and unplanned kinds and all priorities", () => {
    const planned = orders.filter((order) => order.kind === "planned");
    const unplanned = orders.filter((order) => order.kind === "unplanned");
    expect(planned.length).toBeGreaterThan(100);
    expect(unplanned.length).toBeGreaterThan(200);
    expect(planned.every((order) => order.priority === "planned")).toBe(true);
    const priorities = new Set(unplanned.map((order) => order.priority));
    expect(priorities).toEqual(new Set(["emergency", "high", "normal"]));
  });

  it("includes rejected-then-reassigned, reworked and cancelled orders", () => {
    expect(history.events.filter((event) => event.action === "reject").length).toBeGreaterThan(10);
    expect(history.events.filter((event) => event.action === "reassign").length).toBeGreaterThan(
      10,
    );
    expect(orders.filter((order) => (order.rework_count ?? 0) > 0).length).toBeGreaterThan(15);
    expect(orders.filter((order) => order.status === "cancelled").length).toBeGreaterThan(3);
  });

  it("records invalid and valid reject reasons", () => {
    const rejectReasons = history.events
      .filter((event) => event.action === "reject")
      .map((event) =>
        fixtureCatalog.reasonCodes.find((reason) => reason.id === event.reason_code_id),
      );
    expect(rejectReasons.every(Boolean)).toBe(true);
    expect(rejectReasons.some((reason) => reason?.is_valid_excuse === false)).toBe(true);
    expect(rejectReasons.some((reason) => reason?.is_valid_excuse === true)).toBe(true);
  });
});

describe("referential integrity and uniqueness", () => {
  it("references existing catalog rows", () => {
    for (const order of orders) {
      expect(fixtureIndex.equipmentById.has(order.equipment_id)).toBe(true);
      expect(fixtureIndex.employeeById.has(order.master_id)).toBe(true);
      expect(fixtureIndex.employeeById.has(order.assignee_id as string)).toBe(true);
      expect(fixtureIndex.siteCodeById.has(order.site_id)).toBe(true);
      if (order.fault_code_id) expect(fixtureIndex.faultById.has(order.fault_code_id)).toBe(true);
      expect(fixtureIndex.equipmentById.get(order.equipment_id)?.site_id).toBe(order.site_id);
    }
  });

  it("links every child row to an existing order", () => {
    const orderIds = new Set(orders.map((order) => order.id));
    for (const row of [
      ...history.events,
      ...history.photos,
      ...history.materialWriteoffs,
      ...history.aiReviews,
      ...history.lockouts,
    ]) {
      expect(orderIds.has(row.work_order_id)).toBe(true);
    }
    for (const sample of history.acousticSamples) {
      if (sample.work_order_id) expect(orderIds.has(sample.work_order_id)).toBe(true);
    }
  });

  it("keeps ids and natural keys unique", () => {
    const unique = (values: readonly string[]) => new Set(values).size === values.length;
    expect(unique(orders.map((order) => order.id))).toBe(true);
    expect(unique(history.events.map((event) => event.id))).toBe(true);
    expect(unique(history.photos.map((photo) => photo.storage_path))).toBe(true);
    expect(
      unique(history.materialWriteoffs.map((row) => `${row.work_order_id}:${row.material_id}`)),
    ).toBe(true);
    expect(unique(history.aiReviews.map((row) => `${row.work_order_id}:${row.revision}`))).toBe(
      true,
    );
    expect(unique(history.acousticSamples.map((sample) => sample.id))).toBe(true);
  });
});

describe("shifts", () => {
  it("derives shift period and crew from the issue time", () => {
    for (const order of orders) {
      const issuedAt = new Date(order.issued_at as string);
      expect(order.shift_period).toBe(shiftPeriodAt(issuedAt));
      expect(order.shift_crew).toBe(crewOnShift(issuedAt));
    }
  });

  it("contains both day and night orders", () => {
    expect(new Set(orders.map((order) => order.shift_period))).toEqual(new Set(["day", "night"]));
  });
});

describe("status and timeline consistency", () => {
  const eventsByOrder = Map.groupBy(history.events, (event) => event.work_order_id);

  it("starts with an issue event and chains statuses until the final status", () => {
    for (const order of orders) {
      const events = [...(eventsByOrder.get(order.id) ?? [])].sort((a, b) =>
        (a.occurred_at as string).localeCompare(b.occurred_at as string),
      );
      expect(events[0]?.action).toBe("issue");
      let previous: string | null = null;
      for (const event of events) {
        if (event.to_status) {
          if (event.from_status) expect(event.from_status).toBe(previous);
          previous = event.to_status;
        }
      }
      expect(previous).toBe(order.status);
    }
  });

  it("orders closed order timestamps chronologically", () => {
    const closed = orders.filter((order) => order.status === "closed");
    for (const order of closed) {
      const chain = [
        order.issued_at,
        order.accepted_at,
        order.started_at,
        order.done_at,
        order.review_started_at,
        order.closed_at,
      ].map((value) => new Date(value as string).getTime());
      expect(chain.every(Number.isFinite)).toBe(true);
      expect([...chain].sort((a, b) => a - b)).toEqual(chain);
      expect(chain[5]).toBeLessThanOrEqual(nowMs);
      expect(order.fault_code_id).toBeTruthy();
      expect(order.work_performed).toBeTruthy();
    }
  });

  it("includes every workflow action", () => {
    const actions = new Set(history.events.map((event) => event.action));
    for (const action of [
      "issue",
      "accept",
      "start",
      "pause",
      "resume",
      "complete",
      "submit_review",
      "approve",
      "reject",
      "reassign",
      "return_rework",
      "queue",
    ]) {
      expect(actions.has(action as never)).toBe(true);
    }
  });

  it("records downtime and cost only for unplanned orders", () => {
    for (const order of orders.filter((candidate) => candidate.status === "closed")) {
      if (order.kind === "planned") {
        expect(order.downtime_started_at ?? null).toBeNull();
        expect(order.downtime_cost ?? null).toBeNull();
        continue;
      }
      const hours =
        (new Date(order.downtime_ended_at as string).getTime() -
          new Date(order.downtime_started_at as string).getTime()) /
        3_600_000;
      const costPerHour = fixtureIndex.equipmentById.get(order.equipment_id)
        ?.downtime_cost_per_hour as number;
      expect(hours).toBeGreaterThan(0);
      expect(order.downtime_cost as number).toBeCloseTo(hours * costPerHour, 0);
    }
  });
});

describe("orders open for the current shift", () => {
  const open = orders.filter((order) => !["closed", "cancelled"].includes(order.status as string));

  it("covers issued, queued, accepted, in_progress and paused", () => {
    expect(open.length).toBeGreaterThanOrEqual(5);
    expect(open.length).toBeLessThanOrEqual(15);
    const statuses = new Set(open.map((order) => order.status));
    for (const status of ["issued", "queued", "accepted", "in_progress", "paused"]) {
      expect(statuses.has(status as never)).toBe(true);
    }
  });

  it("belongs to the shift running now and is assigned to employees on shift", () => {
    for (const order of open) {
      const issuedAt = new Date(order.issued_at as string);
      expect(nowMs - issuedAt.getTime()).toBeLessThan(12 * 3_600_000);
      expect(order.shift_period).toBe(shiftPeriodAt(TEST_NOW));
      expect(fixtureIndex.employeeById.get(order.assignee_id as string)?.on_shift).toBe(true);
    }
  });

  it("keeps open orders on distinct equipment", () => {
    expect(new Set(open.map((order) => order.equipment_id)).size).toBe(open.length);
  });
});

describe("photos, lockouts, writeoffs and reviews", () => {
  it("stores before and after photo rows with hashes and ghost scores", () => {
    const closedIds = new Set(
      orders.filter((order) => order.status === "closed").map((order) => order.id),
    );
    const byOrder = Map.groupBy(history.photos, (photo) => photo.work_order_id);
    for (const id of closedIds) {
      const kinds = new Set((byOrder.get(id) ?? []).map((photo) => photo.kind));
      expect(kinds.has("before") && kinds.has("after")).toBe(true);
    }
    for (const photo of history.photos) {
      expect(photo.storage_path).toMatch(
        new RegExp(`^${photo.work_order_id}/(before|after|loto)-[0-9]+\\.webp$`),
      );
      expect(photo.phash).toMatch(/^[0-9a-f]{16}$/);
      expect(photo.mime_type).toBe("image/webp");
      if (photo.kind === "after") expect(photo.ghost_score).not.toBeNull();
      if (photo.kind === "before") expect(photo.ghost_score ?? null).toBeNull();
    }
    expect(history.photos.some((photo) => (photo.ghost_score ?? 0) > 0.8)).toBe(true);
  });

  it("creates a lockout for lockout equipment that is released once the work is done", () => {
    expect(history.lockouts.length).toBeGreaterThan(300);
    const orderById = new Map(orders.map((order) => [order.id, order]));
    for (const lockout of history.lockouts) {
      const order = orderById.get(lockout.work_order_id);
      expect(fixtureIndex.equipmentById.get(lockout.equipment_id)?.requires_lockout).toBe(true);
      if (order?.status === "closed") expect(lockout.released_at).toBeTruthy();
      if (order?.status === "in_progress" || order?.status === "paused")
        expect(lockout.released_at ?? null).toBeNull();
    }
  });

  it("writes positive quantities for orders with a fault code only", () => {
    const orderById = new Map(orders.map((order) => [order.id, order]));
    expect(history.materialWriteoffs.length).toBeGreaterThan(500);
    for (const row of history.materialWriteoffs) {
      expect(row.quantity).toBeGreaterThan(0);
      expect(orderById.get(row.work_order_id)?.fault_code_id).toBeTruthy();
    }
  });

  it("stores consistent Russian reviews", () => {
    expect(history.aiReviews.length).toBeGreaterThan(500);
    const cyrillic = /[А-Яа-яЁё]/;
    for (const review of history.aiReviews) {
      const score = review.score as number;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
      expect(cyrillic.test(review.worker_explanation as string)).toBe(true);
      expect(cyrillic.test(review.master_explanation as string)).toBe(true);
      if (review.verdict === "rework") expect(score).toBeLessThan(60);
      if (review.verdict === "accepted") expect(score).toBeGreaterThanOrEqual(80);
      if (
        review.master_score !== null &&
        review.master_score !== undefined &&
        review.master_score !== score
      ) {
        expect((review.master_comment ?? "").length).toBeGreaterThan(0);
      }
    }
    expect(new Set(history.aiReviews.map((review) => review.verdict))).toEqual(
      new Set(["accepted", "accepted_with_remarks", "rework"]),
    );
  });

  it("flags material overuse in the review checks", () => {
    const flagged = history.aiReviews.filter((review) =>
      (review.checks as Array<{ key: string; passed: boolean }>).some(
        (check) => check.key === "materials" && !check.passed,
      ),
    );
    expect(flagged.length).toBeGreaterThan(5);
  });
});

describe("acoustic samples", () => {
  it("exist only for equipment with bearings and use the documented format", () => {
    expect(history.acousticSamples.length).toBeGreaterThan(100);
    for (const sample of history.acousticSamples) {
      expect(
        fixtureIndex.equipmentById.get(sample.equipment_id)?.bearing_rolling_elements,
      ).toBeTruthy();
      expect(sample.sample_rate).toBe(48_000);
      expect(sample.duration_seconds).toBe(10);
      expect(["before", "after"]).toContain(sample.kind);
      const spectrum = sample.spectrum as Array<{ f: number; db: number }>;
      expect(spectrum.length).toBeGreaterThanOrEqual(32);
      expect(spectrum.every((bin) => bin.f > 0 && Number.isFinite(bin.db))).toBe(true);
      expect(spectrum.map((bin) => bin.f)).toEqual(
        [...spectrum.map((bin) => bin.f)].sort((a, b) => a - b),
      );
      expect(Array.isArray(sample.peaks)).toBe(true);
      expect(sample.rms).toBeGreaterThan(0);
      expect(sample.spectral_kurtosis).not.toBeNull();
    }
  });
});

describe("permits", () => {
  it("returns the employee permits used for assignment", () => {
    expect(history.employeePermits.length).toBeGreaterThan(30);
  });

  it("does not assign work requiring an expired permit", () => {
    const expiredWorkers = new Set([
      fixtureIndex.employeeByNumber.get("2007")?.id,
      fixtureIndex.employeeByNumber.get("2013")?.id,
    ]);
    const expiredTypeIds = new Set(
      history.employeePermits
        .filter((permit) => permit.expires_on < TEST_NOW.toISOString().slice(0, 10))
        .map((permit) => permit.id),
    );
    expect(expiredTypeIds.size).toBe(2);
    const violations = orders.filter((order) => {
      if (!expiredWorkers.has(order.assignee_id as string)) return false;
      const equipment = fixtureIndex.equipmentById.get(order.equipment_id);
      const heightWork =
        equipment?.equipment_type === "conveyor" || equipment?.equipment_type === "screen";
      const liftingWork = ["crusher", "mill", "other"].includes(
        equipment?.equipment_type as string,
      );
      const expiredAt = (employeeNumber: string, permitCode: string) => {
        const permit = history.employeePermits.find(
          (candidate) =>
            candidate.employee_id === fixtureIndex.employeeByNumber.get(employeeNumber)?.id &&
            candidate.permit_type_id === fixtureIndex.permitTypeByCode.get(permitCode)?.id,
        );
        return new Date(`${permit?.expires_on}T00:00:00Z`).getTime();
      };
      const issuedAt = new Date(order.issued_at as string).getTime();
      const employeeNumber = fixtureIndex.employeeById.get(order.assignee_id as string)
        ?.personnel_number as string;
      if (employeeNumber === "2007" && heightWork)
        return issuedAt > expiredAt("2007", "work_at_height") + MS_PER_DAY;
      if (employeeNumber === "2013" && liftingWork)
        return issuedAt > expiredAt("2013", "lifting_gear") + MS_PER_DAY;
      return false;
    });
    expect(violations.length).toBeLessThanOrEqual(3);
  });
});
