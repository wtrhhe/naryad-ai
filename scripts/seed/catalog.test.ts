import { describe, expect, it } from "vitest";
import { buildCatalog, TEST_ACCOUNTS } from "./catalog";
import { crewOnShift, shiftPeriodAt } from "./time";

const now = new Date("2026-10-08T07:30:00Z");
const catalog = buildCatalog(now);

describe("sites and brigades", () => {
  it("defines the four plant sites", () => {
    expect(catalog.sites.map((site) => site.code).sort()).toEqual([
      "CRUSH",
      "ENRICH",
      "LOAD",
      "RMC",
    ]);
  });

  it("defines three brigades linked to sites", () => {
    expect(catalog.brigades).toHaveLength(3);
    const siteIds = new Set(catalog.sites.map((site) => site.id));
    for (const brigade of catalog.brigades) {
      expect(siteIds.has(brigade.site_id as string)).toBe(true);
    }
  });
});

describe("equipment", () => {
  it("contains 25 units with unique inventory numbers and qr tokens", () => {
    expect(catalog.equipment).toHaveLength(25);
    expect(new Set(catalog.equipment.map((unit) => unit.inventory_number)).size).toBe(25);
    expect(new Set(catalog.equipment.map((unit) => unit.qr_token)).size).toBe(25);
  });

  it("contains the named machines", () => {
    const names = catalog.equipment.map((unit) => unit.name);
    for (const name of [
      "Дробилка КМД-1750",
      "Насос Н-4",
      ...[1, 2, 3, 4, 5, 6].map((index) => `Конвейер К-${index}`),
    ]) {
      expect(names).toContain(name);
    }
    const typesPresent = new Set(catalog.equipment.map((unit) => unit.equipment_type));
    for (const type of ["crusher", "conveyor", "pump", "screen", "mill", "classifier", "feeder"]) {
      expect(typesPresent.has(type as never)).toBe(true);
    }
  });

  it("uses realistic downtime cost and criticality", () => {
    for (const unit of catalog.equipment) {
      expect(unit.downtime_cost_per_hour).toBeGreaterThanOrEqual(150_000);
      expect(unit.downtime_cost_per_hour).toBeLessThanOrEqual(1_500_000);
      expect([1, 2, 3]).toContain(unit.criticality);
    }
    const lockoutShare =
      catalog.equipment.filter((unit) => unit.requires_lockout).length / catalog.equipment.length;
    expect(lockoutShare).toBeGreaterThan(0.8);
  });

  it("gives K-3, Н-4 and КМД-1750 rpm and complete bearing geometry", () => {
    for (const name of ["Конвейер К-3", "Насос Н-4", "Дробилка КМД-1750"]) {
      const unit = catalog.equipment.find((candidate) => candidate.name === name);
      expect(unit?.rpm).toBeGreaterThan(0);
      expect(unit?.bearing_rolling_elements).toBeGreaterThan(2);
      expect(unit?.bearing_ball_diameter_mm).toBeGreaterThan(0);
      expect(unit?.bearing_pitch_diameter_mm).toBeGreaterThan(
        unit?.bearing_ball_diameter_mm as number,
      );
      expect(unit?.bearing_contact_angle_deg).toBeGreaterThanOrEqual(0);
    }
  });

  it("never sets partial bearing geometry", () => {
    for (const unit of catalog.equipment) {
      const present = [
        unit.bearing_rolling_elements,
        unit.bearing_ball_diameter_mm,
        unit.bearing_pitch_diameter_mm,
      ].map((value) => value !== null && value !== undefined);
      expect(new Set(present).size).toBe(1);
    }
  });
});

describe("fault codes", () => {
  it("contains 20 codes in Cyrillic letter-number format", () => {
    expect(catalog.faultCodes).toHaveLength(20);
    for (const fault of catalog.faultCodes) {
      expect(fault.code).toMatch(/^[МЭГПС]-[0-9]{2}$/);
      expect(fault.standard_hours).toBeGreaterThan(0);
    }
  });

  it("maps letters to categories", () => {
    const expected: Record<string, string> = {
      М: "mechanical",
      Э: "electrical",
      Г: "hydraulic",
      П: "pneumatic",
      С: "lubrication",
    };
    for (const fault of catalog.faultCodes) {
      expect(fault.category).toBe(expected[fault.code.charAt(0)]);
    }
  });

  it("defines М-02 as bearing wear", () => {
    const bearing = catalog.faultCodes.find((fault) => fault.code === "М-02");
    expect(bearing?.name).toBe("Износ/разрушение подшипника");
  });
});

