import { hasValidPermits } from "./permits";
import type { Rng } from "./random";
import { MS_PER_HOUR } from "./time";
import type { EmployeePermitRow, EmployeeRow, ShiftCrew, Specialty } from "./types";

export type AssignRequest = {
  readonly issuedAtMs: number;
  readonly crew: ShiftCrew;
  readonly specialties: readonly Specialty[];
  readonly requiredPermitTypeIds: readonly string[];
  readonly excludeIds: readonly string[];
};

export type Assignment = { readonly worker: EmployeeRow; readonly waitMs: number };

export type Assigner = {
  readonly assign: (request: AssignRequest) => Assignment;
  readonly markBusy: (workerId: string, untilMs: number) => void;
  readonly busyUntil: (workerId: string) => number;
};

type AssignerDependencies = {
  readonly workers: readonly EmployeeRow[];
  readonly permits: readonly EmployeePermitRow[];
  readonly rng: Rng;
};

const MAX_QUEUE_WAIT_MS = 3 * MS_PER_HOUR;

export function createAssigner({ workers, permits, rng }: AssignerDependencies): Assigner {
  const busyUntilByWorker = new Map<string, number>();
  const busyUntil = (workerId: string): number => busyUntilByWorker.get(workerId) ?? 0;

  const markBusy = (workerId: string, untilMs: number): void => {
    busyUntilByWorker.set(workerId, Math.max(busyUntil(workerId), untilMs));
  };

  const buildPools = (request: AssignRequest): EmployeeRow[][] => {
    const allowed = workers.filter(
      (worker) =>
        !request.excludeIds.includes(worker.id) &&
        hasValidPermits(
          permits,
          worker.id,
          request.requiredPermitTypeIds,
          new Date(request.issuedAtMs),
        ),
    );
    const [primary, ...substitutes] = request.specialties;
    const withSpecialty = (list: readonly Specialty[]) =>
      allowed.filter(
        (worker) => worker.specialty !== null && list.includes(worker.specialty as Specialty),
      );
    const inCrew = (pool: EmployeeRow[]) => pool.filter((worker) => worker.crew === request.crew);
    const primaryPool = primary ? withSpecialty([primary]) : [];
    const anySpecialty = withSpecialty([...(primary ? [primary] : []), ...substitutes]);
    return [
      inCrew(primaryPool),
      inCrew(anySpecialty),
      primaryPool,
      anySpecialty,
      inCrew(allowed),
      allowed,
    ];
  };

  const shortestWait = (pool: readonly EmployeeRow[], issuedAtMs: number): Assignment => {
    const waits = pool.map((worker) => ({
      worker,
      waitMs: Math.max(0, busyUntil(worker.id) - issuedAtMs),
    }));
    return waits.reduce((best, candidate) => (candidate.waitMs < best.waitMs ? candidate : best));
  };

  const assign = (request: AssignRequest): Assignment => {
    const pools = buildPools(request).filter((pool) => pool.length > 0);
    for (const pool of pools) {
      const free = pool.filter((worker) => busyUntil(worker.id) <= request.issuedAtMs);
      if (free.length > 0) return { worker: rng.pick(free), waitMs: 0 };
      const queued = shortestWait(pool, request.issuedAtMs);
      if (queued.waitMs <= MAX_QUEUE_WAIT_MS) return queued;
    }
    const firstPool = pools[0];
    if (!firstPool)
      throw new Error(`No worker available for assignment ${JSON.stringify(request)}`);
    return shortestWait(firstPool, request.issuedAtMs);
  };

  return { assign, markBusy, busyUntil };
}
