import { describe, expect, it } from "vitest";
import { anonymizeText, nameParts } from "@/lib/review/anonymize";
import {
  historyByMaterial,
  parsePeaks,
  toReviewContext,
  type ReviewRows,
} from "@/lib/review/context";
import { buildReviewNotifications } from "@/lib/review/notify";
import { toReviewSettings } from "@/lib/review/settings";
import { pickStuckOrders, waitingSince, type PendingOrderRow } from "@/lib/review/stuck";
import { DEFAULT_REVIEW_SETTINGS } from "@/lib/review/types";

describe("anonymizeText", () => {
  const people = [{ fullName: "Ахметов Ерлан", alias: "И-1" }];

  it("replaces full names and their parts regardless of case", () => {
    expect(anonymizeText("ахметов и Ерлан, АХМЕТОВ ЕРЛАН", people)).toBe("И-1 и И-1, И-1");
  });

  it("does not replace parts of other words", () => {
    expect(anonymizeText("Ахметова Ерланбек", people)).toBe("Ахметова Ерланбек");
  });

  it("hides phone numbers and e-mails", () => {
    expect(anonymizeText("тел. 8 (701) 555-12-34, mail a.b@plant.kz", [])).toBe(
      "тел. [phone], mail [email]",
    );
  });

  it("splits names into searchable parts", () => {
    expect(nameParts("  Ли  Ан Ерлан ")).toEqual(["Ли Ан Ерлан", "Ерлан"]);
  });
});

describe("toReviewSettings", () => {
  it("reads numbers from JSON values", () => {
    expect(
      toReviewSettings([
        { key: "review.material_overuse_percent", value: 30 },
        { key: "review.low_confidence_threshold", value: "0.7" },
        { key: "ghost.min_alignment", value: 0.65 },
      ]),
    ).toEqual({ materialOverusePercent: 30, lowConfidenceThreshold: 0.7, ghostMinAlignment: 0.65 });
  });

  it("falls back to defaults for missing or invalid values", () => {
    expect(
      toReviewSettings([
        { key: "review.low_confidence_threshold", value: 4 },
        { key: "ghost.min_alignment", value: { bad: true } },
      ]),
    ).toEqual(DEFAULT_REVIEW_SETTINGS);
  });
});

function rows(overrides: Partial<ReviewRows> = {}): ReviewRows {
  return {
    order: {
      id: "order-9",
      number: 9,
      kind: "planned",
      status: "ai_review",
      description: "Плановая замена смазки",
      work_performed: "Заменена смазка",
      close_comment: null,
      fault_code_id: "fault-1",
      standard_hours: null,
      due_at: null,
      started_at: "2026-10-11T08:00:00Z",
      done_at: "2026-10-11T09:00:00Z",
      paused_seconds: 0,
      rework_count: 1,
      assignee_id: "worker-1",
      brigade_id: null,
      master_id: "master-1",
      equipment: { name: "Мельница", equipment_type: "mill", requires_lockout: true },
      fault_code: {
        id: "fault-1",
        code: "С-01",
        name: "Недостаток смазки",
        category: "lubrication",
        standard_hours: 1.5,
      },
    },
    writeoffs: [
      {
        material_id: "grease",
        quantity: 2,
        material: { code: "GREASE", name: "Смазка EP-2", unit: "кг", categories: ["lubrication"] },
      },
      { material_id: "ghost", quantity: 1, material: null },
    ],
    norms: [
      {
        material_id: "grease",
        qty_min: 1,
        qty_typical: 2,
        qty_max: 3,
        material: { name: "Смазка" },
      },
      { material_id: "rag", qty_min: 0, qty_typical: 1, qty_max: 2, material: null },
    ],
    history: [
      { material_id: "grease", quantity: 2 },
      { material_id: "grease", quantity: 4 },
      { material_id: "grease", quantity: 3 },
    ],
    photos: [
      {
        id: "p1",
        kind: "after",
        taken_at: null,
        received_at: "2026-10-11T09:00:00Z",
        phash: "0000000000000000",
        ghost_score: 0.9,
        forced_reason: null,
      },
    ],
    matches: [
      {
        photo_id: "p1",
        match_photo_id: "p0",
        match_order_id: "order-1",
        match_order_number: 1,
        distance: 2,
      },
    ],
    lockouts: [{ locked_at: "2026-10-11T07:55:00Z", released_at: null }],
    acoustic: [
      {
        kind: "before",
        rms: 0.1,
        spectral_kurtosis: null,
        peaks: [{ f: 74.5, db: 50, label: "BPFO" }, { bad: true }],
        recorded_at: "2026-10-11T07:50:00Z",
      },
    ],
    events: [{ action: "start", occurred_at: "2026-10-11T08:00:00Z" }],
    ...overrides,
  };
}

