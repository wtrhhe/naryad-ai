import type { Enums, TablesInsert } from "../../lib/supabase/database.types";

export type WithId<Row> = Row & { id: string };

export type EquipmentType = Enums<"equipment_type">;
export type FaultCategory = Enums<"fault_category">;
export type Specialty = Enums<"specialty">;
export type AppRole = Enums<"app_role">;
export type ShiftCrew = Enums<"shift_crew">;
export type ShiftPeriod = Enums<"shift_period">;
export type WorkOrderStatus = Enums<"work_order_status">;
export type WorkOrderAction = Enums<"work_order_action">;
export type WorkOrderPriority = Enums<"work_order_priority">;
export type WorkOrderKind = Enums<"work_order_type">;

export type SiteRow = WithId<TablesInsert<"sites">>;
export type BrigadeRow = WithId<TablesInsert<"brigades">>;
export type EmployeeRow = WithId<TablesInsert<"employees">>;
export type EmployeeSiteRow = TablesInsert<"employee_sites">;
export type EquipmentRow = WithId<TablesInsert<"equipment">>;
export type FaultCodeRow = WithId<TablesInsert<"fault_codes">>;
export type MaterialRow = WithId<TablesInsert<"materials">>;
export type MaterialNormRow = WithId<TablesInsert<"material_norms">>;
export type TimeNormRow = WithId<TablesInsert<"time_norms">>;
export type ReasonCodeRow = WithId<TablesInsert<"reason_codes">>;
export type PermitTypeRow = WithId<TablesInsert<"permit_types">>;
export type EmployeePermitRow = WithId<TablesInsert<"employee_permits">>;
export type EquipmentPermitRequirementRow = WithId<TablesInsert<"equipment_permit_requirements">>;

export type WorkOrderRow = WithId<TablesInsert<"work_orders">>;
export type WorkOrderEventRow = WithId<TablesInsert<"work_order_events">>;
export type PhotoRow = WithId<TablesInsert<"photos">>;
export type AcousticSampleRow = WithId<TablesInsert<"acoustic_samples">>;
export type MaterialWriteoffRow = WithId<TablesInsert<"material_writeoffs">>;
export type AiReviewRow = WithId<TablesInsert<"ai_reviews">>;
export type LockoutRow = WithId<TablesInsert<"lockouts">>;
export type RcaCaseRow = WithId<TablesInsert<"rca_cases">>;

export const SITE_CODES = ["CRUSH", "ENRICH", "RMC", "LOAD"] as const;
export type SiteCode = (typeof SITE_CODES)[number];
