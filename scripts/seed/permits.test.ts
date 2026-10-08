import { describe, expect, it } from "vitest";
import { buildCatalog, employeeId, permitTypeId } from "./catalog";
import { generateEmployeePermits, hasValidPermits, requiredPermitTypeIds } from "./permits";

const now = new Date("2026-10-08T07:30:00Z");
const catalog = buildCatalog(now);
const permits = generateEmployeePermits(20261016, now);
const today = now.toISOString().slice(0, 10);

describe("generateEmployeePermits", () => {
  it("is deterministic", () => {
    expect(generateEmployeePermits(20261016, now)).toEqual(permits);
  });

  it("produces valid date ranges and unique certificates per employee and type", () => {
    for (const permit of permits) {
      expect(permit.issued_on <= permit.expires_on).toBe(true);
    }
    const keys = permits.map(
      (permit) => `${permit.employee_id}:${permit.permit_type_id}:${permit.certificate_number}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("leaves exactly two workers with expired permits", () => {
    const expired = permits.filter((permit) => permit.expires_on < today);
    const holders = new Set(expired.map((permit) => permit.employee_id));
    expect(holders).toEqual(new Set([employeeId("2007"), employeeId("2013")]));
    expect(expired).toHaveLength(2);
  });

  it("keeps every other permit valid for at least the next week", () => {
    const weekAhead = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
    const others = permits.filter((permit) => permit.expires_on >= today);
    expect(others.every((permit) => permit.expires_on >= weekAhead)).toBe(true);
  });

  it("gives electricians group III and every worker group II", () => {
    const heldBy = (number: string) =>
      new Set(
        permits
          .filter((permit) => permit.employee_id === employeeId(number))
          .map((permit) => permit.permit_type_id),
      );
    expect(heldBy("2003").has(permitTypeId("electrical_iii"))).toBe(true);
    for (let number = 2001; number <= 2015; number += 1) {
      expect(heldBy(String(number)).has(permitTypeId("electrical_ii"))).toBe(true);
    }
  });
});

describe("requiredPermitTypeIds", () => {
  it("requires height work for conveyors and group IV for crusher electrical work", () => {
    expect(requiredPermitTypeIds(catalog, "conveyor", "mechanical")).toEqual([
      permitTypeId("work_at_height"),
    ]);
    const crusherElectrical = requiredPermitTypeIds(catalog, "crusher", "electrical");
    expect(crusherElectrical).toContain(permitTypeId("electrical_iii"));
    expect(crusherElectrical).toContain(permitTypeId("electrical_iv"));
  });

  it("requires nothing for unrestricted combinations", () => {
    expect(requiredPermitTypeIds(catalog, "pump", "mechanical")).toEqual([]);
  });
});

describe("hasValidPermits", () => {
  const heightPermit = [permitTypeId("work_at_height")];

  it("rejects a worker whose permit has expired at the given moment", () => {
    expect(hasValidPermits(permits, employeeId("2007"), heightPermit, now)).toBe(false);
    const beforeExpiry = new Date(now.getTime() - 60 * 86_400_000);
    expect(hasValidPermits(permits, employeeId("2007"), heightPermit, beforeExpiry)).toBe(true);
  });

  it("accepts anyone when nothing is required", () => {
    expect(hasValidPermits(permits, employeeId("2007"), [], now)).toBe(true);
  });

  it("rejects a worker who never held the permit", () => {
    expect(hasValidPermits(permits, employeeId("2010"), [permitTypeId("welding")], now)).toBe(
      false,
    );
  });
});
