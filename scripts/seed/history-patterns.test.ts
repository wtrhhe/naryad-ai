import { describe, expect, it } from "vitest";
import { fixtureCatalog, fixtureHistory, fixtureIndex, TEST_NOW } from "./history-fixture";
import { MS_PER_DAY } from "./time";

const history = fixtureHistory;
const orders = history.workOrders;
const nowMs = TEST_NOW.getTime();

describe("embedded pattern 1: conveyor К-3 degrades and breaks often", () => {
  const conveyors = fixtureCatalog.equipment.filter((unit) => unit.equipment_type === "conveyor");
  const k3 = conveyors.find((unit) => unit.name === "Конвейер К-3");
  const unplannedOn = (equipmentId: string) =>
    orders.filter((order) => order.equipment_id === equipmentId && order.kind === "unplanned");
  const faultCodeOf = (order: { fault_code_id?: string | null }) =>
    fixtureIndex.faultById.get(order.fault_code_id as string)?.code;

  it("has about three times the unplanned orders of the average other conveyor", () => {
    const others = conveyors.filter((unit) => unit.id !== k3?.id);
    const averageOther =
      others.reduce((sum, unit) => sum + unplannedOn(unit.id).length, 0) / others.length;
    const ratio = unplannedOn(k3?.id as string).length / averageOther;
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3.6);
  });

  it("has about 70 percent bearing wear faults while other conveyors do not", () => {
    const k3Orders = unplannedOn(k3?.id as string).filter((order) => order.status === "closed");
    const bearingShare =
      k3Orders.filter((order) => faultCodeOf(order) === "М-02").length / k3Orders.length;
    expect(bearingShare).toBeGreaterThan(0.6);
    expect(bearingShare).toBeLessThan(0.8);
    const otherOrders = conveyors
      .filter((unit) => unit.id !== k3?.id)
      .flatMap((unit) => unplannedOn(unit.id))
      .filter((order) => order.status === "closed");
    expect(
      otherOrders.filter((order) => faultCodeOf(order) === "М-02").length / otherOrders.length,
    ).toBeLessThan(0.2);
  });

  const peakDb = (sample: { spectrum: unknown }) =>
    Math.max(...(sample.spectrum as Array<{ db: number }>).map((bin) => bin.db));
  const samplesOf = (equipmentId: string) =>
    history.acousticSamples
      .filter((sample) => sample.equipment_id === equipmentId)
      .sort((a, b) => (a.recorded_at as string).localeCompare(b.recorded_at as string));
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const edgeDifference = (values: number[]) => {
    const third = Math.floor(values.length / 3);
    return mean(values.slice(-third)) - mean(values.slice(0, third));
  };

  it("shows rising peak level and spectral kurtosis over time", () => {
    const samples = samplesOf(k3?.id as string);
    expect(samples.length).toBeGreaterThan(40);
    expect(edgeDifference(samples.map(peakDb))).toBeGreaterThan(8);
    expect(
      edgeDifference(samples.map((sample) => sample.spectral_kurtosis as number)),
    ).toBeGreaterThan(2.5);
  });

  it("keeps healthy bearing equipment flat", () => {
    const healthy = fixtureCatalog.equipment.find((unit) => unit.name === "Конвейер К-1");
    const samples = samplesOf(healthy?.id as string);
    expect(samples.length).toBeGreaterThan(10);
    expect(Math.abs(edgeDifference(samples.map(peakDb)))).toBeLessThan(3);
  });
});

describe("embedded pattern 2: one worker with repeat failures", () => {
  const repeatRate = (workerId: string) => {
    const own = orders.filter(
      (order) =>
        order.assignee_id === workerId && order.kind === "unplanned" && order.status === "closed",
    );
    const repeated = own.filter((order) => {
      const doneAt = new Date(order.done_at as string).getTime();
      return orders.some((candidate) => {
        if (candidate.id === order.id || candidate.kind !== "unplanned") return false;
        if (
          candidate.equipment_id !== order.equipment_id ||
          candidate.fault_code_id !== order.fault_code_id
        )
          return false;
        const gap = new Date(candidate.issued_at as string).getTime() - doneAt;
        return gap > 0 && gap <= 7 * MS_PER_DAY;
      });
    });
    return { orders: own.length, rate: repeated.length / Math.max(own.length, 1) };
  };

  it("makes worker 2004 clearly worse than every peer", () => {
    const suspect = repeatRate(fixtureIndex.employeeByNumber.get("2004")?.id as string);
    const peers = fixtureCatalog.employees
      .filter((employee) => employee.role === "worker" && employee.personnel_number !== "2004")
      .map((employee) => repeatRate(employee.id))
      .filter((stats) => stats.orders >= 10)
      .map((stats) => stats.rate);
    expect(suspect.orders).toBeGreaterThan(25);
    expect(suspect.rate).toBeGreaterThan(0.4);
    expect(peers.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...peers)).toBeLessThan(suspect.rate);
    expect(mean(peers)).toBeLessThan(suspect.rate / 1.8);
  });

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
});

