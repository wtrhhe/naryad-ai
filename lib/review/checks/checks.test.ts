import { describe, expect, it } from "vitest";
import {
  DONE_AT,
  DUE_AT,
  materialLine,
  photo,
  reviewContext,
  settings,
  shiftMinutes,
  STARTED_AT,
  withOrder,
} from "@/lib/review/__fixtures__/context";
import { runChecks } from "@/lib/review/checks";
import { checkCompleteness } from "@/lib/review/checks/completeness";
import { checkLockout } from "@/lib/review/checks/lockout";
import { checkMaterialCategory } from "@/lib/review/checks/material-category";
import { checkMaterialNorms, median, overPercent } from "@/lib/review/checks/material-norms";
import { closestMatches, checkPhotos, hammingDistance } from "@/lib/review/checks/photos";
import { maxSeverity, messageValues, round, statusOf } from "@/lib/review/checks/result";
import {
  checkTime,
  lateMinutes,
  reworkGapSeconds,
  standardHoursOf,
  workSeconds,
} from "@/lib/review/checks/time";
import { CHECK_KEYS } from "@/lib/review/types";

const codes = (result: { findings: { code: string }[] }) =>
  result.findings.map((item) => item.code);

describe("runChecks", () => {
  it("returns every check in a stable order", () => {
    expect(runChecks(reviewContext(), settings).map((check) => check.key)).toEqual([...CHECK_KEYS]);
  });

  it("passes a clean order and renders Russian labels and details", () => {
    const checks = runChecks(reviewContext(), settings);
    expect(checks.filter((check) => check.status === "warn" || check.status === "fail")).toEqual(
      [],
    );
    const time = checks.find((check) => check.key === "time");
    expect(time?.label).toBe("Время против норматива и срока");
    expect(time?.detail).toBe("Факт 3 ч при нормативе 3 ч");
    expect(time?.passed).toBe(true);
    expect(checks.find((check) => check.key === "acoustic")?.status).toBe("skip");
  });
});

describe("completeness", () => {
  it("passes with work text, fault code, materials and an after photo", () => {
    const result = checkCompleteness(reviewContext());
    expect(result).toMatchObject({ status: "pass", passed: true, code: "completeness_ok" });
  });

  it("fails without work text or fault code", () => {
    const result = checkCompleteness(
      withOrder({ workPerformed: "  " }, { faultCode: null, requiredMaterials: [] }),
    );
    expect(result.status).toBe("fail");
    expect(result.severity).toBe("high");
    expect(result.passed).toBe(false);
    expect(codes(result)).toEqual(["no_work", "no_fault_code"]);
    expect(result.detail).toContain("Не заполнено: 2 пункта");
  });

  it("warns about a too brief description", () => {
    const result = checkCompleteness(withOrder({ workPerformed: "Заменил" }));
    expect(result.status).toBe("warn");
    expect(result.severity).toBe("low");
    expect(result.findings[0]?.values).toEqual({ length: 7 });
  });

  it("warns when the norm expects materials but none were written off", () => {
    const result = checkCompleteness(reviewContext({ materials: [] }));
    expect(codes(result)).toEqual(["no_materials"]);
    expect(result.detail).toContain("норма шифра М-05");
  });

  it("does not ask for materials when the norm does not require them", () => {
    const result = checkCompleteness(reviewContext({ materials: [], requiredMaterials: [] }));
    expect(result.status).toBe("pass");
  });

  it("requires an after photo only for unplanned orders", () => {
    const noPhotos = { photos: [] };
    expect(codes(checkCompleteness(reviewContext(noPhotos)))).toEqual(["no_after_photo"]);
    expect(checkCompleteness(withOrder({ kind: "planned" }, noPhotos)).status).toBe("pass");
  });
});

