import { describe, expect, it } from "vitest";
import {
  detectLocale,
  detectPriority,
  detectSpecialty,
  extractDate,
  extractDays,
  extractEquipment,
  extractSite,
  routeQuestion,
} from "@/lib/assistant/router";

const NOW = new Date("2026-10-08T09:30:00Z");

describe("routeQuestion: reference questions", () => {
  it("routes free electricians", () => {
    expect(routeQuestion("Кто сейчас свободен из электриков?", NOW)).toEqual({
      tool: "find_free_workers",
      input: { specialty: "electrician" },
    });
  });

  it("routes overdue orders of the shift", () => {
    expect(routeQuestion("Что просрочено на смене?", NOW)).toEqual({
      tool: "list_overdue",
      input: {},
    });
  });

  it("routes a weekly site report", () => {
    expect(routeQuestion("Сформируй отчёт за неделю по участку обогащения", NOW)).toEqual({
      tool: "site_problems",
      input: { site: "обогащение", period_days: 7 },
    });
  });

  it("routes monthly site problems", () => {
    expect(routeQuestion("Покажи проблемы участка дробления за месяц", NOW)).toEqual({
      tool: "site_problems",
      input: { site: "дробление", period_days: 30 },
    });
  });
});

describe("routeQuestion: Kazakh", () => {
  it.each([
    ["Қазір электриктерден кім бос?", "find_free_workers", { specialty: "electrician" }],
    ["Ауысымда қандай наряд мерзімі өтті?", "list_overdue", {}],
    [
      "Байыту учаскесі бойынша апталық есеп жаса",
      "site_problems",
      { site: "обогащение", period_days: 7 },
    ],
    [
      "Ұсақтау учаскесінің бір айдағы мәселелерін көрсет",
      "site_problems",
      { site: "дробление", period_days: 30 },
    ],
    ["К-3 конвейерінің тарихы", "equipment_history", { equipment: "К-3" }],
  ])("routes %s", (question, tool, input) => {
    expect(routeQuestion(question, NOW)).toEqual({ tool, input });
  });
});

describe("routeQuestion: other intents", () => {
  it("routes the current shift report", () => {
    expect(routeQuestion("Отчёт за смену", NOW)).toEqual({ tool: "shift_report", input: {} });
  });

  it("routes a report for yesterday", () => {
    expect(routeQuestion("Сводка за вчера", NOW)).toEqual({
      tool: "shift_report",
      input: { date: "2026-10-07" },
    });
  });

  it("routes a plant-wide weekly report to site problems without a site", () => {
    expect(routeQuestion("Отчёт за неделю", NOW)).toEqual({
      tool: "site_problems",
      input: { period_days: 7 },
    });
  });

  it("routes a report about equipment to its history", () => {
    expect(routeQuestion("Отчёт по конвейеру К-3", NOW)).toEqual({
      tool: "equipment_history",
      input: { equipment: "конвейеру К-3" },
    });
  });

  it("routes equipment history with a period", () => {
    expect(routeQuestion("Покажи историю конвейера К-3 за 14 дней", NOW)).toEqual({
      tool: "equipment_history",
      input: { equipment: "конвейера К-3", days: 14 },
    });
  });

  it("routes history without a code using the remaining words", () => {
    expect(routeQuestion("История вагоноопрокидывателя за месяц", NOW)).toEqual({
      tool: "equipment_history",
      input: { equipment: "вагоноопрокидывателя", days: 30 },
    });
  });

  it("does not route an empty history question", () => {
    expect(routeQuestion("Покажи историю", NOW)).toBeNull();
  });

  it("routes breakdowns of a single machine to its history", () => {
    expect(routeQuestion("Поломки насоса Н-4", NOW)).toEqual({
      tool: "equipment_history",
      input: { equipment: "насоса Н-4" },
    });
  });

  it("routes a bare equipment code to its history", () => {
    expect(routeQuestion("КМД-1750?", NOW)).toEqual({
      tool: "equipment_history",
      input: { equipment: "КМД-1750" },
    });
  });

  it("routes a bare specialty to free workers", () => {
    expect(routeQuestion("Сварщики на дроблении", NOW)).toEqual({
      tool: "find_free_workers",
      input: { specialty: "welder", site: "дробление" },
    });
  });

  it("routes a bare site to its problems", () => {
    expect(routeQuestion("Что по погрузке?", NOW)).toEqual({
      tool: "site_problems",
      input: { site: "погрузка", period_days: 30 },
    });
  });

  it("routes free workers on a site", () => {
    expect(routeQuestion("Кого можно отправить на РМЦ?", NOW)).toEqual({
      tool: "find_free_workers",
      input: { site: "РМЦ" },
    });
  });

  it("routes overdue on a site", () => {
    expect(routeQuestion("Какие наряды горит срок на дроблении", NOW)).toEqual({
      tool: "list_overdue",
      input: { site: "дробление" },
    });
  });

  it("builds a work order draft", () => {
    expect(routeQuestion("Создай наряд на насос Н-4: течь сальника, срочно", NOW)).toEqual({
      tool: "create_work_order_draft",
      input: {
        description: "Насос Н-4: течь сальника, срочно",
        equipment: "насос Н-4",
        priority: "high",
      },
    });
  });

  it("builds a Kazakh draft with text before the command", () => {
    expect(routeQuestion("Н-4 сорғысына апаттық наряд жаса", NOW)).toEqual({
      tool: "create_work_order_draft",
      input: {
        description: "Н-4 сорғысына апаттық",
        equipment: "Н-4",
        priority: "emergency",
      },
    });
  });

  it("keeps the whole text when the command has no details", () => {
    expect(routeQuestion("Новый наряд", NOW)).toEqual({
      tool: "create_work_order_draft",
      input: { description: "Новый наряд" },
    });
  });

  it("returns null for unrelated text", () => {
    expect(routeQuestion("Привет", NOW)).toBeNull();
    expect(routeQuestion("   ", NOW)).toBeNull();
  });
});

