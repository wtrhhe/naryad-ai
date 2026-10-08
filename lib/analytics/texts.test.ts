import { describe, expect, it } from "vitest";
import { SAMPLE_PARAMS } from "@/lib/analytics/fixtures";
import { INSIGHT_KINDS } from "@/lib/analytics/insight";
import {
  adviceFor,
  digestEmptyBody,
  digestTitle,
  formatMoney,
  plural,
  renderInsightText,
  renderStoredInsightText,
  shiftGroupLabel,
} from "@/lib/analytics/texts";

describe("formatting helpers", () => {
  it("formats money in readable units", () => {
    expect(formatMoney(503_720_256, "ru")).toBe("503,7 млн ₸");
    expect(formatMoney(2_291_785, "kk")).toBe("2,3 млн ₸");
    expect(formatMoney(1_200_000_000, "ru")).toBe("1,2 млрд ₸");
    expect(formatMoney(850_000, "ru")).toBe("850 тыс. ₸");
    expect(formatMoney(850_000, "kk")).toBe("850 мың ₸");
    expect(formatMoney(500, "ru")).toBe("500 ₸");
  });

  it("chooses Russian plural forms", () => {
    const forms = ["случай", "случая", "случаев"] as const;
    expect(plural(1, forms)).toBe("случай");
    expect(plural(3, forms)).toBe("случая");
    expect(plural(7, forms)).toBe("случаев");
    expect(plural(12, forms)).toBe("случаев");
    expect(plural(21, forms)).toBe("случай");
    expect(plural(1.5, forms)).toBe("случая");
  });

  it("falls back from fault code to category advice", () => {
    expect(adviceFor("М-02", "mechanical", "ru")).toContain("соосность привода");
    expect(adviceFor("Э-07", "electrical", "kk")).toContain("электр қозғалтқыш");
    expect(adviceFor(null, null, "ru")).toContain("диагностику");
  });

  it("labels shifts and time of day", () => {
    expect(shiftGroupLabel("period", "night", "ru")).toBe("Ночная смена");
    expect(shiftGroupLabel("crew", "D", "kk")).toBe("D ауысымы");
    expect(shiftGroupLabel("time_of_day", "00-06", "ru")).toBe("Период 00:00–06:00");
  });
});

describe("renderInsightText", () => {
  it("writes the problem equipment summary in plain Russian", () => {
    const text = renderInsightText("problem_equipment", SAMPLE_PARAMS.problem_equipment, "ru");
    expect(text.summary).toBe(
      "Конвейер К-3: 7 внеплановых остановок за 30 дней — в 3,1 раза больше медианы аналогичного оборудования (2,3). 5 из них — шифр М-02 (износ/разрушение подшипника). Простой 42 ч, потери 27,6 млн ₸.",
    );
    expect(text.recommendation).toBe(
      "Рекомендуем проверить соосность привода, натяжение и смазку подшипниковых узлов, заменить подшипники комплектом и включить Конвейер К-3 в план ППР с приоритетом.",
    );
  });

  it.each(INSIGHT_KINDS)("renders %s in both languages with numbers", (kind) => {
    const params = SAMPLE_PARAMS[kind];
    const ru = renderInsightText(kind, params, "ru");
    const kk = renderInsightText(kind, params, "kk");
    for (const text of [ru, kk]) {
      expect(text.summary.length).toBeGreaterThan(40);
      expect(text.recommendation.length).toBeGreaterThan(40);
      expect(text.summary).toMatch(/\d/);
      expect(text.summary).not.toMatch(/undefined|null|NaN/);
      expect(text.recommendation).not.toMatch(/undefined|null|NaN/);
    }
    expect(ru.summary).not.toBe(kk.summary);
    expect(kk.recommendation.startsWith("Ұсыныс")).toBe(true);
    expect(ru.recommendation.startsWith("Рекомендуем")).toBe(true);
  });

  it("covers the variants of risk, repeats and shifts", () => {
    const moderate = renderInsightText(
      "failure_risk",
      { ...SAMPLE_PARAMS.failure_risk, level: "moderate", factors: [], acoustic: null },
      "ru",
    );
    expect(moderate.recommendation).toContain("усилить контроль");
    expect(
      renderInsightText("failure_risk", { ...SAMPLE_PARAMS.failure_risk, level: "elevated" }, "kk")
        .recommendation,
    ).toContain("бақылауды күшейту");
    expect(
      renderInsightText(
        "repeat_fault",
        { ...SAMPLE_PARAMS.repeat_fault, rcaState: "created" },
        "ru",
      ).summary,
    ).toContain("Открыт разбор первопричины");
    const repeatShift = {
      ...SAMPLE_PARAMS.shift_effect,
      measure: "repeat_rate" as const,
      dimension: "crew" as const,
      group: "D",
    };
    expect(renderInsightText("shift_effect", repeatShift, "ru").summary).toContain("Смена D");
    expect(renderInsightText("shift_effect", repeatShift, "kk").summary).toContain("D ауысымы");
    const spread = { ...SAMPLE_PARAMS.problem_equipment, topFaultCount: 2 };
    expect(renderInsightText("problem_equipment", spread, "ru").summary).toContain("Чаще всего");
    expect(renderInsightText("problem_equipment", spread, "kk").summary).toContain(
      "Жиі кездесетіні",
    );
  });

  it("labels every material overuse dimension", () => {
    const base = SAMPLE_PARAMS.material_overuse;
    const variants = [
      { ...base, dimension: "site" as const },
      { ...base, dimension: "period" as const },
      { ...base, dimension: "crew" as const, crew: "B" },
      { ...base, dimension: "worker" as const, worker: "Попов А. И." },
      { ...base, dimension: "brigade" as const, brigade: "Механослужба обогащения" },
      {
        ...base,
        dimension: "fault" as const,
        faultCode: "М-05",
        faultName: "Течь сальника",
        topMaterial: null,
      },
    ];
    const summaries = variants.map(
      (params) => renderInsightText("material_overuse", params, "ru").summary,
    );
    expect(summaries[0]?.startsWith("Участок «Обогащение»:")).toBe(true);
    expect(summaries[1]?.startsWith("Ночная смена:")).toBe(true);
    expect(summaries[2]?.startsWith("Смена B:")).toBe(true);
    expect(summaries[3]?.startsWith("Исполнитель Попов")).toBe(true);
    expect(summaries[4]?.startsWith("Бригада")).toBe(true);
    expect(summaries[5]?.startsWith("Шифр М-05")).toBe(true);
    expect(renderInsightText("material_overuse", variants[5] as never, "kk").summary).toContain(
      "М-05 шифры",
    );
  });
});

describe("renderStoredInsightText", () => {
  it("re-renders stored parameters and rejects unknown data", () => {
    expect(
      renderStoredInsightText("repeat_fault", SAMPLE_PARAMS.repeat_fault, "kk")?.summary,
    ).toContain("Насос Н-4");
    expect(renderStoredInsightText("unknown", {}, "kk")).toBeNull();
    expect(renderStoredInsightText("repeat_fault", { equipment: 1 }, "kk")).toBeNull();
  });
});

describe("digest texts", () => {
  it("titles the weekly digest", () => {
    expect(digestTitle(5, "ru")).toBe("Аналитика за неделю: 5 выводов");
    expect(digestTitle(2, "kk")).toBe("Апталық талдау: 2 қорытынды");
    expect(digestEmptyBody("ru").length).toBeGreaterThan(10);
    expect(digestEmptyBody("kk").length).toBeGreaterThan(10);
  });
});