describe("material norms", () => {
  it("skips when nothing was written off", () => {
    const result = checkMaterialNorms(reviewContext({ materials: [] }), settings);
    expect(result).toMatchObject({ status: "skip", passed: true, code: "materials_none" });
  });

  it("skips when there is nothing to compare with", () => {
    const line = materialLine({ norm: null, historyMedian: null, historyCount: 0 });
    const result = checkMaterialNorms(reviewContext({ materials: [line] }), settings);
    expect(result).toMatchObject({ status: "skip", code: "materials_no_norm" });
  });

  it("passes within the norm and the tolerance above the maximum", () => {
    const line = materialLine({ quantity: 0.95, historyMedian: 0.9 });
    const result = checkMaterialNorms(reviewContext({ materials: [line] }), settings);
    expect(result).toMatchObject({ status: "pass", code: "materials_ok", values: { count: 1 } });
  });

  it("warns when the maximum is exceeded by more than the configured percent", () => {
    const line = materialLine({ quantity: 1.2 });
    const result = checkMaterialNorms(reviewContext({ materials: [line] }), settings);
    expect(result.status).toBe("warn");
    expect(result.severity).toBe("medium");
    expect(result.findings[0]).toMatchObject({
      code: "over_max",
      values: { quantity: 1.2, max: 0.8, percent: 50 },
    });
    expect(result.detail).toBe(
      "Перерасход по позициям: 1. Набивка сальниковая: 1,2 кг при норме до 0,8 кг (+50%)",
    );
  });

  it("fails on gross overuse beyond four tolerances", () => {
    const line = materialLine({ quantity: 2 });
    const result = checkMaterialNorms(reviewContext({ materials: [line] }), settings);
    expect(result.status).toBe("fail");
    expect(result.findings[0]?.values.percent).toBe(150);
  });

  it("honours a stricter configured tolerance", () => {
    const line = materialLine({ quantity: 0.9, historyMedian: 0.85 });
    const strict = { ...settings, materialOverusePercent: 10 };
    expect(checkMaterialNorms(reviewContext({ materials: [line] }), strict).status).toBe("warn");
    expect(checkMaterialNorms(reviewContext({ materials: [line] }), settings).status).toBe("pass");
  });

  it("compares with the historical median when above the typical norm", () => {
    const line = materialLine({ quantity: 0.75, historyMedian: 0.4, historyCount: 12 });
    const result = checkMaterialNorms(reviewContext({ materials: [line] }), settings);
    expect(result.status).toBe("warn");
    expect(result.severity).toBe("low");
    expect(result.findings[0]).toMatchObject({
      code: "over_median",
      values: { median: 0.4, percent: 88 },
    });
  });

  it("ignores the median when the quantity is at the typical norm or history is thin", () => {
    const typical = materialLine({ quantity: 0.5, historyMedian: 0.2 });
    const thin = materialLine({ quantity: 0.75, historyMedian: 0.3, historyCount: 3 });
    expect(checkMaterialNorms(reviewContext({ materials: [typical] }), settings).status).toBe(
      "pass",
    );
    expect(checkMaterialNorms(reviewContext({ materials: [thin] }), settings).status).toBe("pass");
  });

  it("uses the median for materials without a norm", () => {
    const line = materialLine({ norm: null, quantity: 3, historyMedian: 1, historyCount: 9 });
    const result = checkMaterialNorms(reviewContext({ materials: [line] }), settings);
    expect(codes(result)).toEqual(["over_median"]);
  });

  it("computes the median and overuse percent", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(overPercent(1.25, 1)).toBe(25);
  });
});

describe("material category", () => {
  it("skips without a fault code or materials", () => {
    expect(checkMaterialCategory(reviewContext({ faultCode: null })).code).toBe("category_skip");
    expect(checkMaterialCategory(reviewContext({ materials: [] })).code).toBe("category_none");
  });

  it("passes materials of the fault category", () => {
    const result = checkMaterialCategory(reviewContext());
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("Материалы соответствуют категории шифра: механика");
  });

  it("warns about electrical materials on a mechanical fault code", () => {
    const cable = materialLine({
      materialId: "material-cable",
      name: "Кабель КГ 3×25",
      unit: "м",
      categories: ["electrical"],
      norm: null,
    });
    const result = checkMaterialCategory(reviewContext({ materials: [materialLine(), cable] }));
    expect(result.status).toBe("warn");
    expect(result.severity).toBe("medium");
    expect(result.findings).toHaveLength(1);
    expect(result.detail).toBe(
      "Не по профилю шифра: 1 поз. Кабель КГ 3×25: материал для работ «электрика», а шифр — «механика»",
    );
  });

  it("trusts an explicit norm even when categories differ", () => {
    const normed = materialLine({ categories: ["electrical"] });
    expect(checkMaterialCategory(reviewContext({ materials: [normed] })).status).toBe("pass");
  });
});

