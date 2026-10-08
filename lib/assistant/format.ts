import { createTranslator } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatTenge } from "@/lib/safety/downtime";
import { formatDurationWith, formatHours, shortDate } from "@/lib/assistant/units";
import type {
  AssistantCard,
  DraftCard,
  EquipmentHistoryCard,
  LookupCard,
  OverdueCard,
  ShiftReportCard,
  SiteProblemsCard,
  WorkersCard,
} from "@/lib/assistant/types";
import ruAssistant from "@/messages/ru/assistant.json";
import kkAssistant from "@/messages/kk/assistant.json";
import ruWorkOrder from "@/messages/ru/workOrder.json";
import kkWorkOrder from "@/messages/kk/workOrder.json";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const MESSAGES = {
  ru: { assistant: ruAssistant, workOrder: ruWorkOrder },
  kk: { assistant: kkAssistant, workOrder: kkWorkOrder },
} as const;

const NAME_LIMIT = 5;

function translator(locale: Locale, namespace: string): Translate {
  const translate = createTranslator({
    locale,
    messages: MESSAGES[locale] as never,
    namespace: namespace as never,
  });
  return translate as unknown as Translate;
}

function answers(locale: Locale): Translate {
  return translator(locale, "assistant.answers");
}

export function formatLate(totalMinutes: number, locale: Locale): string {
  return formatDurationWith(translator(locale, "assistant.units"), totalMinutes);
}

function joinNames(t: Translate, names: readonly string[], total: number): string {
  const shown = names.slice(0, NAME_LIMIT).join(", ");
  const rest = total - Math.min(names.length, NAME_LIMIT);
  return rest > 0 ? `${shown}${t("andMore", { count: rest })}` : shown;
}

function scopeText(t: Translate, items: ReadonlyArray<string | null>): string {
  const present = items.filter((item): item is string => Boolean(item));
  return present.length === 0 ? "" : t("scope", { items: present.join(", ") });
}

function sentences(parts: ReadonlyArray<string | null | undefined | false>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}

function formatWorkers(card: WorkersCard, t: Translate): string {
  const scope = scopeText(t, [
    card.specialty ? t(`specialties.${card.specialty}`) : null,
    card.site,
  ]);
  if (card.onShiftCount === 0) {
    return t("workers.nobody", { scope });
  }
  const free = card.workers.filter((worker) => worker.status === "free");
  if (free.length > 0) {
    return t("workers.free", {
      count: card.freeCount,
      scope,
      names: joinNames(
        t,
        free.map((worker) => worker.name),
        card.freeCount,
      ),
    });
  }
  const nearest = card.workers
    .filter((worker) => worker.status === "queue" || worker.status === "busy")
    .slice(0, 3)
    .map((worker) =>
      worker.status === "busy"
        ? t("workers.busy", { name: worker.name, number: worker.activeOrderNumber ?? 0 })
        : t("workers.queue", { name: worker.name, count: worker.queueLength }),
    );
  return sentences([
    t("workers.none", { scope }),
    nearest.length > 0 && t("workers.nearest", { names: nearest.join(", ") }),
  ]);
}

function formatOverdue(card: OverdueCard, t: Translate, locale: Locale): string {
  const scope = scopeText(t, [card.site]);
  const first = card.orders[0];
  if (card.total === 0 || !first) {
    return t("overdue.none", { scope });
  }
  return t("overdue.some", {
    count: card.total,
    scope,
    number: first.number,
    equipment: first.equipment,
    late: formatLate(first.lateMinutes, locale),
  });
}

function formatHistory(card: EquipmentHistoryCard, t: Translate): string {
  const name = card.equipment.name;
  const rca = card.openRca.length > 0 && t("history.rca");
  if (card.total === 0) {
    return sentences([t("history.empty", { equipment: name, days: card.days }), rca]);
  }
  const fault = card.topFaults[0];
  return sentences([
    t("history.summary", {
      equipment: name,
      days: card.days,
      total: card.total,
      unplanned: card.unplanned,
      hours: formatHours(card.downtime.hours),
      cost: formatTenge(card.downtime.cost),
    }),
    fault && t("history.topFault", { code: fault.code, name: fault.name, count: fault.count }),
    card.open > 0 && t("history.open", { count: card.open }),
    rca,
  ]);
}