describe("extractors", () => {
  it("detects the language of the question", () => {
    expect(detectLocale("Кто свободен?", "kk")).toBe("ru");
    expect(detectLocale("Кім бос?", "ru")).toBe("kk");
    expect(detectLocale("Қазір не болды", "ru")).toBe("kk");
    expect(detectLocale("K-3", "kk")).toBe("kk");
  });

  it.each([
    ["электромонтёр", "electrician"],
    ["электрослесарей", "electrician"],
    ["электросварщика", "welder"],
    ["гидравлика", "hydraulic"],
    ["смазчиков", "lubricator"],
    ["киповцы", "instrumentation"],
    ["кип", "instrumentation"],
    ["слесарей", "fitter"],
    ["дәнекерлеушілер", "welder"],
  ])("detects specialty in %s", (text, specialty) => {
    expect(detectSpecialty(text)).toBe(specialty);
  });

  it("returns no specialty when none is named", () => {
    expect(detectSpecialty("кто свободен")).toBeNull();
  });

  it.each([
    ["Авария на конвейере", "emergency"],
    ["апат", "emergency"],
    ["срочно заменить", "high"],
    ["плановая замена масла", "planned"],
    ["заменить ролик", null],
  ])("detects priority in %s", (text, priority) => {
    expect(detectPriority(text)).toBe(priority);
  });

  it.each([
    ["участок №12", "12"],
    ["по участку Карьер", "Карьер"],
    ["Карьер учаскесі", "Карьер"],
    ["участок за", null],
    ["РМЦ-001", null],
    ["ремонтно-механический цех", "РМЦ"],
  ])("extracts site from %s", (text, site) => {
    expect(extractSite(text)).toBe(site);
  });

  it.each([
    ["за 10 дней", 10],
    ["за 2 недели", 14],
    ["за 3 месяца", 90],
    ["К-3 за 7 дней", 7],
    ["две недели", 14],
    ["квартал", 90],
    ["полгода", 180],
    ["за год", 365],
    ["за неделю", 7],
    ["за месяц", 30],
    ["соңғы айда", 30],
    ["сегодня", 1],
    ["за 900 дней", 365],
    ["без периода", null],
  ])("extracts days from %s", (text, days) => {
    expect(extractDays(text)).toBe(days);
  });

  it.each([
    ["за позавчера", "2026-10-06"],
    ["кеше", "2026-10-07"],
    ["сегодня", "2026-10-08"],
    ["за 2026-09-30", "2026-09-30"],
    ["за 5.10", "2026-10-05"],
    ["за 05.09.25", "2025-09-05"],
    ["за смену", null],
  ])("extracts date from %s", (text, date) => {
    expect(extractDate(text, NOW)).toBe(date);
  });

  it("uses the production day before 08:00 local time", () => {
    expect(extractDate("сегодня", new Date("2026-10-08T01:00:00Z"))).toBe("2026-10-07");
  });

  it.each([
    ["история конвейера К-3", "конвейера К-3"],
    ["что с к3", "к3"],
    ["насос н 4", "насос н 4"],
    ["мельница МШР-3600x5000", "мельница МШР-3600x5000"],
    ["наряд 123 за 7 дней", null],
    ["последние 30 дней", null],
  ])("extracts equipment from %s", (text, equipment) => {
    expect(extractEquipment(text)).toBe(equipment);
  });
});