describe("time", () => {
  it("skips when the order was never started or completed", () => {
    expect(checkTime(withOrder({ startedAt: null })).status).toBe("skip");
    expect(checkTime(withOrder({ doneAt: null })).code).toBe("time_unknown");
  });

  it("subtracts pauses and rework gaps from the elapsed time", () => {
    const events = [
      { action: "start", occurredAt: STARTED_AT },
      { action: "complete", occurredAt: shiftMinutes(STARTED_AT, 60) },
      { action: "start", occurredAt: shiftMinutes(STARTED_AT, 120) },
      { action: "complete", occurredAt: DONE_AT },
    ];
    expect(reworkGapSeconds(events)).toBe(3600);
    expect(
      workSeconds({ startedAt: STARTED_AT, doneAt: DONE_AT, pausedSeconds: 1800, events }),
    ).toBe(3 * 3600 - 3600 - 1800);
    expect(workSeconds({ startedAt: STARTED_AT, doneAt: null, pausedSeconds: 0, events })).toBe(
      null,
    );
  });

  it("never reports negative work time", () => {
    expect(
      workSeconds({ startedAt: DONE_AT, doneAt: STARTED_AT, pausedSeconds: 0, events: [] }),
    ).toBe(0);
  });

  it("prefers the order standard over the fault code standard", () => {
    expect(standardHoursOf({ standardHours: 2 }, { standardHours: 3 })).toBe(2);
    expect(standardHoursOf({ standardHours: null }, { standardHours: 3 })).toBe(3);
    expect(standardHoursOf({ standardHours: null }, null)).toBeNull();
  });

  it("warns when the actual time exceeds the standard by more than 25%", () => {
    const result = checkTime(withOrder({ standardHours: 2 }));
    expect(result.status).toBe("warn");
    expect(result.severity).toBe("medium");
    expect(result.findings[0]).toMatchObject({ code: "over_standard", values: { percent: 50 } });
    expect(result.values).toMatchObject({ actual: 3, standard: 2, percent: 150 });
  });

  it("raises severity when the standard is doubled", () => {
    expect(checkTime(withOrder({ standardHours: 1 })).severity).toBe("high");
  });

  it("tolerates up to 25% over the standard", () => {
    expect(checkTime(withOrder({ standardHours: 2.5 })).status).toBe("pass");
  });

  it("flags a suspiciously fast completion", () => {
    const result = checkTime(withOrder({ standardHours: 20 }));
    expect(codes(result)).toEqual(["too_fast"]);
    expect(result.severity).toBe("low");
  });

  it("warns when completed after the deadline", () => {
    const result = checkTime(withOrder({ dueAt: shiftMinutes(DONE_AT, -45) }));
    expect(codes(result)).toEqual(["overdue"]);
    expect(result.values.lateMinutes).toBe(45);
    expect(result.detail).toContain("Завершено позже срока на 45 мин");
  });

  it("reports the missing standard", () => {
    const result = checkTime(withOrder({ standardHours: null }, { faultCode: null }));
    expect(result).toMatchObject({ status: "pass", code: "time_no_standard" });
    expect(result.values.standard).toBeNull();
  });

  it("computes lateness in whole minutes", () => {
    expect(lateMinutes(null, DONE_AT)).toBeNull();
    expect(lateMinutes(DUE_AT, DONE_AT)).toBe(0);
    expect(lateMinutes(DONE_AT, shiftMinutes(DONE_AT, 1.5))).toBe(2);
  });
});