function formatReport(card: ShiftReportCard, t: Translate): string {
  const period =
    card.scope === "current_shift"
      ? t("report.current")
      : t("report.day", { date: shortDate(card.date) });
  return sentences([
    t("report.summary", {
      period,
      issued: card.issued,
      done: card.done,
      overdue: card.overdue,
      rejected: card.rejected,
      hours: formatHours(card.downtime.hours),
      cost: formatTenge(card.downtime.cost),
    }),
    card.load &&
      card.load.onShift > 0 &&
      t("report.load", {
        percent: card.load.percent,
        busy: card.load.busy,
        free: card.load.free,
        onShift: card.load.onShift,
      }),
  ]);
}

function formatSite(card: SiteProblemsCard, t: Translate): string {
  const site = card.site?.name ?? t("site.all");
  const limited = card.limited && t("site.limited");
  if (card.total === 0) {
    return sentences([t("site.empty", { site, days: card.days }), limited]);
  }
  const top = card.topEquipment
    .filter((item) => item.unplanned > 0)
    .slice(0, 3)
    .map((item) => t("site.topItem", { name: item.name, count: item.unplanned }));
  const faults = card.topFaults.slice(0, 3).map((fault) => `${fault.code} (${fault.count})`);
  return sentences([
    t("site.summary", {
      site,
      days: card.days,
      total: card.total,
      unplanned: card.unplanned,
      emergency: card.emergency,
      hours: formatHours(card.downtime.hours),
      cost: formatTenge(card.downtime.cost),
    }),
    top.length > 0 && t("site.top", { items: top.join(", ") }),
    faults.length > 0 && t("site.faults", { items: faults.join(", ") }),
    card.insights.length > 0 && t("site.insights", { count: card.insights.length }),
    card.openRca.length > 0 && t("site.rca", { count: card.openRca.length }),
    limited,
  ]);
}

function formatDraft(card: DraftCard, t: Translate, locale: Locale): string {
  const priority = translator(
    locale,
    "workOrder.priority",
  )(card.priority).toLocaleLowerCase(locale === "kk" ? "kk-KZ" : "ru-RU");
  return sentences([
    t("draft.ready", {
      equipment: card.equipment ? t("draft.equipment", { name: card.equipment.name }) : "",
      priority,
    }),
    !card.equipment && t("draft.noEquipment"),
  ]);
}

function formatLookup(card: LookupCard, t: Translate): string {
  return t(`lookup.${card.miss.target}_${card.miss.status}`, {
    query: card.miss.query,
    items: card.miss.candidates.join(", "),
  });
}

export function formatCard(card: AssistantCard, locale: Locale): string {
  return composeCard(card, locale).replace(/\.{2,}/g, ".");
}

function composeCard(card: AssistantCard, locale: Locale): string {
  const t = answers(locale);
  switch (card.kind) {
    case "workers":
      return formatWorkers(card, t);
    case "overdue":
      return formatOverdue(card, t, locale);
    case "equipment_history":
      return formatHistory(card, t);
    case "shift_report":
      return formatReport(card, t);
    case "site_problems":
      return formatSite(card, t);
    case "draft":
      return formatDraft(card, t, locale);
    case "lookup":
      return formatLookup(card, t);
  }
}

export function formatCards(cards: readonly AssistantCard[], locale: Locale): string {
  return cards.map((card) => formatCard(card, locale)).join("\n");
}

export function formatHelp(locale: Locale): string {
  return answers(locale)("help");
}

export function formatFailure(locale: Locale): string {
  return answers(locale)("failure");
}
