import ruWorkOrder from "@/messages/ru/workOrder.json";
import kkWorkOrder from "@/messages/kk/workOrder.json";
import type { Locale } from "@/i18n/config";
import { TIME_ZONE } from "@/i18n/config";
import type { DeadlineOrder, PlannedNotification } from "@/lib/deadlines/types";

function withPeriod(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

const STATUS_LABELS = { ru: ruWorkOrder.status, kk: kkWorkOrder.status } as const;

const TEXT = {
  ru: {
    hours: "ч",
    minutes: "мин",
    reminderTitle: (n: number) => `Срок наряда №${n} скоро истекает`,
    reminderBody: (left: string, o: DeadlineOrder) =>
      `Осталось ${left}. ${o.equipmentName}, участок: ${o.siteName}.`,
    overdueTitle: (n: number) => `Наряд №${n} просрочен`,
    overdueBody: (
      late: string,
      o: DeadlineOrder,
      who: string,
      status: string,
      since: string,
      comment: string,
    ) =>
      `Наряд №${o.number} просрочен на ${late}. ${o.equipmentName}, участок: ${o.siteName}. Исполнитель: ${withPeriod(who)} Статус: ${status} с ${since}.${comment ? ` Последний комментарий: «${comment}».` : ""}`,
    escalationTitle: (n: number) => `Наряд №${n} не принят`,
    escalationBody: (wait: string, o: DeadlineOrder, who: string, replacement: string | null) =>
      `Наряд №${o.number} не принят ${wait}. ${o.equipmentName}, участок: ${o.siteName}. Исполнитель: ${withPeriod(who)}${replacement ? ` Свободен: ${withPeriod(replacement)} Переназначить?` : " Свободных исполнителей нет."}`,
    managerTitle: (n: number) => `Длительная просрочка: наряд №${n}`,
    nobody: "не назначен",
  },
  kk: {
    hours: "сағ",
    minutes: "мин",
    reminderTitle: (n: number) => `№${n} наряд мерзімі жақында бітеді`,
    reminderBody: (left: string, o: DeadlineOrder) =>
      `${left} қалды. ${o.equipmentName}, учаске: ${o.siteName}.`,
    overdueTitle: (n: number) => `№${n} наряд мерзімі өтті`,
    overdueBody: (
      late: string,
      o: DeadlineOrder,
      who: string,
      status: string,
      since: string,
      comment: string,
    ) =>
      `№${o.number} наряд мерзімі ${late} өтті. ${o.equipmentName}, учаске: ${o.siteName}. Орындаушы: ${withPeriod(who)} Мәртебе: ${since} бастап ${status}.${comment ? ` Соңғы түсініктеме: «${comment}».` : ""}`,
    escalationTitle: (n: number) => `№${n} наряд қабылданбады`,
    escalationBody: (wait: string, o: DeadlineOrder, who: string, replacement: string | null) =>
      `№${o.number} наряд ${wait} бойы қабылданбады. ${o.equipmentName}, учаске: ${o.siteName}. Орындаушы: ${withPeriod(who)}${replacement ? ` Бос: ${withPeriod(replacement)} Қайта тағайындау керек пе?` : " Бос орындаушылар жоқ."}`,
    managerTitle: (n: number) => `Ұзақ кешігу: №${n} наряд`,
    nobody: "тағайындалмаған",
  },
} as const;

export function shortName(fullName: string | null): string | null {
  if (!fullName) {
    return null;
  }
  const [surname, firstName] = fullName.trim().split(/\s+/);
  return firstName ? `${surname} ${firstName.charAt(0)}.` : (surname ?? null);
}

export function formatDuration(totalMinutes: number, locale: Locale): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const text = TEXT[locale];
  return hours === 0
    ? `${rest} ${text.minutes}`
    : `${hours} ${text.hours} ${String(rest).padStart(2, "0")} ${text.minutes}`;
}

function clockTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export interface RenderedNotification {
  title: string;
  body: string;
}

export function renderDeadlineNotification(
  planned: PlannedNotification,
  order: DeadlineOrder,
  locale: Locale,
): RenderedNotification {
  const text = TEXT[locale];
  const who = shortName(order.assigneeName) ?? text.nobody;
  switch (planned.kind) {
    case "deadline_reminder":
      return {
        title: text.reminderTitle(order.number),
        body: text.reminderBody(formatDuration(planned.minutesLeft, locale), order),
      };
    case "accept_escalation":
      return {
        title: text.escalationTitle(order.number),
        body: text.escalationBody(
          formatDuration(planned.waitingMinutes, locale),
          order,
          who,
          shortName(planned.replacement?.fullName ?? null),
        ),
      };
    case "overdue":
    case "manager_overdue": {
      const status = STATUS_LABELS[locale][order.status].toLowerCase();
      const body = text.overdueBody(
        formatDuration(planned.overdueMinutes, locale),
        order,
        who,
        status,
        clockTime(order.statusSince),
        order.lastComment ?? "",
      );
      const title =
        planned.kind === "overdue"
          ? text.overdueTitle(order.number)
          : text.managerTitle(order.number);
      return { title, body };
    }
  }
}
