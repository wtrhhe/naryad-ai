import { describe, expect, it } from "vitest";
import {
  buildMemorySentence,
  fallbackCheckHints,
  lowerFirst,
  repeatInterval,
  summarizeEquipmentMemory,
  type MemoryInput,
  type MemoryOrder,
} from "@/lib/equipment/memory";

const now = new Date("2026-10-08T12:00:00Z");

const packing = {
  materialId: "m-packing",
  name: "Набивка сальниковая графитовая Ø12",
  unit: "кг",
  quantity: 1.2,
};
const sleeve = { materialId: "m-sleeve", name: "Втулка защитная вала", unit: "шт", quantity: 1 };

function order(overrides: Partial<MemoryOrder> = {}): MemoryOrder {
  return {
    id: crypto.randomUUID(),
    number: 1,
    kind: "unplanned",
    priority: "high",
    status: "closed",
    issuedAt: "2026-09-01T00:00:00.000Z",
    doneAt: null,
    closedAt: null,
    faultCodeId: "f-gland",
    faultCode: "М-05",
    faultName: "Течь сальникового уплотнения",
    workPerformed: null,
    downtimeStartedAt: null,
    downtimeEndedAt: null,
    downtimeCost: null,
    materials: [],
    ...overrides,
  };
}

const glandLeaks: MemoryOrder[] = [
  order({
    number: 438,
    issuedAt: "2026-09-05T18:00:00.000Z",
    closedAt: "2026-09-05T23:00:00.000Z",
    downtimeStartedAt: "2026-09-05T18:00:00.000Z",
    downtimeEndedAt: "2026-09-05T22:00:00.000Z",
    downtimeCost: 2_160_000,
    materials: [packing],
    workPerformed: "Заменена набивка сальника, проверена защитная втулка вала.",
  }),
  order({
    number: 482,
    issuedAt: "2026-09-11T16:00:00.000Z",
    closedAt: "2026-09-11T20:00:00.000Z",
    materials: [packing],
  }),
  order({
    number: 523,
    issuedAt: "2026-09-17T03:00:00.000Z",
    closedAt: "2026-09-17T09:00:00.000Z",
    materials: [packing, sleeve],
    workPerformed: "Заменена набивка сальника, отрегулирован поджим",
  }),
];

const input: MemoryInput = {
  equipment: {
    id: "eq-n4",
    name: "Насос Н-4",
    inventoryNumber: "ОБ-011",
    siteName: "Обогащение",
    criticality: 3,
    downtimeCostPerHour: 540_000,
  },
  orders: [
    ...glandLeaks,
    order({
      number: 392,
      faultCodeId: "f-motor",
      faultCode: "Э-01",
      faultName: "Перегрев/отключение электродвигателя",
      issuedAt: "2026-08-31T02:00:00.000Z",
      closedAt: "2026-08-31T06:00:00.000Z",
    }),
    order({
      number: 574,
      kind: "planned",
      priority: "planned",
      faultCodeId: "f-lube",
      faultCode: "С-01",
      faultName: "Недостаток смазки/плановая замена",
      issuedAt: "2026-09-23T06:00:00.000Z",
      closedAt: "2026-09-23T10:00:00.000Z",
    }),
    order({
      number: 10,
      faultCodeId: "f-starter",
      faultCode: "Э-03",
      faultName: "Отказ пускателя/контактора",
      issuedAt: "2026-07-13T00:00:00.000Z",
      closedAt: "2026-07-13T04:00:00.000Z",
    }),
    order({
      number: 11,
      faultCodeId: "f-starter",
      faultCode: "Э-03",
      faultName: "Отказ пускателя/контактора",
      issuedAt: "2026-07-20T00:00:00.000Z",
      closedAt: "2026-07-20T04:00:00.000Z",
    }),
    order({
      number: 700,
      status: "in_progress",
      faultCodeId: null,
      faultCode: null,
      faultName: null,
      issuedAt: "2026-10-08T10:00:00.000Z",
      downtimeStartedAt: "2026-10-08T10:00:00.000Z",
    }),
  ],
  openRca: [
    {
      id: "rca-1",
      faultCodeId: "f-gland",
      hypothesis: "Фильтр линии уплотнительной воды засорён.",
    },
  ],
  activeLockout: true,
};

describe("repeatInterval", () => {
  it("returns a whole-day range around the gaps between repeats", () => {
    expect(
      repeatInterval(["2026-09-01T00:00:00Z", "2026-09-06T12:00:00Z", "2026-09-15T00:00:00Z"]),
    ).toEqual({ min: 5, max: 9, typical: 7 });
  });

  it("returns an exact interval for a single gap and nothing for one event", () => {
    expect(repeatInterval(["2026-09-01T00:00:00Z", "2026-09-07T03:00:00Z"])).toEqual({
      min: 6,
      max: 6,
      typical: 6.1,
    });
    expect(repeatInterval(["2026-09-01T00:00:00Z"])).toBeNull();
  });
});

