import type { Catalog } from "./catalog";
import type {
  EmployeeRow,
  EquipmentRow,
  FaultCodeRow,
  MaterialNormRow,
  MaterialRow,
  PermitTypeRow,
  ReasonCodeRow,
  SiteCode,
} from "./types";

export type CatalogIndex = {
  readonly equipmentById: ReadonlyMap<string, EquipmentRow>;
  readonly equipmentByName: ReadonlyMap<string, EquipmentRow>;
  readonly equipmentByInventory: ReadonlyMap<string, EquipmentRow>;
  readonly employeeById: ReadonlyMap<string, EmployeeRow>;
  readonly employeeByNumber: ReadonlyMap<string, EmployeeRow>;
  readonly siteCodeById: ReadonlyMap<string, SiteCode>;
  readonly siteIdByCode: ReadonlyMap<SiteCode, string>;
  readonly faultById: ReadonlyMap<string, FaultCodeRow>;
  readonly faultByCode: ReadonlyMap<string, FaultCodeRow>;
  readonly materialById: ReadonlyMap<string, MaterialRow>;
  readonly normsByFaultId: ReadonlyMap<string, readonly MaterialNormRow[]>;
  readonly permitTypeByCode: ReadonlyMap<string, PermitTypeRow>;
  readonly reasonsByKind: ReadonlyMap<string, readonly ReasonCodeRow[]>;
  readonly workers: readonly EmployeeRow[];
};

function indexBy<Row, Key>(rows: readonly Row[], keyOf: (row: Row) => Key): Map<Key, Row> {
  return new Map(rows.map((row) => [keyOf(row), row]));
}

export function indexCatalog(catalog: Catalog): CatalogIndex {
  return {
    equipmentById: indexBy(catalog.equipment, (row) => row.id),
    equipmentByName: indexBy(catalog.equipment, (row) => row.name),
    equipmentByInventory: indexBy(catalog.equipment, (row) => row.inventory_number),
    employeeById: indexBy(catalog.employees, (row) => row.id),
    employeeByNumber: indexBy(catalog.employees, (row) => row.personnel_number),
    siteCodeById: new Map(catalog.sites.map((site) => [site.id, site.code as SiteCode])),
    siteIdByCode: new Map(catalog.sites.map((site) => [site.code as SiteCode, site.id])),
    faultById: indexBy(catalog.faultCodes, (row) => row.id),
    faultByCode: indexBy(catalog.faultCodes, (row) => row.code),
    materialById: indexBy(catalog.materials, (row) => row.id),
    normsByFaultId: Map.groupBy(catalog.materialNorms, (norm) => norm.fault_code_id),
    permitTypeByCode: indexBy(catalog.permitTypes, (row) => row.code),
    reasonsByKind: Map.groupBy(catalog.reasonCodes, (reason) => reason.kind),
    workers: catalog.employees.filter((employee) => employee.role === "worker"),
  };
}
