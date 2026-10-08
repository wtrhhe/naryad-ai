import type { EquipmentType, FaultCategory } from "./types";

export type PermitTypeSpec = {
  readonly code: string;
  readonly name: string;
  readonly validityMonths: number;
};

export type PermitRequirementSpec = {
  readonly permitCode: string;
  readonly equipmentType: EquipmentType | null;
  readonly faultCategory: FaultCategory | null;
};

export const PERMIT_TYPE_SPECS: readonly PermitTypeSpec[] = [
  { code: "electrical_ii", name: "Электробезопасность, II группа", validityMonths: 12 },
  { code: "electrical_iii", name: "Электробезопасность, III группа", validityMonths: 12 },
  { code: "electrical_iv", name: "Электробезопасность, IV группа", validityMonths: 12 },
  { code: "electrical_v", name: "Электробезопасность, V группа", validityMonths: 12 },
  { code: "work_at_height", name: "Работы на высоте", validityMonths: 36 },
  { code: "welding", name: "Сварочные работы", validityMonths: 24 },
  { code: "lifting_gear", name: "Работа с грузоподъёмными механизмами (ГПМ)", validityMonths: 12 },
  { code: "gas_hazardous", name: "Газоопасные работы", validityMonths: 12 },
];

export const PERMIT_REQUIREMENT_SPECS: readonly PermitRequirementSpec[] = [
  { permitCode: "electrical_iii", equipmentType: null, faultCategory: "electrical" },
  { permitCode: "electrical_iv", equipmentType: "crusher", faultCategory: "electrical" },
  { permitCode: "work_at_height", equipmentType: "conveyor", faultCategory: null },
  { permitCode: "work_at_height", equipmentType: "screen", faultCategory: null },
  { permitCode: "lifting_gear", equipmentType: "crusher", faultCategory: null },
  { permitCode: "lifting_gear", equipmentType: "mill", faultCategory: null },
  { permitCode: "lifting_gear", equipmentType: "other", faultCategory: null },
  { permitCode: "gas_hazardous", equipmentType: "classifier", faultCategory: null },
];

export type ReasonSpec = {
  readonly kind: "reject" | "pause";
  readonly code: string;
  readonly label: string;
  readonly isValidExcuse: boolean;
};

export const REASON_SPECS: readonly ReasonSpec[] = [
  {
    kind: "reject",
    code: "no_materials",
    label: "Нет материалов или запчастей",
    isValidExcuse: true,
  },
  {
    kind: "reject",
    code: "no_permit",
    label: "Нет допуска или допуск просрочен",
    isValidExcuse: true,
  },
  {
    kind: "reject",
    code: "no_lockout",
    label: "Оборудование не остановлено и не обесточено",
    isValidExcuse: true,
  },
  {
    kind: "reject",
    code: "wrong_specialty",
    label: "Работа не по специальности",
    isValidExcuse: true,
  },
  {
    kind: "reject",
    code: "busy_other_order",
    label: "Занят на другом наряде",
    isValidExcuse: true,
  },
  { kind: "reject", code: "unwell", label: "Плохое самочувствие", isValidExcuse: true },
  { kind: "reject", code: "end_of_shift", label: "Скоро конец смены", isValidExcuse: false },
  {
    kind: "reject",
    code: "no_reason",
    label: "Без причины, личные обстоятельства",
    isValidExcuse: false,
  },
  { kind: "pause", code: "waiting_parts", label: "Ожидание запчастей", isValidExcuse: true },
  {
    kind: "pause",
    code: "waiting_shutdown",
    label: "Ожидание остановки оборудования технологами",
    isValidExcuse: true,
  },
  { kind: "pause", code: "waiting_crane", label: "Ожидание крана или ГПМ", isValidExcuse: true },
  {
    kind: "pause",
    code: "safety_stop",
    label: "Остановка по требованию техники безопасности",
    isValidExcuse: true,
  },
  {
    kind: "pause",
    code: "urgent_call",
    label: "Срочный вызов на другой наряд",
    isValidExcuse: true,
  },
  { kind: "pause", code: "meal_break", label: "Перерыв на приём пищи", isValidExcuse: true },
  { kind: "pause", code: "personal", label: "Личные обстоятельства", isValidExcuse: false },
  { kind: "pause", code: "no_reason_pause", label: "Без причины", isValidExcuse: false },
];
