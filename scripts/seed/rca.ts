import type { OrderBundle } from "./assemble";
import type { SeedContext } from "./context";
import { GLAND_LEAK_CODE, isPumpN4 } from "./slots-unplanned";
import { MS_PER_MINUTE } from "./time";
import type { RcaCaseRow } from "./types";

const OWNER_PERSONNEL_NUMBER = "1002";
const OPENED_AFTER_CLOSE_MINUTES = 10;

const FIVE_WHYS: ReadonlyArray<{ readonly question: string; readonly answer: string }> = [
  {
    question: "Почему повторно течёт сальник насоса Н-4?",
    answer:
      "Сальниковая набивка быстро теряет уплотняющую способность и изнашивается за 5–9 суток.",
  },
  {
    question: "Почему набивка изнашивается так быстро?",
    answer:
      "На защитной втулке вала в зоне сальника есть риски и биение, набивка работает на истирание.",
  },
  {
    question: "Почему защитная втулка изношена?",
    answer:
      "В сальниковую камеру попадают абразивные частицы пульпы, промывка уплотнения недостаточна.",
  },
  {
    question: "Почему промывка уплотнения недостаточна?",
    answer: "Давление в линии уплотнительной воды ниже номинального, фильтр линии засорён.",
  },
  {
    question: "Почему фильтр линии уплотнительной воды засорён?",
    answer:
      "Очистка фильтра не включена в график ППР насоса, регламента обслуживания нет (гипотеза, требует проверки осмотром).",
  },
];

export function buildGlandLeakCase(
  context: SeedContext,
  bundles: readonly OrderBundle[],
): RcaCaseRow[] {
  const leaks = bundles
    .filter(
      (bundle) =>
        isPumpN4(bundle.facts.equipment) &&
        bundle.slot.faultCode === GLAND_LEAK_CODE &&
        bundle.slot.tag === "gland-leak",
    )
    .sort((a, b) => a.slot.issuedAtMs - b.slot.issuedAtMs);
  const last = leaks.at(-1);
  const fault = context.index.faultByCode.get(GLAND_LEAK_CODE);
  const owner = context.index.employeeByNumber.get(OWNER_PERSONNEL_NUMBER);
  if (!last || !fault || !owner) return [];
  const lastClosedMs =
    last.facts.steps.find((step) => step.action === "approve")?.atMs ?? last.slot.issuedAtMs;
  const openedAt = new Date(
    lastClosedMs + OPENED_AFTER_CLOSE_MINUTES * MS_PER_MINUTE,
  ).toISOString();
  return [
    {
      id: context.rng.fork("rca:gland-leak").uuid(),
      equipment_id: last.facts.equipment.id,
      fault_code_id: fault.id,
      related_order_ids: leaks.map((leak) => leak.order.id),
      five_whys: FIVE_WHYS.map((item, position) => ({
        why: position + 1,
        question: item.question,
        answer: item.answer,
      })),
      root_cause: null,
      recommendation: null,
      status: "open",
      owner_id: owner.id,
      opened_at: openedAt,
      closed_at: null,
      created_at: openedAt,
      updated_at: openedAt,
    },
  ];
}
