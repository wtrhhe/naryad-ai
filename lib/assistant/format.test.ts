import { describe, expect, it } from "vitest";
import {
  formatCard,
  formatCards,
  formatFailure,
  formatHelp,
  formatHours,
  formatLate,
  shortDate,
} from "@/lib/assistant/format";
import { executeTool } from "@/lib/assistant/tools";
import type { AssistantCard, WorkersCard } from "@/lib/assistant/types";
import { FIXTURE_NOW, fakeGateway } from "@/lib/assistant/test-fixtures";

async function cardFor(tool: string, input: unknown, options = {}): Promise<AssistantCard> {
  const { gateway } = fakeGateway(options);
  const execution = await executeTool(tool, input, { gateway, now: FIXTURE_NOW });
  if (!execution.ok) throw new Error(execution.error);
  return execution.card;
}

function text(card: AssistantCard, locale: "ru" | "kk"): string {
  return formatCard(card, locale).replace(/[  ]/g, " ");
}

const NO_FREE: WorkersCard = {
  kind: "workers",
  specialty: "welder",
  site: null,
  onShiftCount: 2,
  freeCount: 0,
  workers: [
    {
      id: "a",
      name: "Ким О.",
      specialty: "welder",
      status: "queue",
      activeOrderNumber: null,
      queueLength: 2,
    },
    {
      id: "b",
      name: "Ли А.",
      specialty: "welder",
      status: "busy",
      activeOrderNumber: 77,
      queueLength: 0,
    },
  ],
};

describe("units", () => {
  it.each([
    [45, "ru", "45 мин"],
    [90, "ru", "1 ч 30 мин"],
    [120, "ru", "2 ч"],
    [2880, "ru", "2 сут"],
    [3000, "ru", "2 сут 2 ч"],
    [90, "kk", "1 сағ 30 мин"],
    [-5, "ru", "0 мин"],
  ] as const)("formats %s minutes in %s", (minutes, locale, expected) => {
    expect(formatLate(minutes, locale)).toBe(expected);
  });

  it("formats hours and dates", () => {
    expect(formatHours(7.46)).toBe("7,5");
    expect(formatHours(2)).toBe("2");
    expect(shortDate("2026-10-07")).toBe("07.10.2026");
    expect(shortDate(null)).toBe("");
  });
});

describe("formatCard in Russian", () => {
  it("answers about free workers", async () => {
    expect(text(await cardFor("find_free_workers", { specialty: "electrician" }), "ru")).toBe(
      "Сейчас свободен 1 исполнитель (электрики): Петров И.",
    );
  });

  it("names the nearest workers when nobody is free", () => {
    expect(text(NO_FREE, "ru")).toBe(
      "Свободных исполнителей (сварщики) сейчас нет. Ближе всех к освобождению: Ким О. — в очереди 2, Ли А. — наряд №77.",
    );
  });

  it("reports an empty shift", () => {
    expect(text({ ...NO_FREE, onShiftCount: 0, workers: [] }, "ru")).toBe(
      "На смене нет исполнителей (сварщики).",
    );
  });

  it("answers about overdue orders", async () => {
    expect(text(await cardFor("list_overdue", {}), "ru")).toBe(
      "Просрочено 2 наряда. Дольше всех: №101 — Конвейер К-3, на 4 ч 30 мин.",
    );
    expect(text({ kind: "overdue", site: "Дробление", total: 0, orders: [] }, "ru")).toBe(
      "Просроченных нарядов (Дробление) нет.",
    );
  });

  it("answers about equipment history", async () => {
    expect(text(await cardFor("equipment_history", { equipment: "К-3" }), "ru")).toBe(
      "Конвейер К-3 за 30 дн.: 2 наряда, внеплановых — 2, простой 7,5 ч (2 250 000 ₸). Чаще всего — М-02 «Износ подшипника» (2). Сейчас открыто нарядов: 1. Есть открытый разбор RCA.",
    );
    const empty = await cardFor("equipment_history", { equipment: "К-1", days: 1 });
    expect(text(empty, "ru")).toBe("Конвейер К-1: за 1 дн. нарядов не было.");
  });

  it("answers with the shift report", async () => {
    expect(text(await cardFor("shift_report", {}), "ru")).toBe(
      "Текущая смена: выдано 4, выполнено 1, просрочено 3, отклонено 1. Простой 5,5 ч (1 650 000 ₸). Загрузка 50%: в работе 1, свободно 2 из 4 на смене.",
    );
    expect(text(await cardFor("shift_report", { date: "2026-10-01" }), "ru")).toBe(
      "За 01.10.2026: выдано 1, выполнено 1, просрочено 0, отклонено 0. Простой 2 ч (600 000 ₸).",
    );
  });

  it("answers about site problems", async () => {
    expect(text(await cardFor("site_problems", { site: "дробление" }), "ru")).toBe(
      "Дробление за 30 дн.: 3 наряда, внеплановых — 2, аварийных — 0, простой 7,5 ч (2 250 000 ₸). Проблемнее всего: Конвейер К-3 (2 внепл.). Частые шифры: М-02 (2). Выводов аналитики: 1. Открытых разборов RCA: 1.",
    );
    const limited = await cardFor("site_problems", { site: "обогащение", period_days: 1 });
    expect(text(limited, "ru")).toContain("Участок вне вашей зоны — учтены только ваши наряды.");
    const empty = await cardFor(
      "site_problems",
      { site: "обогащение", period_days: 1 },
      {
        viewerSiteIds: null,
      },
    );
    expect(text({ ...empty, total: 0 } as AssistantCard, "ru")).toBe(
      "Обогащение: за 1 дн. нарядов нет.",
    );
  });

  it("answers with a draft", async () => {
    expect(
      text(await cardFor("create_work_order_draft", { description: "Течь на насосе Н-4" }), "ru"),
    ).toBe(
      "Подготовил черновик наряда на «Насос Н-4», приоритет — обычный. Проверьте и нажмите «Создать наряд».",
    );
    expect(
      text(await cardFor("create_work_order_draft", { description: "Авария, порыв ленты" }), "ru"),
    ).toBe(
      "Подготовил черновик наряда, приоритет — аварийный. Проверьте и нажмите «Создать наряд». Оборудование выберите в форме.",
    );
  });

  it("asks to clarify lookups", async () => {
    expect(text(await cardFor("equipment_history", { equipment: "конвейер" }), "ru")).toBe(
      "Под «конвейер» подходит несколько единиц: Конвейер К-3, Конвейер К-1. Уточните, какая нужна.",
    );
    expect(text(await cardFor("site_problems", { site: "карьер" }), "ru")).toBe(
      "Не нашёл участок «карьер». Есть: Дробление, Обогащение.",
    );
  });
});

