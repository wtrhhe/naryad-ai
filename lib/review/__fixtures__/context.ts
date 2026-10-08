import {
  DEFAULT_REVIEW_SETTINGS,
  type ReviewContext,
  type ReviewMaterialLine,
  type ReviewPhoto,
  type ReviewSettings,
} from "@/lib/review/types";

export const STARTED_AT = "2026-10-11T08:00:00+05:00";
export const DONE_AT = "2026-10-11T11:00:00+05:00";
export const DUE_AT = "2026-10-11T14:00:00+05:00";

export function shiftMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

export function materialLine(overrides: Partial<ReviewMaterialLine> = {}): ReviewMaterialLine {
  return {
    materialId: "material-gland",
    code: "PKG-GLAND",
    name: "Набивка сальниковая",
    unit: "кг",
    quantity: 0.5,
    categories: ["mechanical"],
    norm: { min: 0.3, typical: 0.5, max: 0.8 },
    historyMedian: 0.5,
    historyCount: 20,
    ...overrides,
  };
}

export function photo(overrides: Partial<ReviewPhoto> = {}): ReviewPhoto {
  return {
    id: "photo-after",
    kind: "after",
    takenAt: shiftMinutes(DONE_AT, -5),
    receivedAt: shiftMinutes(DONE_AT, -4),
    phash: "ffffffffffffffff",
    ghostScore: 0.86,
    forcedReason: null,
    ...overrides,
  };
}

export function reviewContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    order: {
      id: "order-1",
      number: 501,
      kind: "unplanned",
      description: "Течь сальника насоса Н-4",
      workPerformed: "Заменена сальниковая набивка, подтянута крышка сальника, утечки нет",
      closeComment: null,
      faultCodeId: "fault-m05",
      standardHours: null,
      dueAt: DUE_AT,
      startedAt: STARTED_AT,
      doneAt: DONE_AT,
      pausedSeconds: 0,
      reworkCount: 0,
    },
    equipment: { name: "Насос Н-4", type: "pump", requiresLockout: true },
    faultCode: {
      id: "fault-m05",
      code: "М-05",
      name: "Течь сальникового уплотнения",
      category: "mechanical",
      standardHours: 3,
    },
    materials: [materialLine()],
    requiredMaterials: [{ materialId: "material-gland", name: "Набивка сальниковая", min: 0.3 }],
    photos: [
      photo({
        id: "photo-before",
        kind: "before",
        takenAt: shiftMinutes(STARTED_AT, -5),
        receivedAt: shiftMinutes(STARTED_AT, -4),
        phash: "0000000000000000",
        ghostScore: null,
      }),
      photo(),
    ],
    photoMatches: [],
    lockouts: [{ lockedAt: shiftMinutes(STARTED_AT, -10), releasedAt: null }],
    acoustic: [],
    events: [
      { action: "start", occurredAt: STARTED_AT },
      { action: "complete", occurredAt: DONE_AT },
    ],
    ...overrides,
  };
}

export function withOrder(
  overrides: Partial<ReviewContext["order"]>,
  rest: Partial<ReviewContext> = {},
): ReviewContext {
  const base = reviewContext(rest);
  return { ...base, order: { ...base.order, ...overrides } };
}

export const settings: ReviewSettings = DEFAULT_REVIEW_SETTINGS;
