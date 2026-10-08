import type { Catalog } from "./catalog";
import { employeeId, permitTypeId } from "./catalog";
import { PERMIT_TYPE_SPECS } from "./data-permits";
import { EXPIRED_HEIGHT_PERMIT_WORKER, EXPIRED_LIFTING_PERMIT_WORKER, PEOPLE } from "./data-people";
import { stableUuid } from "./ids";
import { createRng } from "./random";
import { MS_PER_DAY } from "./time";
import type { EmployeePermitRow, EquipmentType, FaultCategory } from "./types";

type PersonSpec = (typeof PEOPLE)[number];

const MIN_VALID_DAYS_AHEAD = 20;
const DAYS_PER_MONTH = 30;
const ISSUED_AT_LEAST_DAYS_AGO = 130;
const HEIGHT_PERMIT_EXPIRED_DAYS_AGO = 22;
const LIFTING_PERMIT_EXPIRED_DAYS_AGO = 35;
const ISO_DATE_LENGTH = 10;

const toIsoDate = (at: Date): string => at.toISOString().slice(0, ISO_DATE_LENGTH);

function subtractMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - months);
  return toIsoDate(date);
}

function permitCodesFor(person: PersonSpec): string[] {
  if (person.role === "master") {
    return [
      "electrical_ii",
      "electrical_iii",
      "electrical_iv",
      ...(person.personnelNumber === "1002" ? ["electrical_v"] : []),
    ];
  }
  if (person.role !== "worker") return [];
  const grade = person.grade ?? 1;
  const codes = ["electrical_ii", "work_at_height", "lifting_gear", "gas_hazardous"];
  const electrical = person.specialty === "electrician" || person.specialty === "instrumentation";
  if (electrical) codes.push("electrical_iii");
  if (electrical && grade >= 5) codes.push("electrical_iv");
  if (person.specialty === "welder") codes.push("welding");
  return codes;
}

function expiryDaysFromNow(person: PersonSpec, permitCode: string, randomDays: number): number {
  if (person.personnelNumber === EXPIRED_HEIGHT_PERMIT_WORKER && permitCode === "work_at_height") {
    return -HEIGHT_PERMIT_EXPIRED_DAYS_AGO;
  }
  if (person.personnelNumber === EXPIRED_LIFTING_PERMIT_WORKER && permitCode === "lifting_gear") {
    return -LIFTING_PERMIT_EXPIRED_DAYS_AGO;
  }
  return randomDays;
}

export function generateEmployeePermits(seed: number, now: Date): EmployeePermitRow[] {
  const rng = createRng(seed).fork("permits");
  const validityByCode = new Map(PERMIT_TYPE_SPECS.map((spec) => [spec.code, spec.validityMonths]));
  return PEOPLE.flatMap((person) =>
    permitCodesFor(person).map((permitCode) => {
      const validityMonths = validityByCode.get(permitCode) ?? 12;
      const expiresOn = toIsoDate(
        new Date(
          now.getTime() +
            expiryDaysFromNow(
              person,
              permitCode,
              rng.int(
                MIN_VALID_DAYS_AHEAD,
                validityMonths * DAYS_PER_MONTH - ISSUED_AT_LEAST_DAYS_AGO,
              ),
            ) *
              MS_PER_DAY,
        ),
      );
      const issuedOn = subtractMonths(expiresOn, validityMonths);
      return {
        id: stableUuid(`employee-permit:${person.personnelNumber}:${permitCode}`),
        employee_id: employeeId(person.personnelNumber),
        permit_type_id: permitTypeId(permitCode),
        certificate_number: `${permitCode.toUpperCase().replace(/_/g, "-")}-${issuedOn.slice(0, 4)}-${person.personnelNumber}`,
        issued_on: issuedOn,
        expires_on: expiresOn,
      };
    }),
  );
}

export function requiredPermitTypeIds(
  catalog: Catalog,
  equipmentType: EquipmentType,
  faultCategory: FaultCategory,
): string[] {
  const matching = catalog.permitRequirements.filter(
    (requirement) =>
      (requirement.equipment_type === null || requirement.equipment_type === equipmentType) &&
      (requirement.fault_category === null || requirement.fault_category === faultCategory),
  );
  return [...new Set(matching.map((requirement) => requirement.permit_type_id))];
}

export function hasValidPermits(
  permits: readonly EmployeePermitRow[],
  employee: string,
  requiredTypeIds: readonly string[],
  at: Date,
): boolean {
  const day = toIsoDate(at);
  return requiredTypeIds.every((typeId) =>
    permits.some(
      (permit) =>
        permit.employee_id === employee &&
        permit.permit_type_id === typeId &&
        permit.issued_on <= day &&
        permit.expires_on >= day,
    ),
  );
}