describe("summarizeEquipmentMemory", () => {
  const summary = summarizeEquipmentMemory(input, { now });

  it("finds the repeating fault inside the window", () => {
    expect(summary.focus).toMatchObject({
      code: "М-05",
      count: 3,
      spanDays: 33,
      daysSinceLast: 21,
      interval: { min: 5, max: 6 },
      orderNumbers: [438, 482, 523],
      rcaHypothesis: "Фильтр линии уплотнительной воды засорён.",
    });
    expect(summary.focus?.materials[0]).toBe(packing.name);
    expect(summary.repeats.map((repeat) => repeat.code)).toEqual(["М-05"]);
  });

  it("ignores planned work and repeats outside the window", () => {
    expect(summary.unplannedInWindow).toBe(5);
    expect(summary.repeats.some((repeat) => repeat.code === "Э-03")).toBe(false);
  });

  it("lists last repairs and replaced materials", () => {
    expect(summary.lastRepairs.map((repair) => repair.number)).toEqual([574, 523, 482, 438, 392]);
    expect(summary.replacedMaterials[0]).toEqual({
      name: packing.name,
      unit: "кг",
      quantity: 3.6,
      times: 3,
    });
  });

  it("sums downtime with the open one counted up to now", () => {
    expect(summary.downtime.openSince).toBe("2026-10-08T10:00:00.000Z");
    expect(summary.downtime.hours).toBe(6);
    expect(summary.downtime.cost).toBe(2_160_000 + 2 * 540_000);
    expect(summary.downtime.windowCost).toBe(summary.downtime.cost);
  });

  it("rates the risk high for a critical unit with repeats and an open RCA", () => {
    expect(summary.risk.level).toBe("high");
    expect(summary.risk.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["repeat", "rca", "critical"]),
    );
    expect(summary.activeLockout).toBe(true);
    expect(summary.openRcaCount).toBe(1);
  });

  it("focuses on a requested fault even without repeats", () => {
    const requested = summarizeEquipmentMemory(input, { now, faultCodeId: "f-motor" });
    expect(requested.focus).toMatchObject({ code: "Э-01", count: 1, interval: null });
  });

  it("clips the window", () => {
    const short = summarizeEquipmentMemory(input, { now, windowDays: 30 });
    expect(short.focus).toMatchObject({ code: "М-05", count: 2 });
  });
});

describe("buildMemorySentence", () => {
  const summary = summarizeEquipmentMemory(input, { now });

  it("builds the Russian sentence from the brief", () => {
    expect(buildMemorySentence(summary, "ru")).toBe(
      "Насос Н-4: течь сальникового уплотнения 3-й раз за 33 дня; меняли: набивка сальниковая графитовая Ø12, втулка защитная вала; повтор через 5–6 дней",
    );
  });

  it("builds the Kazakh sentence", () => {
    expect(buildMemorySentence(summary, "kk")).toBe(
      "Насос Н-4: течь сальникового уплотнения — 33 күн ішінде 3 рет; ауыстырылды: набивка сальниковая графитовая Ø12, втулка защитная вала; 5–6 күн сайын қайталанады",
    );
  });

  it("describes a single failure and a quiet unit", () => {
    const single = summarizeEquipmentMemory(input, { now, faultCodeId: "f-motor" });
    expect(buildMemorySentence(single, "ru")).toBe(
      "Насос Н-4: перегрев/отключение электродвигателя — последний раз 38 дней назад",
    );
    const quiet = summarizeEquipmentMemory({ ...input, orders: [] }, { now });
    expect(buildMemorySentence(quiet, "ru")).toBe(
      "Насос Н-4: внеплановых отказов за 60 дней не было",
    );
    expect(buildMemorySentence(quiet, "kk")).toBe(
      "Насос Н-4: 60 күн ішінде жоспардан тыс істен шығу болған жоқ",
    );
  });

  it("reports failures without repeats", () => {
    const scattered = summarizeEquipmentMemory(
      { ...input, orders: [glandLeaks[0] as MemoryOrder] },
      { now },
    );
    expect(buildMemorySentence(scattered, "ru")).toBe(
      "Насос Н-4: внеплановых отказов за 60 дней — 1, повторов нет",
    );
  });

  it("uses one day form for an exact interval", () => {
    const pair = summarizeEquipmentMemory(
      { ...input, orders: glandLeaks.slice(0, 2), openRca: [] },
      { now },
    );
    expect(buildMemorySentence(pair, "ru")).toContain("повтор через 6 дней");
  });
});

describe("fallbackCheckHints", () => {
  it("starts with the RCA hypothesis and the replaced parts", () => {
    const hint = fallbackCheckHints(summarizeEquipmentMemory(input, { now }), "ru");
    expect(hint.source).toBe("rules");
    expect(hint.items).toEqual([
      "Проверьте гипотезу RCA: Фильтр линии уплотнительной воды засорён",
      "Осмотрите узел, где уже меняли: набивка сальниковая графитовая Ø12, втулка защитная вала",
      "Отказ возвращается через 5–6 дн. — ищите первопричину, а не только меняйте детали",
    ]);
  });

  it("falls back to a general check for a unit without history", () => {
    const hint = fallbackCheckHints(
      summarizeEquipmentMemory({ ...input, orders: [], openRca: [] }, { now }),
      "kk",
    );
    expect(hint.items).toHaveLength(1);
    expect(hint.items[0]).toContain("Түйінді толық қараңыз");
  });

  it("mentions the last work and a growing trend when there are no repeats", () => {
    const orders = [
      order({
        number: 1,
        faultCodeId: "a",
        issuedAt: "2026-10-01T00:00:00.000Z",
        closedAt: "2026-10-01T05:00:00.000Z",
        workPerformed: "Подтянут крепёж.",
      }),
      order({ number: 2, faultCodeId: "b", issuedAt: "2026-10-03T00:00:00.000Z" }),
    ];
    const hint = fallbackCheckHints(
      summarizeEquipmentMemory({ ...input, orders, openRca: [] }, { now }),
      "ru",
    );
    expect(hint.items).toEqual([
      "Прошлый ремонт, наряд №1: подтянут крепёж",
      "Отказы учащаются: 2 за 30 дней против 0 месяцем ранее",
    ]);
  });
});

describe("lowerFirst", () => {
  it("keeps abbreviations intact", () => {
    expect(lowerFirst("Течь")).toBe("течь");
    expect(lowerFirst("КИПиА")).toBe("КИПиА");
    expect(lowerFirst("")).toBe("");
  });
});