describe("formatCard in Kazakh", () => {
  it("answers about free workers", async () => {
    expect(text(await cardFor("find_free_workers", { specialty: "electrician" }), "kk")).toBe(
      "Қазір бос (электриктер): 1 адам — Петров И.",
    );
  });

  it("answers about overdue orders", async () => {
    expect(text(await cardFor("list_overdue", {}), "kk")).toBe(
      "Мерзімі өткен нарядтар: 2. Ең ұзағы: №101 — Конвейер К-3, 4 сағ 30 мин кешікті.",
    );
  });

  it("answers about site problems", async () => {
    expect(text(await cardFor("site_problems", { site: "ұсақтау" }), "kk")).toContain(
      "Дробление, 30 күнде: 3 наряд",
    );
  });

  it("answers with a draft", async () => {
    expect(
      text(
        await cardFor("create_work_order_draft", {
          description: "Н-4 сорғысы ағып тұр",
          priority: "emergency",
        }),
        "kk",
      ),
    ).toBe(
      "Наряд жобасы дайын: «Насос Н-4», басымдығы — апаттық. Тексеріп, «Наряд құру» батырмасын басыңыз.",
    );
  });
});

describe("helpers", () => {
  it("joins several cards and provides fallback texts", async () => {
    const cards = [await cardFor("list_overdue", {}), NO_FREE];
    expect(formatCards(cards, "ru").split("\n")).toHaveLength(2);
    expect(formatCards([], "ru")).toBe("");
    expect(formatHelp("ru")).toContain("Кто сейчас свободен из электриков?");
    expect(formatHelp("kk")).toContain("Қазір электриктерден кім бос?");
    expect(formatFailure("kk")).toContain("қайталап");
  });

  it("limits long name lists", () => {
    const many: WorkersCard = {
      ...NO_FREE,
      freeCount: 7,
      workers: Array.from({ length: 7 }, (_, index) => ({
        id: String(index),
        name: `Имя${index} А.`,
        specialty: "welder" as const,
        status: "free" as const,
        activeOrderNumber: null,
        queueLength: 0,
      })),
    };
    expect(text(many, "ru")).toBe(
      "Сейчас свободны 7 исполнителей (сварщики): Имя0 А., Имя1 А., Имя2 А., Имя3 А., Имя4 А. и ещё 2.",
    );
  });
});
