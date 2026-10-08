import { describe, expect, it } from "vitest";
import { createAssigner } from "./assignment";
import { buildCatalog, employeeId } from "./catalog";
import { indexCatalog } from "./catalog-index";
import { generateEmployeePermits } from "./permits";
import { createRng } from "./random";
import { MS_PER_HOUR } from "./time";

const now = new Date("2026-10-08T07:30:00Z");
const catalog = buildCatalog(now);
const index = indexCatalog(catalog);
const permits = generateEmployeePermits(1, now);
const issuedAtMs = now.getTime();

const newAssigner = (seed = 1) =>
  createAssigner({ workers: index.workers, permits, rng: createRng(seed) });
const request = (
  overrides: Partial<Parameters<ReturnType<typeof newAssigner>["assign"]>[0]> = {},
) => ({
  issuedAtMs,
  crew: "A" as const,
  specialties: ["fitter" as const],
  requiredPermitTypeIds: [],
  excludeIds: [],
  ...overrides,
});

describe("createAssigner", () => {
  it("picks a free worker of the right specialty from the crew on shift", () => {
    const { worker, waitMs } = newAssigner().assign(request());
    expect(worker.id).toBe(employeeId("2001"));
    expect(waitMs).toBe(0);
  });

  it("queues behind the only crew specialist when he is busy for a short time", () => {
    const assigner = newAssigner();
    assigner.markBusy(employeeId("2001"), issuedAtMs + MS_PER_HOUR);
    const { worker, waitMs } = assigner.assign(request());
    expect(worker.id).toBe(employeeId("2001"));
    expect(waitMs).toBe(MS_PER_HOUR);
  });

  it("calls in a free specialist from another crew when the crew one is busy for long", () => {
    const assigner = newAssigner();
    assigner.markBusy(employeeId("2001"), issuedAtMs + 10 * MS_PER_HOUR);
    const { worker, waitMs } = assigner.assign(request());
    expect(worker.id).not.toBe(employeeId("2001"));
    expect(worker.specialty).toBe("fitter");
    expect(waitMs).toBe(0);
  });

  it("never returns excluded workers", () => {
    const { worker } = newAssigner().assign(request({ excludeIds: [employeeId("2001")] }));
    expect(worker.id).not.toBe(employeeId("2001"));
  });

  it("skips workers whose required permit has expired", () => {
    const heightPermit = [index.permitTypeByCode.get("work_at_height")?.id as string];
    const { worker } = newAssigner().assign(
      request({ crew: "C", requiredPermitTypeIds: heightPermit }),
    );
    expect(worker.id).not.toBe(employeeId("2007"));
    expect(worker.specialty).toBe("fitter");
  });

  it("falls back to substitute specialties when the crew has no specialist", () => {
    const { worker } = newAssigner().assign(
      request({ crew: "D", specialties: ["lubricator", "fitter"] }),
    );
    expect(["lubricator", "fitter"]).toContain(worker.specialty);
  });

  it("tracks busy time per worker", () => {
    const assigner = newAssigner();
    assigner.markBusy(employeeId("2001"), 5);
    expect(assigner.busyUntil(employeeId("2001"))).toBe(5);
    expect(assigner.busyUntil(employeeId("2002"))).toBe(0);
  });
});
