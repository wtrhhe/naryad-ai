import type { Rng } from "./random";
import { MS_PER_HOUR, MS_PER_MINUTE } from "./time";
import type { WorkOrderAction, WorkOrderKind, WorkOrderPriority, WorkOrderStatus } from "./types";

export type StepActor = "master" | "initial" | "executor" | "system";
export type StopPoint = "issued" | "queued" | "accepted" | "in_progress" | "paused";

export type TimelineStep = {
  readonly action: WorkOrderAction;
  readonly from: WorkOrderStatus | null;
  readonly to: WorkOrderStatus | null;
  readonly offsetMs: number;
  readonly actor: StepActor;
  readonly reasonKind?: "reject" | "pause";
  readonly comment?: string;
  readonly payload?: Readonly<Record<string, string | number | boolean | null>>;
};

export type PlacedStep = TimelineStep & { readonly atMs: number };

export type TimelineOptions = {
  readonly kind: WorkOrderKind;
  readonly priority: WorkOrderPriority;
  readonly standardHours: number;
  readonly speedFactor: number;
  readonly queueWaitMs: number;
  readonly rejected: boolean;
  readonly cancelled: boolean;
  readonly pauseCount: number;
  readonly reworkCount: number;
  readonly escalateTo: WorkOrderPriority | null;
  readonly stopAt: StopPoint | null;
};

export type TimelinePlan = {
  readonly steps: readonly TimelineStep[];
  readonly totalMs: number;
  readonly pausedMs: number;
};

type Range = readonly [number, number];

const ACCEPT_DELAY_MINUTES: Readonly<Record<WorkOrderPriority, Range>> = {
  emergency: [0.5, 3],
  high: [1.5, 8],
  normal: [3, 18],
  planned: [5, 40],
};
const START_DELAY_MINUTES: Range = [8, 35];
const REJECT_DELAY_MINUTES: Range = [3, 12];
const REASSIGN_DELAY_MINUTES: Range = [2, 10];
const QUEUE_MARK_MS = MS_PER_MINUTE;
const QUEUE_ACCEPT_MINUTES: Range = [1, 5];
const PAUSE_MINUTES: Range = [8, 55];
const SUBMIT_DELAY_MINUTES: Range = [3, 15];
const REVIEW_DECISION_MINUTES: Range = [5, 150];
const RETURN_DELAY_MINUTES: Range = [20, 180];
const REWORK_RESTART_MINUTES: Range = [10, 90];
const REWORK_WORK_SHARE: Range = [0.2, 0.5];
const CANCEL_DELAY_MINUTES: Range = [10, 90];
const WORK_NOISE_DEVIATION = 0.18;
const MIN_WORK_NOISE = 0.55;
const MAX_WORK_NOISE = 1.8;
const COMMENT_CHANCE = 0.06;
const PRIORITY_CHANGE_DELAY_MS = 30_000;
const CANCEL_COMMENTS = [
  "Ложный вызов, неисправность устранена силами оператора",
  "Заявка дублирует действующий наряд",
  "Работа перенесена на плановый ремонт",
];
const WORK_COMMENTS = [
  "Заказал недостающие детали, продолжаю работу",
  "Требуется помощь второго слесаря для демонтажа",
  "Обнаружен дополнительный износ соседнего узла",
];

const draw = (rng: Rng, [low, high]: Range): number => rng.float(low, high);
const minutes = (rng: Rng, range: Range): number => Math.round(draw(rng, range) * MS_PER_MINUTE);

type Cursor = { readonly steps: readonly TimelineStep[]; readonly offsetMs: number };

const append = (cursor: Cursor, step: Omit<TimelineStep, "offsetMs">, delayMs: number): Cursor => {
  const offsetMs = cursor.offsetMs + delayMs;
  return { steps: [...cursor.steps, { ...step, offsetMs }], offsetMs };
};

function workDurationMs(options: TimelineOptions, rng: Rng): number {
  const noise = Math.min(
    MAX_WORK_NOISE,
    Math.max(MIN_WORK_NOISE, rng.normal(1, WORK_NOISE_DEVIATION)),
  );
  return Math.round(options.standardHours * options.speedFactor * noise * MS_PER_HOUR);
}

function openingSteps(options: TimelineOptions, rng: Rng): Cursor {
  let cursor = append(
    { steps: [], offsetMs: 0 },
    { action: "issue", from: null, to: "issued", actor: "master" },
    0,
  );
  if (options.escalateTo) {
    cursor = append(
      cursor,
      {
        action: "change_priority",
        from: null,
        to: null,
        actor: "master",
        payload: { from: options.priority, to: options.escalateTo },
      },
      PRIORITY_CHANGE_DELAY_MS,
    );
  }
  if (options.cancelled) {
    return append(
      cursor,
      {
        action: "cancel",
        from: "issued",
        to: "cancelled",
        actor: "master",
        comment: rng.pick(CANCEL_COMMENTS),
      },
      minutes(rng, CANCEL_DELAY_MINUTES),
    );
  }
  if (options.rejected) {
    cursor = append(
      cursor,
      { action: "reject", from: "issued", to: "rejected", actor: "initial", reasonKind: "reject" },
      minutes(rng, REJECT_DELAY_MINUTES),
    );
    cursor = append(
      cursor,
      { action: "reassign", from: "rejected", to: "issued", actor: "master" },
      minutes(rng, REASSIGN_DELAY_MINUTES),
    );
  }
  return cursor;
}

