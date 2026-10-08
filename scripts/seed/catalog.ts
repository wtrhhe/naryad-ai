import { BRIGADE_SPECS, NIGHT_DUTY_MASTER, PEOPLE } from "./data-people";
import { EQUIPMENT_SPECS, EQUIPMENT_TYPE_LABELS, SITE_SPECS } from "./data-equipment";
import { FAULT_SPECS } from "./data-faults";
import { HOURS_FACTOR_BY_TYPE, PLANNED_REPAIR_HOURS_BY_TYPE } from "./data-fault-weights";
import { MATERIAL_SPECS } from "./data-materials";
import { NORM_SPECS } from "./data-norms";
import { PERMIT_REQUIREMENT_SPECS, PERMIT_TYPE_SPECS, REASON_SPECS } from "./data-permits";
import { stableUuid } from "./ids";
import { standardHoursFor } from "./norms";
import { crewOnShift, shiftPeriodAt } from "./time";
import type {
  AppRole,
  BrigadeRow,
  EmployeeRow,
  EmployeeSiteRow,
  EquipmentPermitRequirementRow,
  EquipmentRow,
  EquipmentType,
  FaultCodeRow,
  MaterialNormRow,
  MaterialRow,
  PermitTypeRow,
  ReasonCodeRow,
  SiteCode,
  SiteRow,
  TimeNormRow,
} from "./types";

export type TestAccount = {
  readonly personnelNumber: string;
  readonly pin: string;
  readonly role: AppRole;
  readonly fullName: string;
};

export const TEST_ACCOUNTS: readonly TestAccount[] = PEOPLE.map((person) => ({
  personnelNumber: person.personnelNumber,
  pin: person.pin,
  role: person.role,
  fullName: person.fullName,
}));

export type Catalog = {
  readonly sites: readonly SiteRow[];
  readonly brigades: readonly BrigadeRow[];
  readonly employees: readonly EmployeeRow[];
  readonly employeeSites: readonly EmployeeSiteRow[];
  readonly equipment: readonly EquipmentRow[];
  readonly faultCodes: readonly FaultCodeRow[];
  readonly materials: readonly MaterialRow[];
  readonly materialNorms: readonly MaterialNormRow[];
  readonly timeNorms: readonly TimeNormRow[];
  readonly reasonCodes: readonly ReasonCodeRow[];
  readonly permitTypes: readonly PermitTypeRow[];
  readonly permitRequirements: readonly EquipmentPermitRequirementRow[];
};

export const siteId = (code: SiteCode): string => stableUuid(`site:${code}`);
export const employeeId = (personnelNumber: string): string =>
  stableUuid(`employee:${personnelNumber}`);
export const equipmentId = (inventoryNumber: string): string =>
  stableUuid(`equipment:${inventoryNumber}`);
export const faultCodeId = (code: string): string => stableUuid(`fault:${code}`);
export const materialId = (code: string): string => stableUuid(`material:${code}`);
export const permitTypeId = (code: string): string => stableUuid(`permit-type:${code}`);
export const reasonCodeId = (kind: string, code: string): string =>
  stableUuid(`reason:${kind}:${code}`);
const brigadeId = (key: string): string => stableUuid(`brigade:${key}`);

function isOnShift(person: (typeof PEOPLE)[number], now: Date): boolean {
  const period = shiftPeriodAt(now);
  if (person.role === "worker") return person.crew === crewOnShift(now);
  if (person.role === "master")
    return period === "day" || person.personnelNumber === NIGHT_DUTY_MASTER;
  if (person.role === "manager") return period === "day";
  return false;
}

function buildEmployees(now: Date): EmployeeRow[] {
  return PEOPLE.map((person) => ({
    id: employeeId(person.personnelNumber),
    personnel_number: person.personnelNumber,
    full_name: person.fullName,
    role: person.role,
    specialty: person.specialty ?? null,
    grade: person.grade ?? null,
    brigade_id: person.brigade ? brigadeId(person.brigade) : null,
    crew: person.crew ?? null,
    on_shift: isOnShift(person, now),
    locale: "ru",
    is_active: true,
  }));
}

function buildEmployeeSites(): EmployeeSiteRow[] {
  return PEOPLE.flatMap((person) =>
    (person.siteCodes ?? []).map((code) => ({
      employee_id: employeeId(person.personnelNumber),
      site_id: siteId(code),
    })),
  );
}