describe("photos", () => {
  it("warns when there is no after photo", () => {
    const result = checkPhotos(reviewContext({ photos: [] }), settings);
    expect(result).toMatchObject({ status: "warn", severity: "low", code: "photos_none" });
  });

  it("passes a photo taken inside the work window", () => {
    const result = checkPhotos(reviewContext(), settings);
    expect(result).toMatchObject({ status: "pass", code: "photos_ok", values: { count: 1 } });
  });

  it("accepts photos within ten minutes around the window", () => {
    const early = photo({ takenAt: shiftMinutes(STARTED_AT, -9) });
    const late = photo({ id: "photo-late", takenAt: shiftMinutes(DONE_AT, 9) });
    expect(checkPhotos(reviewContext({ photos: [early, late] }), settings).status).toBe("pass");
  });

  it("warns about photos outside the work window", () => {
    const early = photo({ takenAt: shiftMinutes(STARTED_AT, -40) });
    const late = photo({ id: "photo-late", takenAt: shiftMinutes(DONE_AT, 25) });
    const result = checkPhotos(reviewContext({ photos: [early, late] }), settings);
    expect(result.status).toBe("warn");
    expect(result.findings.map((item) => item.values)).toEqual([
      { minutes: 40, direction: "before" },
      { minutes: 25, direction: "after" },
    ]);
    expect(result.detail).toContain("на 40 мин раньше начала");
    expect(result.detail).toContain("на 25 мин позже завершения");
  });

  it("falls back to the upload time when the photo has no capture time", () => {
    const untimed = photo({ takenAt: null, receivedAt: shiftMinutes(DONE_AT, 60) });
    const result = checkPhotos(reviewContext({ photos: [untimed] }), settings);
    expect(result.findings[0]?.values).toEqual({ minutes: 60, direction: "after" });
  });

  it("warns about low ghost alignment and mentions the forced reason", () => {
    const low = photo({ ghostScore: 0.42 });
    const forced = photo({ id: "photo-forced", ghostScore: 0.3, forcedReason: "Кожух закрыт" });
    const result = checkPhotos(reviewContext({ photos: [low, forced] }), settings);
    expect(codes(result)).toEqual(["low_alignment", "low_alignment_forced"]);
    expect(result.severity).toBe("medium");
    expect(result.detail).toContain("Совмещение с фото «до» 42% при пороге 70%");
    expect(result.detail).toContain("причина: «Кожух закрыт»");
  });

  it("ignores missing ghost scores", () => {
    const result = checkPhotos(reviewContext({ photos: [photo({ ghostScore: null })] }), settings);
    expect(result.status).toBe("pass");
  });

  it("warns when the after photo matches the before photo", () => {
    const before = photo({ id: "photo-before", kind: "before", phash: "0000000000000000" });
    const after = photo({ phash: "0000000000000007" });
    const result = checkPhotos(reviewContext({ photos: [before, after] }), settings);
    expect(codes(result)).toEqual(["same_as_before"]);
  });

  it("fails on a duplicate of an older photo from another order", () => {
    const result = checkPhotos(
      reviewContext({
        photoMatches: [
          {
            photoId: "photo-after",
            matchPhotoId: "old-1",
            matchOrderId: "order-old",
            matchOrderNumber: 120,
            distance: 4,
          },
          {
            photoId: "photo-after",
            matchPhotoId: "old-2",
            matchOrderId: "order-older",
            matchOrderNumber: 99,
            distance: 1,
          },
          {
            photoId: "photo-before",
            matchPhotoId: "old-3",
            matchOrderId: "order-x",
            matchOrderNumber: 5,
            distance: 0,
          },
        ],
      }),
      settings,
    );
    expect(result.status).toBe("fail");
    expect(result.passed).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.values).toEqual({ number: 99, distance: 1 });
    expect(result.detail).toContain("совпадает со снимком наряда №99");
  });

  it("keeps only the closest match within the duplicate distance", () => {
    const matches = [
      { photoId: "a", matchPhotoId: "1", matchOrderId: "o1", matchOrderNumber: 1, distance: 7 },
      { photoId: "a", matchPhotoId: "2", matchOrderId: "o2", matchOrderNumber: 2, distance: 6 },
      { photoId: "b", matchPhotoId: "3", matchOrderId: "o3", matchOrderNumber: 3, distance: 0 },
    ];
    expect(closestMatches(matches, new Set(["a"]))).toEqual([matches[1]]);
  });

  it("computes the Hamming distance of 64-bit hex hashes", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hammingDistance("0145f86da6f9db68", "0145f86da6f9db69")).toBe(1);
    expect(hammingDistance("short", "0000000000000000")).toBeNull();
  });
});

describe("lockout", () => {
  it("skips when the equipment does not require a lockout", () => {
    const context = reviewContext({
      equipment: { name: "Пульт", type: "other", requiresLockout: false },
      lockouts: [],
    });
    expect(checkLockout(context)).toMatchObject({ status: "skip", code: "lockout_not_required" });
  });

  it("passes when a lockout was applied before the start", () => {
    expect(checkLockout(reviewContext())).toMatchObject({ status: "pass", code: "lockout_ok" });
  });

  it("fails without a lockout on equipment that requires one", () => {
    const result = checkLockout(reviewContext({ lockouts: [] }));
    expect(result).toMatchObject({ status: "fail", severity: "high", code: "lockout_missing" });
  });

  it("warns when the lockout was applied after the start", () => {
    const result = checkLockout(
      reviewContext({ lockouts: [{ lockedAt: shiftMinutes(STARTED_AT, 15), releasedAt: null }] }),
    );
    expect(result.status).toBe("warn");
    expect(result.findings[0]?.values).toEqual({ minutes: 15 });
  });
});

describe("result helpers", () => {
  it("picks the worst severity and status", () => {
    expect(maxSeverity([])).toBe("none");
    expect(maxSeverity(["low", "high", "medium"])).toBe("high");
    expect(statusOf([])).toBe("pass");
  });

  it("formats message values", () => {
    expect(messageValues({ a: null, b: true, c: 2, d: "x" })).toEqual({
      a: "—",
      b: "true",
      c: 2,
      d: "x",
    });
    expect(round(1.256, 2)).toBe(1.26);
  });
});
