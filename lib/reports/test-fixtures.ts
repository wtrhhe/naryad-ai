import type { ReportDocument } from "@/lib/reports/document";

export const KAZAKH_LETTERS = "әғқңөұүһі ӘҒҚҢӨҰҮҺІ";

export function sampleDocument(overrides: Partial<ReportDocument> = {}): ReportDocument {
  return {
    kind: "shift",
    locale: "kk",
    title: `Ауысым есебі ${KAZAKH_LETTERS}`,
    subtitle: "Күндізгі ауысым",
    periodLabel: "08.10.2026, 08:00 – 08.10.2026, 20:00",
    generatedAt: "08.10.2026, 18:30",
    filters: [{ label: "Учаскө", value: "Байыту" }],
    kpis: [
      { id: "issued", label: "Берілді", value: 12, format: "integer" },
      { id: "downtime", label: "Тоқтап тұру", value: 4.5, format: "hours", tone: "bad" },
      { id: "cost", label: "Шығын", value: 125000, format: "money", tone: "accent" },
      { id: "share", label: "Үлес", value: 37.5, format: "percent", tone: "good" },
    ],
    sections: [
      {
        type: "fields",
        id: "card",
        title: "Наряд карточкасы",
        items: [
          { label: "Жабдық", value: "Конвейер К-3" },
          { label: "Сипаттама", value: "Мойынтірек қызып кетті, дірілі жоғары, тексеру қажет." },
        ],
      },
      {
        type: "table",
        id: "workers",
        title: "Жұмысшылардың жүктемесі",
        columns: [
          { key: "name", label: "Орындаушы", format: "text", weight: 3 },
          { key: "hours", label: "Сағат", format: "hours" },
          { key: "cost", label: "Құны", format: "money" },
          { key: "at", label: "Уақыты", format: "datetime", weight: 2 },
        ],
        rows: Array.from({ length: 60 }, (_, index) => ({
          name: `Жұмысшы ${index + 1} ${KAZAKH_LETTERS}`,
          hours: index / 3,
          cost: index * 1500,
          at: "2026-10-08T09:05:00Z",
        })),
        totals: { name: "Барлығы", hours: 590, cost: 2655000, at: null },
        empty: "Деректер жоқ",
      },
      {
        type: "bars",
        id: "bars",
        title: "Рейтинг",
        format: "number",
        items: [
          { label: "Әлиев", value: 82.5 },
          { label: "Құрманов", value: 64 },
        ],
        empty: "Деректер жоқ",
      },
      {
        type: "text",
        id: "summary",
        title: "Қорытынды",
        paragraphs: ["Ауысымда 12 наряд берілді.", "Ең көп тоқтап тұрған жабдық — Диірмен М-1."],
        note: "Үлгі бойынша жасалды",
        bullets: true,
      },
      {
        type: "table",
        id: "empty",
        title: "Бос кесте",
        columns: [{ key: "a", label: "A", format: "text" }],
        rows: [],
        empty: "Деректер жоқ",
      },
    ],
    labels: {
      company: "Тау-кен байыту кәсіпорны · НарядAI",
      generated: "Жасалды",
      period: "Кезең",
      page: "{page} / {total} бет",
      hoursUnit: "сағ",
      totals: "Барлығы",
      summarySheet: "Қорытынды",
    },
    fileName: "Ауысым есебі 2026-10-08",
    ...overrides,
  };
}