describe("materials and norms", () => {
  it("contains 40 priced materials with categories", () => {
    expect(catalog.materials).toHaveLength(40);
    for (const material of catalog.materials) {
      expect(material.price).toBeGreaterThan(0);
      expect(material.unit.length).toBeGreaterThan(0);
      expect((material.categories ?? []).length).toBeGreaterThan(0);
    }
  });

  it("links every fault code to ordered material norms", () => {
    const faultIds = new Set(catalog.materialNorms.map((norm) => norm.fault_code_id));
    expect(faultIds.size).toBe(20);
    for (const norm of catalog.materialNorms) {
      expect(norm.qty_min).toBeLessThanOrEqual(norm.qty_typical);
      expect(norm.qty_typical).toBeLessThanOrEqual(norm.qty_max);
      expect(norm.qty_typical).toBeGreaterThan(0);
    }
    const pairs = catalog.materialNorms.map((norm) => `${norm.fault_code_id}:${norm.material_id}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("defines time norms for every fault code", () => {
    const covered = new Set(catalog.timeNorms.map((norm) => norm.fault_code_id).filter(Boolean));
    expect(covered.size).toBe(20);
    expect(
      catalog.timeNorms.some((norm) => norm.fault_code_id === null && norm.equipment_type !== null),
    ).toBe(true);
  });
});

describe("reasons and permits", () => {
  it("has reject and pause reasons including invalid excuses", () => {
    for (const kind of ["reject", "pause"]) {
      const reasons = catalog.reasonCodes.filter((reason) => reason.kind === kind);
      expect(reasons.length).toBeGreaterThan(3);
      expect(reasons.some((reason) => reason.is_valid_excuse === false)).toBe(true);
      expect(reasons.some((reason) => reason.is_valid_excuse !== false)).toBe(true);
    }
    for (const reason of catalog.reasonCodes) {
      expect(reason.code).toMatch(/^[a-z_]{2,40}$/);
    }
  });

  it("defines permit types and equipment requirements", () => {
    const codes = catalog.permitTypes.map((permit) => permit.code);
    for (const code of [
      "electrical_ii",
      "electrical_iii",
      "electrical_iv",
      "electrical_v",
      "work_at_height",
      "welding",
      "lifting_gear",
      "gas_hazardous",
    ]) {
      expect(codes).toContain(code);
    }
    expect(catalog.permitRequirements.length).toBeGreaterThan(3);
    for (const requirement of catalog.permitRequirements) {
      expect(requirement.equipment_type !== null || requirement.fault_category !== null).toBe(true);
    }
  });
});

describe("employees", () => {
  it("has 2 masters, 1 manager, 1 admin and 15 workers", () => {
    const count = (role: string) =>
      catalog.employees.filter((employee) => employee.role === role).length;
    expect([count("master"), count("manager"), count("admin"), count("worker")]).toEqual([
      2, 1, 1, 15,
    ]);
  });

  it("splits workers over 3 brigades, 4 crews and every specialty", () => {
    const workers = catalog.employees.filter((employee) => employee.role === "worker");
    expect(new Set(workers.map((worker) => worker.brigade_id)).size).toBe(3);
    expect([...new Set(workers.map((worker) => worker.crew))].sort()).toEqual(["A", "B", "C", "D"]);
    expect([...new Set(workers.map((worker) => worker.specialty))].sort()).toEqual([
      "electrician",
      "fitter",
      "hydraulic",
      "instrumentation",
      "lubricator",
      "welder",
    ]);
    for (const worker of workers) {
      expect(worker.grade).toBeGreaterThanOrEqual(1);
      expect(worker.grade).toBeLessThanOrEqual(8);
    }
  });

  it("has unique personnel numbers", () => {
    const numbers = catalog.employees.map((employee) => employee.personnel_number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("assigns sites to both masters", () => {
    const masters = catalog.employees.filter((employee) => employee.role === "master");
    for (const master of masters) {
      expect(
        catalog.employeeSites.filter((link) => link.employee_id === master.id).length,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("marks only the crew currently on shift as on shift", () => {
    const onShiftCrew = crewOnShift(now);
    for (const worker of catalog.employees.filter((employee) => employee.role === "worker")) {
      expect(worker.on_shift).toBe(worker.crew === onShiftCrew);
    }
    expect(shiftPeriodAt(now)).toBe("day");
    expect(
      catalog.employees.find((employee) => employee.personnel_number === "1001")?.on_shift,
    ).toBe(true);
    expect(
      catalog.employees.find((employee) => employee.personnel_number === "9001")?.on_shift,
    ).toBe(false);
  });

  it("is deterministic", () => {
    expect(buildCatalog(now)).toEqual(buildCatalog(now));
  });
});

describe("TEST_ACCOUNTS", () => {
  it("lists the fixed accounts", () => {
    const byNumber = Object.fromEntries(
      TEST_ACCOUNTS.map((account) => [account.personnelNumber, account]),
    );
    expect(byNumber["1001"]).toMatchObject({ pin: "1111", role: "master" });
    expect(byNumber["1002"]).toMatchObject({ pin: "2222", role: "master" });
    expect(byNumber["3001"]).toMatchObject({ pin: "3333", role: "manager" });
    expect(byNumber["9001"]).toMatchObject({ pin: "9999", role: "admin" });
    for (let number = 2001; number <= 2015; number += 1) {
      expect(byNumber[String(number)]).toMatchObject({ pin: "1234", role: "worker" });
    }
    expect(TEST_ACCOUNTS).toHaveLength(19);
  });

  it("matches the catalog employees", () => {
    const numbers = catalog.employees.map((employee) => employee.personnel_number).sort();
    expect(TEST_ACCOUNTS.map((account) => account.personnelNumber).sort()).toEqual(numbers);
  });
});