describe("embedded pattern 3: crusher КМД-1750 fails after each planned repair", () => {
  const crusher = fixtureCatalog.equipment.find((unit) => unit.name === "Дробилка КМД-1750");
  const followUpWithinFiveDays = (order: (typeof orders)[number]) => {
    const closedAt = new Date(order.closed_at as string).getTime();
    return orders.some((candidate) => {
      if (candidate.equipment_id !== order.equipment_id || candidate.kind !== "unplanned")
        return false;
      const gap = new Date(candidate.issued_at as string).getTime() - closedAt;
      return gap > 0 && gap <= 5 * MS_PER_DAY;
    });
  };

  it("has an unplanned order within five days after every planned repair", () => {
    const repairs = orders.filter(
      (order) =>
        order.equipment_id === crusher?.id &&
        order.kind === "planned" &&
        order.status === "closed" &&
        order.standard_hours === 20,
    );
    expect(repairs.length).toBeGreaterThanOrEqual(4);
    expect(repairs.every(followUpWithinFiveDays)).toBe(true);
  });

  it("is rarer for other equipment", () => {
    const others = orders.filter(
      (order) =>
        order.equipment_id !== crusher?.id &&
        order.kind === "planned" &&
        order.status === "closed" &&
        (order.standard_hours ?? 0) >= 5,
    );
    expect(others.length).toBeGreaterThan(20);
    expect(others.filter(followUpWithinFiveDays).length / others.length).toBeLessThan(0.7);
  });
});

describe("embedded pattern 4: night shift in enrichment overuses materials", () => {
  const normTypical = new Map(
    fixtureCatalog.materialNorms.map((norm) => [
      `${norm.fault_code_id}:${norm.material_id}`,
      norm.qty_typical,
    ]),
  );
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const enrichId = fixtureCatalog.sites.find((site) => site.code === "ENRICH")?.id;

  const ratio = (selector: (order: (typeof orders)[number]) => boolean) => {
    let used = 0;
    let norm = 0;
    for (const row of history.materialWriteoffs) {
      const order = orderById.get(row.work_order_id);
      if (!order || !selector(order)) continue;
      used += row.quantity;
      norm += normTypical.get(`${order.fault_code_id}:${row.material_id}`) ?? 0;
    }
    return { ratio: used / norm, norm };
  };

  it("writes off about 40 percent more than the norm", () => {
    const enrichNight = ratio(
      (order) => order.site_id === enrichId && order.shift_period === "night",
    );
    expect(enrichNight.norm).toBeGreaterThan(100);
    expect(enrichNight.ratio).toBeGreaterThan(1.3);
    expect(enrichNight.ratio).toBeLessThan(1.52);
  });

  it("stays near the norm for all other shifts and sites", () => {
    const rest = ratio((order) => !(order.site_id === enrichId && order.shift_period === "night"));
    expect(rest.ratio).toBeGreaterThan(0.93);
    expect(rest.ratio).toBeLessThan(1.09);
    const enrichDay = ratio((order) => order.site_id === enrichId && order.shift_period === "day");
    expect(enrichDay.ratio).toBeLessThan(1.12);
  });
});

describe("embedded pattern 5: recurring gland leak on pump Н-4", () => {
  const pump = fixtureCatalog.equipment.find((unit) => unit.name === "Насос Н-4");
  const glandFault = fixtureCatalog.faultCodes.find((fault) => fault.code === "М-05");
  const leaks = orders
    .filter((order) => order.equipment_id === pump?.id && order.fault_code_id === glandFault?.id)
    .sort((a, b) => (a.issued_at as string).localeCompare(b.issued_at as string));

  it("has exactly three occurrences within the last 40 days", () => {
    expect(leaks).toHaveLength(3);
    for (const leak of leaks) {
      expect(nowMs - new Date(leak.issued_at as string).getTime()).toBeLessThanOrEqual(
        40 * MS_PER_DAY,
      );
      expect(leak.kind).toBe("unplanned");
    }
  });

  it("repeats five to nine days after the previous leak", () => {
    for (let index = 1; index < leaks.length; index += 1) {
      const gapDays =
        (new Date(leaks[index]?.issued_at as string).getTime() -
          new Date(leaks[index - 1]?.issued_at as string).getTime()) /
        MS_PER_DAY;
      expect(gapDays).toBeGreaterThanOrEqual(5);
      expect(gapDays).toBeLessThanOrEqual(9);
    }
  });

  it("has exactly one open root cause case with a five whys draft", () => {
    const openCases = history.rcaCases.filter((rcaCase) => rcaCase.status === "open");
    expect(openCases).toHaveLength(1);
    const [rcaCase] = openCases;
    expect(rcaCase?.equipment_id).toBe(pump?.id);
    expect(rcaCase?.fault_code_id).toBe(glandFault?.id);
    expect([...(rcaCase?.related_order_ids ?? [])].sort()).toEqual(
      leaks.map((leak) => leak.id).sort(),
    );
    const whys = rcaCase?.five_whys as Array<{ question: string; answer: string }>;
    expect(whys).toHaveLength(5);
    expect(whys.every((item) => item.question.length > 5 && item.answer.length > 5)).toBe(true);
    expect(rcaCase?.root_cause ?? null).toBeNull();
  });
});