function acceptanceSteps(cursor: Cursor, options: TimelineOptions, rng: Rng): Cursor {
  const normalAcceptAt = cursor.offsetMs + minutes(rng, ACCEPT_DELAY_MINUTES[options.priority]);
  if (options.queueWaitMs <= 0) {
    return append(
      cursor,
      { action: "accept", from: "issued", to: "accepted", actor: "executor" },
      normalAcceptAt - cursor.offsetMs,
    );
  }
  const queued = append(
    cursor,
    { action: "queue", from: "issued", to: "queued", actor: "system", payload: { position: 1 } },
    QUEUE_MARK_MS,
  );
  const acceptAt = Math.max(
    normalAcceptAt,
    cursor.offsetMs + options.queueWaitMs + minutes(rng, QUEUE_ACCEPT_MINUTES),
  );
  return append(
    queued,
    { action: "accept", from: "queued", to: "accepted", actor: "executor" },
    acceptAt - queued.offsetMs,
  );
}

function workSteps(cursor: Cursor, options: TimelineOptions, rng: Rng): Cursor {
  let current = append(
    cursor,
    { action: "start", from: "accepted", to: "in_progress", actor: "executor" },
    minutes(rng, startDelayRange(options)),
  );
  const segmentMs = Math.round(workDurationMs(options, rng) / (options.pauseCount + 1));
  for (let pauseIndex = 0; pauseIndex < options.pauseCount; pauseIndex += 1) {
    current = append(
      current,
      {
        action: "pause",
        from: "in_progress",
        to: "paused",
        actor: "executor",
        reasonKind: "pause",
      },
      segmentMs,
    );
    current = append(
      current,
      { action: "resume", from: "paused", to: "in_progress", actor: "executor" },
      minutes(rng, PAUSE_MINUTES),
    );
  }
  if (rng.chance(COMMENT_CHANCE)) {
    current = append(
      current,
      {
        action: "comment",
        from: null,
        to: null,
        actor: "executor",
        comment: rng.pick(WORK_COMMENTS),
      },
      Math.round(segmentMs / 3),
    );
  }
  return append(
    current,
    { action: "complete", from: "in_progress", to: "done", actor: "executor" },
    segmentMs,
  );
}

function startDelayRange(options: TimelineOptions): Range {
  return options.priority === "emergency" ? [5, 20] : START_DELAY_MINUTES;
}

function reviewSteps(cursor: Cursor, options: TimelineOptions, rng: Rng): Cursor {
  let current = append(
    cursor,
    { action: "submit_review", from: "done", to: "ai_review", actor: "executor" },
    minutes(rng, SUBMIT_DELAY_MINUTES),
  );
  for (let round = 0; round < options.reworkCount; round += 1) {
    current = append(
      current,
      { action: "return_rework", from: "ai_review", to: "rework", actor: "master" },
      minutes(rng, RETURN_DELAY_MINUTES),
    );
    current = append(
      current,
      { action: "start", from: "rework", to: "in_progress", actor: "executor" },
      minutes(rng, REWORK_RESTART_MINUTES),
    );
    const reworkMs = Math.round(
      options.standardHours * options.speedFactor * draw(rng, REWORK_WORK_SHARE) * MS_PER_HOUR,
    );
    current = append(
      current,
      { action: "complete", from: "in_progress", to: "done", actor: "executor" },
      reworkMs,
    );
    current = append(
      current,
      { action: "submit_review", from: "done", to: "ai_review", actor: "executor" },
      minutes(rng, SUBMIT_DELAY_MINUTES),
    );
  }
  return append(
    current,
    { action: "approve", from: "ai_review", to: "closed", actor: "master" },
    minutes(rng, REVIEW_DECISION_MINUTES),
  );
}

function truncateAt(
  steps: readonly TimelineStep[],
  stopAt: StopPoint | null,
): readonly TimelineStep[] {
  if (stopAt === null) return steps;
  const stopIndex = steps.findIndex((step) => step.to === stopAt);
  return stopIndex === -1 ? steps : steps.slice(0, stopIndex + 1);
}

function pausedDuration(steps: readonly TimelineStep[]): number {
  return steps.reduce((total, step, index) => {
    if (step.action !== "resume") return total;
    const pause = steps
      .slice(0, index)
      .reverse()
      .find((candidate) => candidate.action === "pause");
    return total + (pause ? step.offsetMs - pause.offsetMs : 0);
  }, 0);
}

export function planTimeline(options: TimelineOptions, rng: Rng): TimelinePlan {
  const opened = openingSteps(options, rng);
  const lastOpeningStep = opened.steps.at(-1);
  const steps =
    options.cancelled && lastOpeningStep?.action === "cancel"
      ? opened.steps
      : reviewSteps(workSteps(acceptanceSteps(opened, options, rng), options, rng), options, rng)
          .steps;
  const truncated = truncateAt(steps, options.stopAt);
  return {
    steps: truncated,
    totalMs: truncated.at(-1)?.offsetMs ?? 0,
    pausedMs: pausedDuration(truncated),
  };
}

export function placeSteps(
  steps: readonly TimelineStep[],
  issuedAtMs: number,
  scale: number,
): PlacedStep[] {
  return steps.map((step) => ({ ...step, atMs: issuedAtMs + Math.round(step.offsetMs * scale) }));
}
