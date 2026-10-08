import type { Json } from "../../lib/supabase/database.types";

export type ReviewCheck = {
  readonly key:
    | "before_photos"
    | "after_photos"
    | "ghost"
    | "work_description"
    | "materials"
    | "time"
    | "lockout";
  readonly label: string;
  readonly passed: boolean;
  readonly detail: string;
};

export type ReviewVerdictKind = "accepted" | "accepted_with_remarks" | "rework";

export const CHECK_LABELS: Readonly<Record<ReviewCheck["key"], string>> = {
  before_photos: "Фото «до» приложены",
  after_photos: "Фото «после» приложены",
  ghost: "Фото «после» отличается от фото «до»",
  work_description: "Описание работ соответствует неисправности",
  materials: "Списание материалов в пределах нормы",
  time: "Время выполнения в пределах норматива",
  lockout: "Блокировка оборудования подтверждена",
};

const STRENGTHS: Readonly<Record<ReviewCheck["key"], string>> = {
  before_photos: "Состояние до ремонта задокументировано",
  after_photos: "Результат работы подтверждён фотографиями",
  ghost: "Фото «после» снято после выполнения работ",
  work_description: "Описание работ подробное и по делу",
  materials: "Материалы списаны в пределах нормы",
  time: "Работа выполнена в нормативное время",
  lockout: "Блокировка оборудования оформлена корректно",
};

const IMPROVEMENTS: Readonly<Record<ReviewCheck["key"], string>> = {
  before_photos: "Приложите фото состояния оборудования до начала работ",
  after_photos: "Приложите фото результата после ремонта",
  ghost: "Фото «после» почти не отличается от фото «до», сделайте новый снимок",
  work_description: "Уточните описание выполненных работ",
  materials: "Расход материалов превышает норму, поясните причину перерасхода",
  time: "Время выполнения заметно превышает норматив",
  lockout: "Подтвердите блокировку оборудования фотографией бирки",
};

export const strengthsOf = (checks: readonly ReviewCheck[]): string[] =>
  checks
    .filter((check) => check.passed)
    .map((check) => STRENGTHS[check.key])
    .slice(0, 3);
export const improvementsOf = (checks: readonly ReviewCheck[]): string[] =>
  checks.filter((check) => !check.passed).map((check) => IMPROVEMENTS[check.key]);

const VERDICT_PHRASES: Readonly<Record<ReviewVerdictKind, string>> = {
  accepted: "Наряд принят без замечаний",
  accepted_with_remarks: "Наряд принят с замечаниями",
  rework: "Наряд возвращён на доработку",
};

export function workerExplanation(
  verdict: ReviewVerdictKind,
  score: number,
  improvements: readonly string[],
): string {
  const remarks =
    improvements.length > 0 ? ` Что исправить: ${improvements.join("; ")}.` : " Так держать.";
  return `${VERDICT_PHRASES[verdict]}. Оценка: ${score} из 100.${remarks}`;
}

export function masterExplanation(input: {
  readonly verdict: ReviewVerdictKind;
  readonly score: number;
  readonly checks: readonly ReviewCheck[];
  readonly materialRatio: number | null;
  readonly workHours: number;
  readonly standardHours: number;
}): string {
  const failed = input.checks
    .filter((check) => !check.passed)
    .map((check) => check.label.toLowerCase());
  const materials =
    input.materialRatio === null
      ? "списание материалов не требовалось"
      : `расход материалов ${Math.round(input.materialRatio * 100)}% от нормы`;
  const time = `время работы ${input.workHours.toFixed(1)} ч при нормативе ${input.standardHours.toFixed(1)} ч`;
  const issues =
    failed.length > 0 ? `Не пройдены проверки: ${failed.join(", ")}.` : "Все проверки пройдены.";
  return `Итог проверки: ${VERDICT_PHRASES[input.verdict].toLowerCase()}, оценка ${input.score}. ${issues} Для справки: ${materials}, ${time}.`;
}

export const MASTER_OVERRIDE_COMMENTS: readonly string[] = [
  "Замечания несущественные, работа выполнена качественно",
  "Лично проверил оборудование после ремонта, замечаний нет",
  "Перерасход обоснован состоянием узла, принимаю",
];

export const MASTER_AGREE_COMMENTS: readonly string[] = [
  "Согласен с оценкой",
  "Проверено, принято",
  "Замечания учтены",
];

export const checksAsJson = (checks: readonly ReviewCheck[]): NonNullable<Json> =>
  checks.map((check) => ({ ...check }));
