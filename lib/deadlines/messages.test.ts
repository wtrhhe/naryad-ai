import { describe, expect, it } from "vitest";
import { formatDuration, renderDeadlineNotification, shortName } from "@/lib/deadlines/messages";
import type { DeadlineOrder, PlannedNotification } from "@/lib/deadlines/types";

const order: DeadlineOrder = {
  id: "order-147",
  number: 147,
  status: "in_progress",
  priority: "normal",
  issuedAt: "2026-10-16T08:00:00+05:00",
  statusSince: "2026-10-16T09:20:00+05:00",
  dueAt: "2026-10-16T09:20:00+05:00",
  standardHours: null,
  assigneeId: "worker-1",
  assigneeName: "Ахметов Ерлан Сапарович",
  assigneeSpecialty: "fitter",
  masterId: "master-1",
  equipmentName: "Дробилка КМД-1750",
  siteName: "Дробление",
  lastComment: "ждём подшипник со склада",
};

const planned: PlannedNotification = {
  kind: "overdue",
  orderId: order.id,
  recipient: { kind: "employee", employeeId: "master-1" },
  dedupeKey: "overdue:order-147:master-1:3",
  urgent: true,
  overdueMinutes: 45,
  minutesLeft: 0,
  waitingMinutes: 0,
  replacement: null,
};

describe("renderDeadlineNotification", () => {
  it("matches the overdue message from the brief word for word", () => {
    expect(renderDeadlineNotification(planned, order, "ru").body).toBe(
      "Наряд №147 просрочен на 45 мин. Дробилка КМД-1750, участок: Дробление. Исполнитель: Ахметов Е. Статус: в работе с 09:20. Последний комментарий: «ждём подшипник со склада».",
    );
  });

  it("renders Kazakh text for Kazakh speaking recipients", () => {
    const { title, body } = renderDeadlineNotification(planned, order, "kk");
    expect(title).toBe("№147 наряд мерзімі өтті");
    expect(body).toContain("Орындаушы: Ахметов Е.");
  });

  it("offers a free colleague in the escalation", () => {
    const escalation = {
      ...planned,
      kind: "accept_escalation" as const,
      waitingMinutes: 11,
      replacement: {
        employeeId: "w3",
        fullName: "Сейтов Алмас",
        specialty: "fitter",
        onShift: true,
        busy: false,
      },
    };
    expect(
      renderDeadlineNotification(escalation, { ...order, status: "issued" }, "ru").body,
    ).toContain("Свободен: Сейтов А. Переназначить?");
  });

  it("omits the comment sentence when there is none", () => {
    expect(
      renderDeadlineNotification(planned, { ...order, lastComment: null }, "ru").body,
    ).not.toContain("комментарий");
  });
});

describe("formatDuration", () => {
  it.each([
    [45, "ru", "45 мин"],
    [125, "ru", "2 ч 05 мин"],
    [60, "kk", "1 сағ 00 мин"],
  ] as const)("%d minutes in %s is %s", (minutes, locale, expected) => {
    expect(formatDuration(minutes, locale)).toBe(expected);
  });
});

describe("shortName", () => {
  it("keeps the surname and the first initial", () => {
    expect(shortName("Ахметов Ерлан Сапарович")).toBe("Ахметов Е.");
    expect(shortName("Ахметов")).toBe("Ахметов");
    expect(shortName(null)).toBeNull();
  });
});