describe("toReviewContext", () => {
  it("maps database rows into the check context", () => {
    const context = toReviewContext(rows());
    expect(context.order).toMatchObject({ number: 9, kind: "planned", reworkCount: 1 });
    expect(context.equipment).toEqual({ name: "Мельница", type: "mill", requiresLockout: true });
    expect(context.faultCode).toMatchObject({ code: "С-01", standardHours: 1.5 });
    expect(context.materials[0]).toMatchObject({
      name: "Смазка EP-2",
      norm: { min: 1, typical: 2, max: 3 },
      historyMedian: 3,
      historyCount: 3,
    });
    expect(context.materials[1]).toMatchObject({ name: "ghost", norm: null, categories: [] });
    expect(context.requiredMaterials).toEqual([{ materialId: "grease", name: "Смазка", min: 1 }]);
    expect(context.photos[0]).toMatchObject({ takenAt: null, ghostScore: 0.9 });
    expect(context.photoMatches[0]).toMatchObject({ matchOrderNumber: 1, distance: 2 });
    expect(context.acoustic[0]?.peaks).toEqual([{ f: 74.5, db: 50, label: "BPFO" }]);
    expect(context.events).toEqual([{ action: "start", occurredAt: "2026-10-11T08:00:00Z" }]);
  });

  it("tolerates missing joins", () => {
    const base = rows();
    const context = toReviewContext(
      rows({ order: { ...base.order, equipment: null, fault_code: null } }),
    );
    expect(context.equipment).toEqual({ name: "", type: "other", requiresLockout: false });
    expect(context.faultCode).toBeNull();
  });

  it("parses only valid peaks and groups history", () => {
    expect(parsePeaks(null)).toEqual([]);
    expect(parsePeaks([{ f: "10", db: 3 }])).toEqual([{ f: 10, db: 3 }]);
    expect(historyByMaterial([]).size).toBe(0);
  });
});

describe("buildReviewNotifications", () => {
  const base = {
    orderId: "order-1",
    orderNumber: 147,
    revision: 0,
    equipmentName: "Насос Н-4",
    review: { verdict: "rework" as const, score: 41, needsMasterReview: false, usedLlm: false },
    master: { id: "master-1", locale: "ru" as const },
    workers: [{ id: "worker-1", locale: "kk" as const }],
  };

  it("notifies the master urgently on rework and the worker in their language", () => {
    const [master, worker] = buildReviewNotifications(base);
    expect(master).toMatchObject({
      recipient_id: "master-1",
      kind: "review_ready",
      title: "Проверка ИИ: наряд №147",
      body: "Рекомендована доработка, оценка 41 из 100. Насос Н-4. Нужна ваша проверка.",
      is_urgent: true,
      dedupe_key: "review_ready:order-1:0:master-1",
      payload: { url: "/master/orders/order-1", order_number: 147, verdict: "rework", score: 41 },
    });
    expect(worker).toMatchObject({
      recipient_id: "worker-1",
      kind: "review_result",
      title: "№147 нарядты тексеру",
      is_urgent: false,
      dedupe_key: "review_result:order-1:0:worker-1",
      payload: { url: "/worker/orders/order-1" },
    });
  });

  it("asks only to confirm an accepted order", () => {
    const [master] = buildReviewNotifications({
      ...base,
      review: { verdict: "accepted", score: 92, needsMasterReview: false, usedLlm: true },
    });
    expect(master?.is_urgent).toBe(false);
    expect(master?.body).toBe(
      "Принят без замечаний, оценка 92 из 100. Насос Н-4. Подтвердите закрытие.",
    );
  });

  it("skips missing recipients and duplicates", () => {
    const result = buildReviewNotifications({
      ...base,
      master: null,
      workers: [base.workers[0]!, base.workers[0]!],
    });
    expect(result.map((row) => row.recipient_id)).toEqual(["worker-1"]);
  });
});

describe("pickStuckOrders", () => {
  const now = new Date("2026-10-11T10:00:00Z");
  const order = (overrides: Partial<PendingOrderRow>): PendingOrderRow => ({
    id: "o",
    status: "done",
    rework_count: 0,
    done_at: "2026-10-11T09:50:00Z",
    review_started_at: null,
    updated_at: "2026-10-11T09:50:00Z",
    ...overrides,
  });

  it("picks orders waiting longer than two minutes without a review for their revision", () => {
    const orders = [
      order({ id: "fresh", done_at: "2026-10-11T09:59:00Z" }),
      order({ id: "done-old", done_at: "2026-10-11T09:40:00Z" }),
      order({ id: "reviewed", status: "ai_review", review_started_at: "2026-10-11T09:30:00Z" }),
      order({
        id: "rework-again",
        status: "ai_review",
        rework_count: 1,
        review_started_at: "2026-10-11T09:20:00Z",
      }),
      order({ id: "closed", status: "closed" }),
    ];
    const reviews = [
      { work_order_id: "reviewed", revision: 0 },
      { work_order_id: "rework-again", revision: 0 },
    ];
    expect(pickStuckOrders(orders, reviews, now)).toEqual(["rework-again", "done-old"]);
    expect(pickStuckOrders(orders, reviews, now, 1)).toEqual(["rework-again"]);
  });

  it("measures the wait from the most relevant timestamp", () => {
    expect(waitingSince(order({ status: "ai_review", review_started_at: null }))).toBe(
      "2026-10-11T09:50:00Z",
    );
    expect(waitingSince(order({ done_at: null, updated_at: "x" }))).toBe("x");
    expect(waitingSince(order({ status: "ai_review", done_at: null, updated_at: "y" }))).toBe("y");
  });
});