function buildEquipment(): EquipmentRow[] {
  return EQUIPMENT_SPECS.map((spec) => ({
    id: equipmentId(spec.inventoryNumber),
    site_id: siteId(spec.siteCode),
    name: spec.name,
    inventory_number: spec.inventoryNumber,
    equipment_type: spec.type,
    criticality: spec.criticality,
    downtime_cost_per_hour: spec.downtimeCostPerHour,
    requires_lockout: spec.requiresLockout,
    qr_token: stableUuid(`qr:${spec.inventoryNumber}`),
    rpm: spec.rpm ?? null,
    bearing_rolling_elements: spec.bearing?.rollingElements ?? null,
    bearing_ball_diameter_mm: spec.bearing?.ballDiameterMm ?? null,
    bearing_pitch_diameter_mm: spec.bearing?.pitchDiameterMm ?? null,
    bearing_contact_angle_deg: spec.bearing?.contactAngleDeg ?? null,
    is_active: true,
  }));
}

function buildFaultCodes(): FaultCodeRow[] {
  return FAULT_SPECS.map((spec) => ({
    id: faultCodeId(spec.code),
    code: spec.code,
    category: spec.category,
    name: spec.name,
    description: spec.description,
    standard_hours: spec.standardHours,
    required_specialty: spec.specialty,
    is_active: true,
  }));
}

function buildMaterialNorms(): MaterialNormRow[] {
  return Object.entries(NORM_SPECS).flatMap(([code, norms]) =>
    norms.map(([materialCode, min, typical, max]) => ({
      id: stableUuid(`norm:${code}:${materialCode}`),
      fault_code_id: faultCodeId(code),
      material_id: materialId(materialCode),
      qty_min: min,
      qty_typical: typical,
      qty_max: max,
    })),
  );
}

const TYPES_WITH_OWN_NORMS = Object.keys(HOURS_FACTOR_BY_TYPE) as EquipmentType[];

function buildTimeNorms(): TimeNormRow[] {
  const baseNorms = FAULT_SPECS.map((spec) => ({
    id: stableUuid(`time-norm:${spec.code}`),
    name: spec.name,
    equipment_type: null,
    fault_code_id: faultCodeId(spec.code),
    hours: spec.standardHours,
  }));
  const typeNorms = FAULT_SPECS.flatMap((spec) =>
    TYPES_WITH_OWN_NORMS.map((type) => ({
      id: stableUuid(`time-norm:${spec.code}:${type}`),
      name: `${spec.name} (${EQUIPMENT_TYPE_LABELS[type]})`,
      equipment_type: type,
      fault_code_id: faultCodeId(spec.code),
      hours: standardHoursFor(spec.standardHours, type),
    })),
  );
  const plannedNorms = (Object.keys(PLANNED_REPAIR_HOURS_BY_TYPE) as EquipmentType[]).map(
    (type) => ({
      id: stableUuid(`time-norm:ppr:${type}`),
      name: `ППР: ${EQUIPMENT_TYPE_LABELS[type]}`,
      equipment_type: type,
      fault_code_id: null,
      hours: PLANNED_REPAIR_HOURS_BY_TYPE[type],
    }),
  );
  return [...baseNorms, ...typeNorms, ...plannedNorms];
}

export function buildCatalog(now: Date): Catalog {
  return {
    sites: SITE_SPECS.map((spec) => ({
      id: siteId(spec.code),
      code: spec.code,
      name: spec.name,
      is_active: true,
    })),
    brigades: BRIGADE_SPECS.map((spec) => ({
      id: brigadeId(spec.key),
      name: spec.name,
      site_id: siteId(spec.siteCode),
      is_active: true,
    })),
    employees: buildEmployees(now),
    employeeSites: buildEmployeeSites(),
    equipment: buildEquipment(),
    faultCodes: buildFaultCodes(),
    materials: MATERIAL_SPECS.map((spec) => ({
      id: materialId(spec.code),
      code: spec.code,
      name: spec.name,
      unit: spec.unit,
      price: spec.price,
      categories: [...spec.categories],
      is_active: true,
    })),
    materialNorms: buildMaterialNorms(),
    timeNorms: buildTimeNorms(),
    reasonCodes: REASON_SPECS.map((spec, index) => ({
      id: reasonCodeId(spec.kind, spec.code),
      kind: spec.kind,
      code: spec.code,
      label: spec.label,
      is_valid_excuse: spec.isValidExcuse,
      sort_order: index,
      is_active: true,
    })),
    permitTypes: PERMIT_TYPE_SPECS.map((spec) => ({
      id: permitTypeId(spec.code),
      code: spec.code,
      name: spec.name,
      validity_months: spec.validityMonths,
    })),
    permitRequirements: PERMIT_REQUIREMENT_SPECS.map((spec) => ({
      id: stableUuid(
        `permit-requirement:${spec.permitCode}:${spec.equipmentType}:${spec.faultCategory}`,
      ),
      permit_type_id: permitTypeId(spec.permitCode),
      equipment_type: spec.equipmentType,
      fault_category: spec.faultCategory,
    })),
  };
}
