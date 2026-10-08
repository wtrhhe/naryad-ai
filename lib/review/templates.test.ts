import { describe, expect, it } from "vitest";
import {
  materialLine,
  reviewContext,
  settings,
  withOrder,
} from "@/lib/review/__fixtures__/context";
import { runChecks } from "@/lib/review/checks";
import { scoreChecks } from "@/lib/review/score";
import {
  capNoteFor,
  failedImprovements,
  improvementsFor,
  masterExplanationFor,
  mismatchNote,
  rulesOnlyReview,
  strengthsFor,
  uniqueTexts,
  workerExplanationFor,
} from "@/lib/review/templates";

const cleanChecks = () => runChecks(reviewContext(), settings);
const problemChecks = () =>
  runChecks(
    withOrder({ standardHours: 2 }, { materials: [materialLine({ quantity: 1.2 })], lockouts: [] }),
    settings,
  );

describe("rules-only texts", () => {
  it("lists strengths from passed checks", () => {
    expect(strengthsFor(cleanChecks())).toEqual([
      "Наряд закрыт полностью: работы, шифр и материалы указаны",
      "Материалы списаны в пределах нормы",
      "Материалы соответствуют виду неисправности",
      "Работа выполнена в нормативное время",
    ]);
  });

  it("lists improvements with failures first", () => {
    expect(improvementsFor(problemChecks())).toEqual([
      "Оформляйте блокировку LOTO до начала работ",
      "Поясните перерасход: Набивка сальниковая (+50% к максимуму нормы)",
      "Время работы превысило норматив на 50%, укажите причину задержки",
    ]);
    expect(failedImprovements(problemChecks())).toEqual([
      "Оформляйте блокировку LOTO до начала работ",
    ]);
  });

  it("deduplicates texts and respects the limit", () => {
    expect(uniqueTexts(["a", " A ", "", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  it("explains the verdict to the worker", () => {
    expect(workerExplanationFor("accepted", 96, [])).toBe(
      "Наряд принят без замечаний. Оценка: 96 из 100. Так держать! Окончательное решение примет мастер.",
    );
    expect(workerExplanationFor("rework", 40, ["Приложите фото.", "Опишите работы"])).toBe(
      "Наряд требует доработки. Оценка: 40 из 100. Что улучшить: Приложите фото; Опишите работы. Окончательное решение примет мастер.",
    );
  });

  it("explains the verdict in Kazakh as well", () => {
    expect(workerExplanationFor("accepted_with_remarks", 70, [], "kk")).toContain(
      "Наряд ескертулермен қабылданды",
    );
  });

  it("summarises failures, remarks and time for the master", () => {
    const checks = problemChecks();
    const text = masterExplanationFor(scoreChecks(checks), checks);
    expect(text).toBe(
      "Проверка по правилам, без LLM. Оценка 13 из 100. Не пройдено: Блокировка LOTO. Замечания: Материалы против нормы, Время против норматива и срока. Время: Факт 3 ч при нормативе 2 ч. Норматив превышен на 50%.",
    );
    const clean = cleanChecks();
    expect(masterExplanationFor(scoreChecks(clean), clean)).toContain(
      "Все применимые проверки пройдены.",
    );
  });

  it("builds notes for capped and mismatched reviews", () => {
    expect(capNoteFor(problemChecks())).toBe(
      "Вердикт ограничен правилами, не пройдено: Блокировка LOTO.",
    );
    expect(mismatchNote()).toContain("не соответствуют описанной проблеме");
  });

  it("produces a complete rules-only review", () => {
    const checks = problemChecks();
    const review = rulesOnlyReview(scoreChecks(checks), checks);
    expect(review).toMatchObject({
      verdict: "rework",
      score: 13,
      rating: 1,
      confidence: null,
      needsMasterReview: true,
      usedLlm: false,
      model: null,
      problemMatchesWork: null,
    });
    expect(review.improvements).toHaveLength(3);
    expect(review.workerExplanation).toContain("Наряд требует доработки");
  });

  it("does not flag a clean rules-only review for the master", () => {
    const checks = cleanChecks();
    expect(rulesOnlyReview(scoreChecks(checks), checks).needsMasterReview).toBe(false);
  });
});
